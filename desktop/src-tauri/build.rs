fn main() {
    // The two update commands get their own permission, so only they are opened to the site (capabilities/updates.json).
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["update_check", "update_install"])),
    )
    .expect("failed to run tauri-build");
}
