import { createSignal, createMemo } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { recordVisit, saveSessionTabs, loadSessionTabs } from './db';

// ─── Types ───

export interface Tab {
  id: string;
  url: string;
  title: string;
  favicon: string;
  isActive: boolean;
}

// ─── Reactive state (drives UI) ───

export const [tabs, setTabs] = createStore<Tab[]>([]);
export const [activeTabId, setActiveTabId] = createSignal<string | null>(null);
export const [isVerticalTabs, setIsVerticalTabs] = createSignal(false);
export const [statusText, setStatusText] = createSignal('');
export const [isLoading, setIsLoading] = createSignal(false);

// ─── Derived state ───

export const activeTab = createMemo(() => tabs.find((t) => t.id === activeTabId()));

export const canGoBack = createMemo(() => {
  const id = activeTabId();
  if (!id) return false;
  return (historyIdx[id] ?? -1) > 0;
});

export const canGoForward = createMemo(() => {
  const id = activeTabId();
  if (!id) return false;
  const stack = histories[id] ?? [];
  const idx = historyIdx[id] ?? -1;
  return idx < stack.length - 1;
});

// ─── Internal (non-reactive) state ───

const wvLabels: Record<string, string> = {};
const labelToTabId: Record<string, string> = {};
const histories: Record<string, string[]> = {};
const historyIdx: Record<string, number> = {};
let nextId = 1;
let nextWvId = Date.now();
let frameOffset: { x: number; y: number; cssToLogical: number } | null = null;
let eventListenersInitialized = false;

// ─── Internal helpers ───

function getContentRect() {
  const el = document.getElementById('content-area');
  if (!el) return { x: 0, y: 0, width: 800, height: 600 };
  const r = el.getBoundingClientRect();
  return {
    x: Math.round(r.x),
    y: Math.round(r.y),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
}

async function getFrameOffset() {
  if (frameOffset) return frameOffset;
  try {
    const win = getCurrentWindow();
    const scale = await win.scaleFactor();
    const cssToLogical = window.devicePixelRatio / scale;

    if (/Mac/.test(navigator.platform)) {
      frameOffset = { x: 0, y: 0, cssToLogical };
      return frameOffset;
    }

    const outerPos = await win.outerPosition();
    const viewportPhysicalY = window.screenY * window.devicePixelRatio;
    const headerPhysical = Math.max(0, viewportPhysicalY - outerPos.y);
    frameOffset = { x: 0, y: headerPhysical / scale, cssToLogical };
  } catch {
    frameOffset = { x: 0, y: 0, cssToLogical: 1 };
  }
  return frameOffset!;
}

async function createWebview(
  label: string,
  url: string,
  rect: { x: number; y: number; width: number; height: number },
) {
  const offset = await getFrameOffset();
  const cx = offset.cssToLogical;
  await invoke('create_child_webview', {
    label,
    url,
    x: rect.x * cx + offset.x,
    y: rect.y * cx + offset.y,
    width: rect.width * cx,
    height: rect.height * cx,
  });
  await invoke('hide_webview', { label });
}

/** Set up event listeners for page load / title events from Rust */
async function initEventListeners() {
  if (eventListenersInitialized) return;
  eventListenersInitialized = true;

  await listen<{ label: string; url: string }>('page-load-started', (event) => {
    const tabId = labelToTabId[event.payload.label];
    if (tabId && !event.payload.url.includes('/pages/newtab.html')) {
      setIsLoading(true);
      setStatusText(`Loading ${event.payload.url}…`);
    }
  });

  await listen<{ label: string; url: string }>('page-load-finished', (event) => {
    const tabId = labelToTabId[event.payload.label];
    if (tabId) {
      setIsLoading(false);
      setStatusText('');
      // Update URL for the tab (skip newtab page)
      const url = event.payload.url;
      const isNewtab = url.includes('/pages/newtab.html');
      if (!isNewtab) {
        setTabs(
          produce((draft) => {
            const t = draft.find((tab) => tab.id === tabId);
            if (t && url && !url.startsWith('about:') && url !== t.url) {
              t.url = url;
            }
          }),
        );
      }
    }
  });

  await listen<{ label: string; title: string; url: string }>('page-title-changed', (event) => {
    const tabId = labelToTabId[event.payload.label];
    if (tabId && event.payload.title) {
      setTabs(
        produce((draft) => {
          const t = draft.find((tab) => tab.id === tabId);
          if (t) {
            t.title = event.payload.title;
            if (event.payload.url) t.url = event.payload.url;
          }
        }),
      );
      // Update history title
      recordVisit(event.payload.url || '', event.payload.title).catch(() => {});
    }
  });
}

// ─── Public actions ───

export async function createTab(url = '') {
  await initEventListeners();

  const id = `tab-${nextId++}`;
  const wvLabel = `wv-${nextWvId++}`;

  const tab: Tab = {
    id,
    url: url || '',
    title: 'New Tab',
    favicon: '',
    isActive: false,
  };

  setTabs(produce((draft) => draft.push(tab)));

  const rect = getContentRect();

  try {
    await createWebview(wvLabel, url, rect);
    wvLabels[id] = wvLabel;
    labelToTabId[wvLabel] = id;
  } catch (err) {
    console.error('[tabs] createTab: webview creation failed:', err);
    setTabs((t) => t.filter((t) => t.id !== id));
    throw err;
  }

  if (url) {
    histories[id] = [url];
    historyIdx[id] = 0;
  } else {
    histories[id] = [];
    historyIdx[id] = -1;
  }

  await switchTo(id);
}

export async function closeTab(id: string) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;

  const label = wvLabels[id];
  if (label) {
    try {
      await invoke('close_webview', { label });
    } catch {}
    delete labelToTabId[label];
    delete wvLabels[id];
  }
  delete histories[id];
  delete historyIdx[id];

  const wasActive = activeTabId() === id;
  setTabs(produce((draft) => draft.splice(idx, 1)));

  if (tabs.length === 0) {
    await createTab();
    return;
  }

  if (wasActive) {
    const nextIdx = Math.min(idx, tabs.length - 1);
    await switchTo(tabs[nextIdx].id);
  }
}

