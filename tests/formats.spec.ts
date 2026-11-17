import { expect, test } from '@playwright/test';

// The formats are plain modules; the app's version comes from Vite's `define`.
Object.assign(globalThis, { __APP_VERSION__: '0.0.0-test' });
const { awdFormat } = await import('../src/formats/awd');
const { txtFormat } = await import('../src/formats/txt');
const { FormatError } = await import('../src/formats/format');
const { formatOfName, nameWithExtension, acceptList } = await import('../src/formats/index');

const sample = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1, textAlign: 'center' }, content: [{ type: 'text', text: 'Sınav' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Adı: ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Ğülşen' }] },
    { type: 'bulletList', content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'bir' }] }] },
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'iki' }] }] },
    ] },
    { type: 'orderedList', attrs: { start: 3 }, content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'üç' }] }] },
    ] },
  ],
};

test('.awd yazılıp okununca belge aynen geri gelir', async () => {
  const bytes = await awdFormat.write!(sample);
  const file = JSON.parse(new TextDecoder().decode(bytes));
  expect(file).toMatchObject({ format: 'awDOC', version: 1, app: 'awDOC 0.0.0-test' });
  expect(await awdFormat.read!(bytes)).toEqual(sample);
});

test('.awd: başka JSON, bozuk UTF-8 ve daha yeni sürüm reddedilir', async () => {
  const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
  expect(() => awdFormat.read!(encode({ format: 'awDOC', version: 1, document: { type: 'paragraph' } }))).toThrow(FormatError);
  expect(() => awdFormat.read!(encode({ hello: 1 }))).toThrow(FormatError);
  expect(() => awdFormat.read!(new Uint8Array([0xff, 0xfe, 0x00]))).toThrow(FormatError);
  expect(() => awdFormat.read!(encode({ format: 'awDOC', version: 2, document: { type: 'doc' } }))).toThrow(/daha yeni/);
});

test('.txt: satırlar paragraf olur; kaydederken listeler işaretiyle yazılır', async () => {
  const read = await txtFormat.read!(new TextEncoder().encode('﻿a\r\n\r\nb\n'));
  expect(read).toEqual({ type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
    { type: 'paragraph' },
    { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
  ] });
  const text = new TextDecoder().decode(await txtFormat.write!(sample));
  expect(text).toBe('Sınav\nAdı: Ğülşen\n• bir\n• iki\n3. üç\n');
});

test('dosya adından biçim bulunur; uzantı değiştirilir', () => {
  expect(formatOfName('ÖDEV.AWD')?.id).toBe('awd');
  expect(formatOfName('not.txt')?.id).toBe('txt');
  expect(formatOfName('rapor.docx')).toBeUndefined();
  expect(formatOfName('uzantısız')).toBeUndefined();
  expect(nameWithExtension('notlar.txt', awdFormat)).toBe('notlar.awd');
  expect(nameWithExtension('Belge', awdFormat)).toBe('Belge.awd');
  expect(acceptList()).toBe('.awd,.txt');
});
