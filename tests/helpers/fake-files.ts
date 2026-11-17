import type { Page } from '@playwright/test';

/**
 * Stands in for Chromium's file pickers: "save" hands out a handle that records what is written,
 * so a test can read the file back (`savedFiles`) and see whether "Kaydet" wrote the same file.
 */
export async function fakeSavePicker(page: Page, names: string[] = ['Deneme.awd']): Promise<void> {
  await page.addInitScript((queue: string[]) => {
    const saved: { name: string; text: string; writes: number }[] = [];
    Object.assign(window, { savedFiles: saved, savePickerCalls: 0 });
    const handleFor = (name: string) => {
      const record = { name, text: '', writes: 0 };
      saved.push(record);
      const handle = Object.create(FileSystemFileHandle.prototype) as FileSystemFileHandle;
      Object.defineProperties(handle, {
        name: { value: name },
        queryPermission: { value: async () => 'granted' },
        requestPermission: { value: async () => 'granted' },
        createWritable: {
          value: async () => {
            const parts: Uint8Array[] = [];
            return {
              write: async (data: Uint8Array) => { parts.push(data); },
              close: async () => {
                record.text = new TextDecoder().decode(new Uint8Array(await new Blob(parts as BlobPart[]).arrayBuffer()));
                record.writes += 1;
              },
            };
          },
        },
      });
      return handle;
    };
    window.showSaveFilePicker = async ({ suggestedName }) => {
      (window as unknown as { savePickerCalls: number }).savePickerCalls += 1;
      return handleFor(queue.shift() ?? suggestedName);
    };
  }, names);
}

export function savedFiles(page: Page): Promise<{ name: string; text: string; writes: number }[]> {
  return page.evaluate(() => (window as unknown as { savedFiles: { name: string; text: string; writes: number }[] }).savedFiles);
}

export function savePickerCalls(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { savePickerCalls: number }).savePickerCalls);
}

/** Opens a file as if the user had picked or dropped it. */
export async function openFile(page: Page, name: string, text: string): Promise<void> {
  await page.locator('#fileInput').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(text, 'utf8') });
}

export function awdFile(content: unknown[]): string {
  return JSON.stringify({ format: 'awDOC', version: 1, app: 'test', document: { type: 'doc', content } });
}
