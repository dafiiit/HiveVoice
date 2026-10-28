fn main() {
    // The update commands and the server commands get their own permissions, so only they are opened to the site
    // (capabilities/updates.json, capabilities/server.json).
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["update_check", "update_install", "server_status", "server_setup", "server_stop"])),
    )
    .expect("failed to run tauri-build");
}
