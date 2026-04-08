fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "navigate_webview",
                "create_child_webview",
                "report_page_title",
                "show_webview",
                "hide_webview",
                "close_webview",
                "set_webview_position",
                "set_webview_size",
            ]),
        ),
    )
    .expect("failed to run tauri-build");
}
