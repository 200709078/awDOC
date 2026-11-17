import type { Page } from '@playwright/test';

/**
 * Stands in for Capacitor's native side (awPDF's helper, for awDOC's plugin), so the Android
 * platform runs in Chromium. Plugin calls are recorded by name in `androidCalls`; `window.androidFile`
 * contents answer `readFile`, and `sendNative` fires a native event (`fileOpened`, `backButton`).
 */
export async function pretendAndroid(page: Page, files: Record<number, number[]> = {}) {
  await page.addInitScript(contents => {
    const listeners: Record<string, (data: unknown) => void> = {};
    const calls: string[] = [];
    const methods = ['print', 'setFullscreen', 'setSystemBars', 'pickFile', 'reopenFile', 'readFile', 'leaveApp', 'saveFile', 'writeFile', 'appendOutput', 'removeListener'];
    Object.assign(window, {
      androidBridge: { postMessage: () => undefined },
      androidCalls: calls,
      sendNative: (event: string, data: unknown) => listeners[event]?.(data),
      Capacitor: {
        PluginHeaders: [{
          name: 'AwDocNative',
          methods: [...methods.map(name => ({ name, rtype: 'promise' })), { name: 'addListener', rtype: 'callback' }],
        }],
        nativePromise: async (_plugin: string, method: string, options: { id: number; begin: number; end: number }) => {
          calls.push(method);
          if (method === 'saveFile') return {};
          if (method === 'writeFile') return { written: false };
          if (method !== 'readFile') return undefined;
          const part = (contents[options.id] ?? []).slice(options.begin, options.end);
          return { data: btoa(String.fromCharCode(...part)) };
        },
        nativeCallback: (_plugin: string, _method: string, options: { eventName: string }, callback: (data: unknown) => void) => {
          listeners[options.eventName] = callback;
          return Promise.resolve('callback');
        },
      },
    });
  }, files);
}
