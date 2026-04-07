# Tauri Browser Build Plan
### Desktop-Only (macOS + Windows + Linux)
> Stack: Tauri (thin Rust shell) + Vanilla JS + JSDoc + OS WebView + SQLite

---

## Why this stack

- **Tauri** uses the OS's native WebView (WKWebView / WebView2 / WebKitGTK), so no Chromium bundled — binaries stay ~3–10 MB.
- **Vanilla JS + JSDoc** — no bundler, no build step, no `node_modules` runtime. Final bundle is exactly the code you wrote. JSDoc gives TS-level editor hints without the tooling cost.
- **Multi-WebviewWindow** is a first-class Tauri API — real tabs with live background pages, not single-WebView URL-swapping.
- Rust surface area is tiny: window glue + plugin config. ~95% of the code is JS.

---

## Core Architecture

Everything else sits on top of these. Build these first.

| # | Component | Description | Layer |
|---|---|---|---|
| 1 | **App entry point** | `main.rs` — Tauri builder, plugin registration, app handle | Rust |
| 2 | **Window manager** | Main shell window (toolbar + tab strip + content area) | Rust + JS |
| 3 | **WebviewWindow per tab** | Each tab is its own `WebviewWindow` positioned inside the shell | Rust (create) + JS (control) |
| 4 | **IPC layer** | `invoke()` from JS → Rust commands; `emit()` for events back | Both |
| 5 | **Config system** | Settings path, app data dir, cache dir | JS via plugin |
| 5a | **Platform path resolver** | `tauri-plugin-fs` + `BaseDirectory.AppData` — handles all 3 OSes automatically | JS |
| 6 | **SQLite connection** | `tauri-plugin-sql` — one DB file, all persistent data | JS |

**Rust code you actually write for this section:** ~80 lines total, mostly plugin registration and 2–3 custom commands for window positioning.

---

## Navigation Engine

| # | Component | Description |
|---|---|---|
| 7 | **URL parser** | Built-in `URL` global — no library needed |
| 8 | **Search query handler** | Classify input: URL, bare domain, or search term |
| 9 | **Default search engine** | Route plain queries to Google/DDG/Brave |
| 10 | **Load URL** | `webviewWindow.eval()` or navigate via Rust command |
| 11 | **Back / Forward stack** | Per-tab history stack in JS memory, synced to WebView |
| 12 | **Refresh / Stop** | Reload or abort current page load |
| 13 | **Load progress** | Listen for `tauri://load-start` / `tauri://load-end` events |
| 14 | **Page title listener** | `webviewWindow.onPageLoad()` + inject script to read `document.title` |
| 15 | **URL change listener** | Inject `MutationObserver` on history API, postMessage back to shell |

**Note on #14 and #15:** OS WebViews are more locked-down than Chrome's. You can't directly subscribe to "page title changed" like you would in CEF. Standard pattern is to inject a tiny JS snippet on page load that hooks `document.title` changes and `history.pushState`, then posts them to the shell via `window.__TAURI__.event.emit()`. ~20 lines. Not bad, but worth knowing upfront.

---

## Tab System

This is where Tauri earns its keep versus Neutralino.

| # | Component | Description |
|---|---|---|
| 16 | **Tab struct** | `{ id, webviewLabel, url, title, favicon, scrollY, isActive }` — JSDoc-typed |
| 17 | **Tab manager** | Create/close/switch/reorder — each create spawns a `WebviewWindow` |
| 18 | **Active tab state** | Show active tab's WebviewWindow, hide others via `setPosition` off-screen or `.hide()` |
| 19 | **Tab persistence** | Save `{url, title, scrollY}` array to SQLite on close |
| 20 | **New tab page** | Local HTML file shown on `tab://new` or similar |
| 21 | **Tab limit handling** | Soft-warn at 30 tabs, hard-cap configurable in settings |
| 21a | **Tab positioning sync** | When shell window resizes/moves, reposition active WebviewWindow to fit content area — this is the trickiest part, worth building a dedicated module for |

**Heads up on #21a:** Tauri's `WebviewWindow` is a real OS window, not an embedded view. You fake "embedded" by positioning it to exactly cover your shell's content area and parenting it to the shell. When the user drags or resizes the shell, you get a `tauri://resize` event and must reposition the active tab's WebviewWindow in the same frame, or users will see a lag/tear. Budget a day to get this feeling right — it's the one place the framework makes you work for it.

---

## History

| # | Component | Description |
|---|---|---|
| 22 | **History DB schema** | `history(id, url, title, visit_count, last_visited, favicon_url)` |
| 23 | **Write history entry** | Insert or upsert on every successful page load |
| 24 | **Read history** | Paginated query, sorted by `last_visited DESC` |
| 25 | **Search history** | SQLite FTS5 virtual table on `url` + `title` |
| 26 | **Delete entry** | Single-row delete by id |
| 27 | **Clear all history** | `DELETE FROM history` + vacuum |
| 28 | **History UI** | Dedicated local HTML page, loaded in a tab like `browser://history` |

---

## Search

| # | Component | Description |
|---|---|---|
| 29 | **Omnibox input** | Single `<input>` in toolbar |
| 30 | **Input classifier** | Regex + `URL` constructor try/catch |
| 31 | **Search engine config** | Stored in settings table, switchable |
| 32 | **Search URL builder** | Template string per engine |
| 33 | **Omnibox suggestions** | Query history FTS as user types, debounced ~80ms |
| 34 | **Suggestion ranking** | Frecency = `visit_count * decay(last_visited)` |
| 35 | **Keyboard navigation** | Arrow keys through suggestion list, Enter commits |

---

## UI Shell

All of this is plain HTML + CSS + JS inside the shell window. No framework.

