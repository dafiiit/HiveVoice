// No console window next to the app on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// The whole app is the live site: the window in tauri.conf.json opens it, and its service worker
// keeps opened pages readable offline. Besides the window, only the shell's own updates run here:
// a check shortly after start, "Nach Updates suchen …" in the macOS app menu, and two commands for the
// button in the site's settings (capabilities/updates.json). Updates are signed (docs/desktop.md).
mod server;

use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem, MenuItemKind};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::{Update, UpdaterExt};

/// The update found by the last check, kept until the person says yes.
#[derive(Default)]
struct Pending(Mutex<Option<Update>>);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Check {
    current: String,
    available: Option<String>,
    notes: Option<String>,
    /// The .deb and other non-AppImage Linux installs cannot replace themselves; they need the download.
    manual: bool,
}

fn self_updating() -> bool {
    !cfg!(target_os = "linux") || std::env::var_os("APPIMAGE").is_some()
}

async fn find(app: &AppHandle) -> Result<Option<Update>, String> {
    app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())
}

async fn install(app: &AppHandle, update: Update) -> Result<(), String> {
    update.download_and_install(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    app.restart();
}

#[tauri::command]
async fn update_check(app: AppHandle, pending: State<'_, Pending>) -> Result<Check, String> {
    let update = find(&app).await?;
    let check = Check {
        current: app.package_info().version.to_string(),
        available: update.as_ref().map(|u| u.version.clone()),
        notes: update.as_ref().and_then(|u| u.body.clone()),
        manual: !self_updating(),
    };
    *pending.0.lock().unwrap() = update;
    Ok(check)
}

#[tauri::command]
async fn update_install(app: AppHandle, pending: State<'_, Pending>) -> Result<(), String> {
    let update = pending.0.lock().unwrap().take();
    match update {
        Some(u) => install(&app, u).await,
        None => Err("no update".into()),
    }
}

/// Asks in a system dialog, for the check at start and from the menu. `quiet` says nothing when there is no update.
async fn ask(app: AppHandle, quiet: bool) {
    let dialog = app.dialog().clone();
    let update = match find(&app).await {
        Ok(Some(u)) => u,
        Ok(None) if !quiet => {
            let v = app.package_info().version.to_string();
            dialog.message(format!("HiveVoice {v} ist die neueste Version.")).title("Keine Updates").show(|_| {});
            return;
        }
        Err(e) if !quiet => {
            dialog.message(format!("Die Suche nach Updates hat nicht geklappt: {e}")).title("Updates").show(|_| {});
            return;
        }
        _ => return,
    };
    if !self_updating() {
        if !quiet {
            dialog.message(format!("HiveVoice {} ist da. Diese Installation (.deb) aktualisierst du über die Download-Seite oder deine Paketverwaltung.", update.version)).title("Update verfügbar").show(|_| {});
        }
        return;
    }
    let question = dialog
        .message(format!("HiveVoice {} ist da (installiert: {}). Jetzt installieren? Die App startet danach neu.", update.version, app.package_info().version))
        .title("Update verfügbar")
        .buttons(MessageDialogButtons::OkCancelCustom("Installieren".into(), "Später".into()));
    let yes = tauri::async_runtime::spawn_blocking(move || question.blocking_show()).await.unwrap_or(false);
    if yes {
        if let Err(e) = install(&app, update).await {
            dialog.message(format!("Das Update ließ sich nicht installieren: {e}")).title("Updates").show(|_| {});
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(Pending::default())
        .manage(server::Busy::default())
        .invoke_handler(tauri::generate_handler![update_check, update_install, server::server_status, server::server_setup, server::server_stop])
        .setup(|app| {
            // macOS always has a menu bar: the item goes into the app menu, under "About HiveVoice".
            if cfg!(target_os = "macos") {
                let menu = Menu::default(app.handle())?;
                let item = MenuItem::with_id(app, "updates", "Nach Updates suchen …", true, None::<&str>)?;
                if let Some(MenuItemKind::Submenu(sub)) = menu.items()?.first() {
                    sub.insert(&item, 1)?;
                }
                app.set_menu(menu)?;
                app.on_menu_event(|app, event| {
                    if event.id() == "updates" {
                        tauri::async_runtime::spawn(ask(app.clone(), false));
                    }
                });
            }
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                wait(Duration::from_secs(5)).await;
                ask(handle, true).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running HiveVoice");
}

/// Waits without holding up the async runtime.
async fn wait(d: Duration) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(d)).await;
}
