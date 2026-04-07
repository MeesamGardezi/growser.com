import { onMount, onCleanup, createSignal, Show } from 'solid-js';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { initDB } from './lib/db';
import {
  isVerticalTabs,
  activeTabId,
  createTab,
  closeTab,
  switchTo,
  toggleVerticalTabs,
  invalidateFrameOffset,
  resizeActiveWebview,
  hideAllWebviews,
  showActiveWebview,
} from './lib/tabs';
import TabBar from './components/TabBar';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';

export default function App() {
  const [showFullscreen, setShowFullscreen] = createSignal(true);

  async function checkFullscreen() {
    try {
      const isFs = await getCurrentWindow().isFullscreen();
      setShowFullscreen(!isFs);
      if (isFs) {
        await showActiveWebview();
      } else {
        await hideAllWebviews();
      }
    } catch (err) {
      console.error('[app] fullscreen check failed:', err);
    }
  }

  async function goFullscreen() {
    try {
      await getCurrentWindow().setFullscreen(true);
      setShowFullscreen(false);
      const id = activeTabId();
      if (id) await switchTo(id);
    } catch (err) {
      console.error('[app] setFullscreen failed:', err);
    }
  }

  onMount(async () => {
    // DB
    try {
      await initDB();
    } catch (err) {
      console.error('[app] DB init failed:', err);
    }

    // First tab
    try {
      await createTab();
    } catch (err) {
      console.error('[app] initial tab failed:', err);
    }

    await checkFullscreen();

    // Keyboard shortcuts
    function onKeyDown(e: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (mod && e.key === 't') {
        e.preventDefault();
        createTab();
      }
      if (mod && e.key === 'w') {
        e.preventDefault();
        const id = activeTabId();
        if (id) closeTab(id);
      }
      if (mod && e.key === 'l') {
        e.preventDefault();
        const omnibox = document.getElementById('omnibox') as HTMLInputElement;
        omnibox?.focus();
        omnibox?.select();
      }
      if (mod && e.shiftKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        toggleVerticalTabs();
      }
    }
    document.addEventListener('keydown', onKeyDown);

    // Resize handler
    let resizeTimer = 0;
    function onResize() {
      clearTimeout(resizeTimer);
      invalidateFrameOffset();
      resizeTimer = window.setTimeout(() => {
        checkFullscreen();
        resizeActiveWebview();
      }, 150);
    }
    window.addEventListener('resize', onResize);

    onCleanup(() => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    });

    console.log('[app] Growser ready');
  });

  return (
    <>
      <div id="shell" classList={{ 'vertical-tabs': isVerticalTabs() }}>
        <Sidebar />
        <div id="main-col">
          <TabBar />
          <Toolbar />
          <div id="content-area" />
          <div id="status-bar">
            <span id="status-text" />
          </div>
        </div>
      </div>

      <Show when={showFullscreen()}>
        <div id="fullscreen-overlay">
          <div class="fullscreen-prompt">
            <div class="fullscreen-icon">&#x26F6;</div>
            <h2>Enter Full Screen</h2>
            <p>Growser works best in full screen mode</p>
            <button id="fullscreen-btn" onClick={goFullscreen}>
              Go Full Screen
            </button>
          </div>
        </div>
      </Show>
    </>
  );
}
