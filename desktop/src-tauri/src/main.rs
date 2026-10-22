// No console window next to the app on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// The whole app is the live site: the window in tauri.conf.json opens it, and its service worker
// keeps opened pages readable offline. Nothing runs locally besides the window itself.
fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running HiveVoice");
}