| # | Component | Description |
|---|---|---|
| 36 | **Toolbar** | Back / Forward / Refresh / Stop / Omnibox / Menu |
| 37 | **Tab bar** | Horizontal tab strip with close buttons, drag-to-reorder |
| 38 | **Status bar** | Hover link preview, load state |
| 39 | **Favicon fetcher** | `fetch('https://icon.horse/icon/' + domain)` or parse page `<link rel="icon">`, cache to local dir |
| 40 | **Keyboard shortcuts** | `Ctrl+T/W/L/R/Tab/Shift+Tab` — `Cmd` equivalents on macOS via `navigator.platform` check |
| 41 | **Context menu** | Right-click handler injected into tab WebviewWindows, sends menu request to shell |
| 42 | **Theme** | CSS vars + `prefers-color-scheme` media query |

---

## Settings

| # | Component | Description |
|---|---|---|
| 43 | **Settings DB schema** | `settings(key TEXT PRIMARY KEY, value TEXT)` |
| 44 | **Settings UI** | Local page loaded as `browser://settings` |
| 45 | **Homepage setting** | What to load on launch / new tab |
| 46 | **Search engine setting** | Dropdown of presets + custom |
| 47 | **Theme setting** | Light / Dark / System |
| 48 | **Clear data UI** | Buttons for history / cache / cookies / all |

---

## Data & Storage

| # | Component | Description |
|---|---|---|
| 49 | **SQLite schema migrations** | Version column in a `_meta` table, migration fns run at boot |
| 50 | **Cache directory** | `BaseDirectory.AppCache` via `tauri-plugin-fs` — favicons, thumbnails |
| 51 | **Session storage** | Last session's tabs in SQLite, restored on launch |
| 52 | **Cookie handling** | Delegated to OS WebView; expose clear-cookies command |

---

## Error & Edge Cases

| # | Component | Description |
|---|---|---|
| 53 | **Failed page load UI** | Load a local `error.html` with the failed URL and reason |
| 54 | **Invalid URL handling** | Classifier catches, falls through to search |
| 55 | **Empty history state** | Friendly empty-state in history UI |
| 56 | **Crash recovery** | Write session snapshot every 30s; detect unclean exit via sentinel file |
| 57 | **Permission requests** | WebView fires native prompts by default; optionally intercept and re-style |

---

## Platform Packaging

Tauri collapses most of this via `tauri build`.

| # | Component | macOS | Windows | Linux |
|---|---|---|---|---|
| 58 | **App bundle** | `.app` + `.dmg` (automatic) | `.msi` + `.exe` (automatic) | `.deb` + `.AppImage` (automatic) |
| 59 | **WebView dependency** | Bundled (WKWebView, system) | WebView2 bootstrapper auto-included | WebKitGTK system dep, documented |
| 60 | **Code signing** | Apple Developer cert, Tauri CLI handles notarization | Authenticode, optional | Not required |
| 61 | **Platform shortcuts** | `Cmd` via runtime platform check in JS | `Ctrl` | `Ctrl` |

**One command builds all three**: `tauri build --target <triple>`. You still need each host OS to produce its native installer (or a CI matrix), but the Tauri config is the same across all of them.

---

## Build Order

```
Foundation (1–6)
    ↓
Navigation Engine (7–15)
    ↓
Single-tab working browser ← first milestone
    ↓
Tab System (16–21a) ← second milestone, hardest part (21a)
    ↓
Omnibox + Search (29–35)
    ↓
History (22–28)
    ↓
UI Polish (36–42)
    ↓
Settings (43–48)
    ↓
Data & Storage hardening (49–52)
    ↓
Error & Edge Cases (53–57)
    ↓
Platform Packaging (58–61) ← tauri build handles most of it
```

---

## Stack Equivalents (vs. the Rust + wry plan)

| Original (Rust) | This plan (Tauri + JS) | Notes |
|---|---|---|
| `wry` | Tauri `WebviewWindow` | Same underlying engine (`wry` is Tauri's webview layer) |
| `tao` | Tauri window API | Same library, wrapped |
| `rusqlite` | `tauri-plugin-sql` | JS-facing, no Rust to write |
| `dirs` | `tauri-plugin-fs` + `BaseDirectory` | JS-facing |
| `url` | Built-in `URL` global | Zero deps |
| `serde` / `serde_json` | Built-in `JSON` | Zero deps |
| `tokio` | Native JS async + `fetch` | Zero deps |

**Dependencies you actually add to `package.json`:** `@tauri-apps/api`, `@tauri-apps/plugin-sql`, `@tauri-apps/plugin-fs`. That's it. No framework, no bundler, no state library.

**Dependencies in `Cargo.toml`:** `tauri`, `tauri-plugin-sql`, `tauri-plugin-fs`. Also it.

---

## Expected Weight

Based on the comparison table we worked through:

| Metric | Expected |
|---|---|
| Installer size | ~5–10 MB |
| Installed on disk | ~10–15 MB |
| Idle RAM (1 blank tab) | ~60–100 MB |
| RAM at 10 average tabs | ~500 MB–1 GB |
| Cold start | ~200–500 ms |

Real tabs, alive in the background, at roughly 1/3 the memory of Electron and well under 1/10 the installer size.

---

## Summary

| Category | Components |
|---|---|
| Core Architecture | 7 |
| Navigation Engine | 9 |
| Tab System | 7 (added 21a for position sync) |
| History | 7 |
| Search | 7 |
| UI Shell | 7 |
| Settings | 6 |
| Data & Storage | 4 |
| Error & Edge Cases | 5 |
| Platform Packaging | 4 |
| **Total** | **63** |

One component larger than the Rust plan — the extra is the tab-positioning sync module, which is the one piece of real work this stack demands that the original didn't call out.