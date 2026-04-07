use tauri::Manager;

/// Navigate an existing child webview to a new URL.
/// This avoids destroying and recreating the webview on every navigation.
#[tauri::command]
pub fn navigate_webview(
    app: tauri::AppHandle,
    label: String,
    url: String,
) -> Result<(), String> {
    println!("[navigate_webview] label={label}, url={url}");

    let parsed: tauri::Url = url.parse().map_err(|e: <tauri::Url as std::str::FromStr>::Err| {
        eprintln!("[navigate_webview] URL parse error: {e}");
        e.to_string()
    })?;

    let wv = app.get_webview(&label).ok_or_else(|| {
        let msg = format!("webview '{}' not found", label);
        eprintln!("[navigate_webview] {msg}");
        msg
    })?;

    wv.navigate(parsed).map_err(|e: tauri::Error| {
        eprintln!("[navigate_webview] navigate error: {e}");
        e.to_string()
    })?;

    println!("[navigate_webview] success");
    Ok(())
}