export async function switchTo(id: string) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return;

  setActiveTabId(id);
  setTabs(
    produce((draft) => {
      for (const t of draft) t.isActive = t.id === id;
    }),
  );

  await new Promise((r) => requestAnimationFrame(r));
  const rect = getContentRect();
  const offset = await getFrameOffset();

  for (const t of tabs) {
    const label = wvLabels[t.id];
    if (!label) continue;
    if (t.id === id) {
      const cx = offset.cssToLogical;
      await invoke('show_webview', { label });
      await invoke('set_webview_position', {
        label,
        x: rect.x * cx + offset.x,
        y: rect.y * cx + offset.y,
      });
      await invoke('set_webview_size', {
        label,
        width: rect.width * cx,
        height: rect.height * cx,
      });
    } else {
      await invoke('hide_webview', { label });
    }
  }
}

export async function navigateTo(url: string) {
  const id = activeTabId();
  if (!id) return;
  const label = wvLabels[id];
  if (!label) return;

  await invoke('navigate_webview', { label, url });

  // Record in history (fire-and-forget)
  recordVisit(url).catch((e) => console.error('[tabs] recordVisit failed:', e));

  const idx = historyIdx[id] ?? -1;
  const stack = histories[id] ?? [];
  stack.splice(idx + 1);
  stack.push(url);
  histories[id] = stack;
  historyIdx[id] = stack.length - 1;

  setTabs(
    produce((draft) => {
      const t = draft.find((tab) => tab.id === id);
      if (t) {
        t.url = url;
        t.title = url;
      }
    }),
  );
}

export async function navigateBack() {
  const id = activeTabId();
  if (!id) return;
  const idx = historyIdx[id] ?? -1;
  if (idx <= 0) return;

  const newIdx = idx - 1;
  const url = histories[id][newIdx];
  const label = wvLabels[id];
  if (label) {
    await invoke('navigate_webview', { label, url });
  }

  historyIdx[id] = newIdx;
  setTabs(
    produce((draft) => {
      const t = draft.find((tab) => tab.id === id);
      if (t) {
        t.url = url;
        t.title = url;
      }
    }),
  );
}

export async function navigateForward() {
  const id = activeTabId();
  if (!id) return;
  const stack = histories[id] ?? [];
  const idx = historyIdx[id] ?? -1;
  if (idx >= stack.length - 1) return;

  const newIdx = idx + 1;
  const url = stack[newIdx];
  const label = wvLabels[id];
  if (label) {
    await invoke('navigate_webview', { label, url });
  }

  historyIdx[id] = newIdx;
  setTabs(
    produce((draft) => {
      const t = draft.find((tab) => tab.id === id);
      if (t) {
        t.url = url;
        t.title = url;
      }
    }),
  );
}

export async function reload() {
  const id = activeTabId();
  if (!id) return;
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return;
  const label = wvLabels[id];
  if (!label) return;
  const target = tab.url || `${window.location.origin}/pages/newtab.html`;
  await invoke('navigate_webview', { label, url: target });
}

export async function toggleVerticalTabs() {
  setIsVerticalTabs((v) => !v);
  const id = activeTabId();
  if (id) await switchTo(id);
}

export function invalidateFrameOffset() {
  frameOffset = null;
}

export async function resizeActiveWebview() {
  const id = activeTabId();
  if (!id) return;
  const label = wvLabels[id];
  if (!label) return;
  const rect = getContentRect();
  const offset = await getFrameOffset();
  const cx = offset.cssToLogical;
  await invoke('set_webview_position', {
    label,
    x: rect.x * cx + offset.x,
    y: rect.y * cx + offset.y,
  });
  await invoke('set_webview_size', {
    label,
    width: rect.width * cx,
    height: rect.height * cx,
  });
}

export async function hideAllWebviews() {
  for (const id of Object.keys(wvLabels)) {
    const label = wvLabels[id];
    if (label) await invoke('hide_webview', { label }).catch(() => {});
  }
}

export async function showActiveWebview() {
  const id = activeTabId();
  if (!id) return;
  const label = wvLabels[id];
  if (label) await invoke('show_webview', { label });
}

/** Save all open tabs to the DB for session restore */
export async function saveSession() {
  const openTabs = tabs
    .filter((t) => t.url)
    .map((t, i) => ({ url: t.url, title: t.title, order: i }));
  await saveSessionTabs(openTabs);
}

/** Restore tabs from the previous session. Returns true if any were restored. */
export async function restoreSession(): Promise<boolean> {
  const saved = await loadSessionTabs();
  const withUrls = saved.filter((t) => t.url);
  if (withUrls.length === 0) return false;
  for (const t of withUrls) {
    await createTab(t.url);
  }
  return true;
}
