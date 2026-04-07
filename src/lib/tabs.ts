import { createSignal, createMemo } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { Webview } from '@tauri-apps/api/webview';
import { getCurrentWindow, LogicalPosition, LogicalSize } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';

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

const webviews: Record<string, InstanceType<typeof Webview>> = {};
const wvLabels: Record<string, string> = {};
const histories: Record<string, string[]> = {};
const historyIdx: Record<string, number> = {};
let nextId = 1;
let nextWvId = Date.now();
let frameOffset: { x: number; y: number; cssToLogical: number } | null = null;

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
  const mainWindow = getCurrentWindow();
  const webview = new Webview(mainWindow, label, {
    url,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Webview creation timed out: ${label}`)),
      10000,
    );
    webview.once('tauri://created', () => {
      clearTimeout(timeout);
      resolve();
    });
    webview.once('tauri://error', (e: any) => {
      clearTimeout(timeout);
      reject(e);
    });
  });

  await webview.hide();
  return webview;
}

// ─── Public actions ───

export async function createTab(url = '') {
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
  const wvUrl = url || `${window.location.origin}/pages/newtab.html`;

  try {
    const webview = await createWebview(wvLabel, wvUrl, rect);
    webviews[id] = webview;
    wvLabels[id] = wvLabel;
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

  const wv = webviews[id];
  if (wv) {
    try {
      await wv.close();
    } catch {}
    delete webviews[id];
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
    const wv = webviews[t.id];
    if (!wv) continue;
    if (t.id === id) {
      const cx = offset.cssToLogical;
      await wv.show();
      await wv.setPosition(new LogicalPosition(rect.x * cx + offset.x, rect.y * cx + offset.y));
      await wv.setSize(new LogicalSize(rect.width * cx, rect.height * cx));
    } else {
      await wv.hide();
    }
  }
}

export async function navigateTo(url: string) {
  const id = activeTabId();
  if (!id) return;
  const label = wvLabels[id];
  if (!label) return;

  await invoke('navigate_webview', { label, url });

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
  const wv = webviews[id];
  if (!wv) return;
  const rect = getContentRect();
  const offset = await getFrameOffset();
  const cx = offset.cssToLogical;
  await wv.setPosition(new LogicalPosition(rect.x * cx + offset.x, rect.y * cx + offset.y));
  await wv.setSize(new LogicalSize(rect.width * cx, rect.height * cx));
}

export async function hideAllWebviews() {
  for (const id of Object.keys(webviews)) {
    const wv = webviews[id];
    if (wv) await wv.hide();
  }
}

export async function showActiveWebview() {
  const id = activeTabId();
  if (!id) return;
  const wv = webviews[id];
  if (wv) await wv.show();
}
