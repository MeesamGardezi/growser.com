-- History table
CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    visit_count INTEGER NOT NULL DEFAULT 1,
    last_visited INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    favicon_url TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_history_last_visited ON history(last_visited DESC);
CREATE INDEX IF NOT EXISTS idx_history_url ON history(url);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Session tabs (for restore on launch)
CREATE TABLE IF NOT EXISTS session_tabs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    scroll_y REAL NOT NULL DEFAULT 0,
    tab_order INTEGER NOT NULL DEFAULT 0
);

-- Schema meta for tracking migration state
CREATE TABLE IF NOT EXISTS _meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO _meta (key, value) VALUES ('schema_version', '1');

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES ('homepage', 'newtab');
INSERT OR IGNORE INTO settings (key, value) VALUES ('search_engine', 'https://www.google.com/search?q=%s');
INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'system');
