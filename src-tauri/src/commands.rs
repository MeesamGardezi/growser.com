use tauri::{Emitter, Manager};
use tauri::webview::{PageLoadEvent, WebviewBuilder};
use serde::Serialize;

#[derive(Clone, Serialize)]
struct PageInfo {
    label: String,
    url: String,
}

#[derive(Clone, Serialize)]
struct PageTitleInfo {
    label: String,
    title: String,
    url: String,
}

/// Create a child webview inside the main window with page-load hooks.
#[tauri::command]
pub fn create_child_webview(
    app: tauri::AppHandle,
    label: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let main_window = app.get_window("main").ok_or("main window not found")?;

    let webview_url = if url.is_empty() {
        tauri::WebviewUrl::App("pages/newtab.html".into())
    } else {
        let parsed: tauri::Url = url.parse().map_err(|e: <tauri::Url as std::str::FromStr>::Err| e.to_string())?;
        tauri::WebviewUrl::External(parsed)
    };

    let app_handle = app.clone();
    let builder = WebviewBuilder::new(&label, webview_url)
        .auto_resize()
        .on_page_load(move |webview, payload| {
            let label = webview.label().to_string();
            let url = payload.url().to_string();

            match payload.event() {
                PageLoadEvent::Started => {
                    let _ = app_handle.emit("page-load-started", PageInfo {
                        label,
                        url,
                    });
                }
                PageLoadEvent::Finished => {
                    let _ = app_handle.emit("page-load-finished", PageInfo {
                        label: label.clone(),
                        url: url.clone(),
                    });

                    // Inject title observer script
                    let escaped_label = label.replace('\\', "\\\\").replace('\'', "\\'");
                    let script = format!(
                        r#"(function(){{
                            var lbl = '{}';
                            function sendTitle() {{
                                try {{
                                    var t = document.title || '';
                                    var u = window.location.href || '';
                                    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {{
                                        window.__TAURI_INTERNALS__.invoke('report_page_title', {{ label: lbl, title: t, url: u }});
                                    }}
                                }} catch(e) {{}}
                            }}
                            setTimeout(sendTitle, 100);
                            setTimeout(sendTitle, 500);
                            setTimeout(sendTitle, 1500);
                            if (window.__growser_title_obs) return;
                            window.__growser_title_obs = true;
                            var last = '';
                            setInterval(function() {{
                                var t = document.title || '';
                                if (t !== last) {{ last = t; sendTitle(); }}
                            }}, 2000);
                        }})();"#,
                        escaped_label
                    );
                    let _ = webview.eval(&script);
                }
            }
        });

    main_window
        .add_child(
            builder,
            tauri::LogicalPosition::new(x, y),
            tauri::LogicalSize::new(width, height),
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Receive page title reports from injected scripts in child webviews.
#[tauri::command]
pub fn report_page_title(
    app: tauri::AppHandle,
    label: String,
    title: String,
    url: String,
) -> Result<(), String> {
    let _ = app.emit("page-title-changed", PageTitleInfo { label, title, url });
    Ok(())
}

/// Navigate an existing child webview to a new URL.
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

/// Show a webview by label.
#[tauri::command]
pub fn show_webview(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let wv = app.get_webview(&label).ok_or("webview not found")?;
    wv.show().map_err(|e| e.to_string())
}

/// Hide a webview by label.
#[tauri::command]
pub fn hide_webview(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let wv = app.get_webview(&label).ok_or("webview not found")?;
    wv.hide().map_err(|e| e.to_string())
}

/// Close/destroy a webview by label.
#[tauri::command]
pub fn close_webview(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let wv = app.get_webview(&label).ok_or("webview not found")?;
    wv.close().map_err(|e| e.to_string())
}

/// Set a webview's position.
#[tauri::command]
pub fn set_webview_position(
    app: tauri::AppHandle,
    label: String,
    x: f64,
    y: f64,
) -> Result<(), String> {
    let wv = app.get_webview(&label).ok_or("webview not found")?;
    wv.set_position(tauri::LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

/// Set a webview's size.
#[tauri::command]
pub fn set_webview_size(
    app: tauri::AppHandle,
    label: String,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let wv = app.get_webview(&label).ok_or("webview not found")?;
    wv.set_size(tauri::LogicalSize::new(width, height))
        .map_err(|e| e.to_string())
}
