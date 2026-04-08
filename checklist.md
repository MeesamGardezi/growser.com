# Growser — Remaining Work Checklist

> Basics done: Tauri scaffold, child-webview tabs, navigation, omnibox, back/forward/reload, keyboard shortcuts, horizontal + vertical tab bar, fullscreen mode, SQLite connection, DB schema + migrations, window resize sync.

---

### Navigation Engine
- [x] **#13 — Load progress indicator** — listen for load-start/load-end events, show spinner or progress bar in toolbar
- [x] **#14 — Page title listener** — inject script into child webviews to read `document.title` and post it back to the shell
- [ ] **#15 — URL change listener** — inject `MutationObserver` / history API hooks so the omnibox updates when a page navigates internally

### Tab System
- [ ] **#16 — Favicon extraction** — parse `<link rel="icon">` from loaded pages or fetch from `icon.horse`, cache locally
- [x] **#19 — Session tab persistence** — write open tabs to `session_tabs` on close, restore on relaunch
- [x] **#20 — New tab page polish** — improve `newtab.html` (search box, recent sites, shortcuts)
- [ ] **#21 — Tab limit handling** — soft-  warn at 30 tabs, configurable hard cap
- [ ] **#37 — Tab drag-to-reorder** — drag handle + reorder logic in tab bar and sidebar

### Search / Omnibox
- [x] **#31 — Read search engine from settings** — load the stored setting instead of hardcoded DuckDuckGo
- [ ] **#33 — Omnibox suggestions** — query history FTS as user types, debounced, populate `#suggestions` dropdown
- [ ] **#34 — Suggestion ranking** — frecency scoring: `visit_count * decay(last_visited)`
- [ ] **#35 — Keyboard navigation** — arrow keys through suggestion list, Enter commits

### History
- [x] **#23 — Write history entries** — upsert into `history` table on every successful page load
- [ ] **#24 — Read history** — paginated query, sorted by `last_visited DESC`
- [ ] **#25 — History search** — SQLite FTS5 virtual table on `url` + `title`
- [ ] **#26/#27 — Delete / clear history** — single-row delete + clear-all with vacuum
- [ ] **#28 — History UI** — dedicated page at `browser://history`

### UI Shell
- [x] **#38 — Status bar** — show hovered link URL, load state
- [ ] **#39 — Favicon fetcher + cache** — fetch, cache to `AppCache`, display in tabs
- [ ] **#41 — Context menu** — right-click handler injected into tab webviews
- [x] **#42 — Dark theme** — CSS variables for dark mode + `prefers-color-scheme` support
- [ ] **Menu button** — wire up click handler with dropdown options

### Settings
- [x] **#43 — Read/apply settings at runtime** — load from `settings` table on boot, apply theme/homepage/search engine
- [ ] **#44 — Settings UI** — local page at `browser://settings`
- [ ] **#45 — Homepage setting** — configurable start page
- [ ] **#46 — Search engine setting** — dropdown of presets + custom URL template
- [ ] **#47 — Theme setting** — light / dark / system toggle
- [ ] **#48 — Clear data UI** — buttons for history / cache / cookies / all

### Data & Storage
- [ ] **#49 — Schema migrations** — version check + incremental migration runner at boot
- [ ] **#50 — Cache directory** — use `BaseDirectory.AppCache` for favicons, thumbnails
- [ ] **#52 — Cookie / login persistence** — OS WebView cookies don't persist across app restarts; configure WKWebView data store (macOS) / WebView2 user data folder to use a persistent path so logins survive relaunch
- [ ] **Cookie clear command** — expose a clear-cookies action for the settings/clear-data UI

### Error & Edge Cases
- [ ] **#53 — Failed page load UI** — show local `error.html` with URL and reason
- [ ] **#55 — Empty history state** — friendly empty-state in history UI
- [ ] **#56 — Crash recovery** — session snapshot every 30s, detect unclean exit via sentinel file
- [ ] **#57 — Permission requests** — intercept and optionally re-style WebView permission prompts

### Cleanup
- [x] **Remove dead `ipc.ts`** — nothing imports it; `tabs.ts` uses `invoke` directly from `@tauri-apps/api/core`
