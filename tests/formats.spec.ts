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
  expect(formatOfName('rapor.docx')?.id).toBe('docx');
  expect(formatOfName('Eski.DOC')?.id).toBe('doc');
  expect(formatOfName('rapor.pdf')).toBeUndefined();
  expect(formatOfName('uzantısız')).toBeUndefined();
  expect(nameWithExtension('notlar.txt', awdFormat)).toBe('notlar.awd');
  expect(nameWithExtension('Belge', awdFormat)).toBe('Belge.awd');
  expect(acceptList()).toBe('.awd,.docx,.odt,.doc,.txt');
});

test('bağlantı adresleri: yalnız web ve e-posta; eksik başlık tamamlanır', async () => {
  const { normalizeLink } = await import('../src/core/links');
  expect(normalizeLink('madematik.com')).toBe('https://madematik.com/');
  expect(normalizeLink(' http://a.b/c ')).toBe('http://a.b/c');
  expect(normalizeLink('ali@okul.k12.tr')).toBe('mailto:ali@okul.k12.tr');
  expect(normalizeLink('javascript:alert(1)')).toBeNull();
  expect(normalizeLink('file:///etc/passwd')).toBeNull();
  expect(normalizeLink('kelime')).toBeNull();
  expect(normalizeLink('iki kelime.com')).toBeNull();
});

test('kelime sayımı Word gibi: noktalama tek başına kelime değil', async () => {
  const { countText } = await import('../src/core/count');
  expect(countText('Bir iki — üç.\nDört')).toEqual({ words: 4, characters: 17, charactersWithoutSpaces: 14 });
  expect(countText('')).toEqual({ words: 0, characters: 0, charactersWithoutSpaces: 0 });
});

test('arama katlaması: I/ı/İ/i aynı, uzunluk değişmez', async () => {
  const { foldForSearch } = await import('../src/editor/search');
  expect(foldForSearch('IŞIK İnce')).toBe('işik ince');
  expect(foldForSearch('İİİ').length).toBe(3);
});
