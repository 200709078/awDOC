import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { awdFile, fakeSavePicker, openFile, savedFiles } from './helpers/fake-files';
import { sampleDocument } from './helpers/sample-document';

type Json = { type?: string; text?: string; attrs?: Record<string, any>; marks?: { type: string; attrs?: Record<string, any> }[]; content?: Json[] };

/** Writes `document` as `format` in the page, keeps the bytes (AWDOC_OFFICE_OUT=<folder>) and reads them back. */
async function roundTrip(page: Page, format: 'docx' | 'odt', document: unknown): Promise<{ bytes: number[]; back: Json }> {
  const result = await page.evaluate(async ({ format, document }) => {
    const formats = await import('/src/formats/index.ts');
    const chosen = format === 'docx' ? formats.docxFormat : formats.odtFormat;
    const bytes = await chosen.write!(document as never);
    return { bytes: Array.from(bytes), back: await chosen.read!(bytes) };
  }, { format, document });
  if (process.env.AWDOC_OFFICE_OUT) {
    mkdirSync(process.env.AWDOC_OFFICE_OUT, { recursive: true });
    writeFileSync(path.join(process.env.AWDOC_OFFICE_OUT, `ornek.${format}`), Buffer.from(result.bytes));
  }
  return result as { bytes: number[]; back: Json };
}

const all = (node: Json, type: string): Json[] => [...(node.type === type ? [node] : []), ...(node.content ?? []).flatMap(child => all(child, type))];
const textOf = (node: Json): string => (node.type === 'text' ? node.text ?? '' : (node.content ?? []).map(textOf).join(''));
const marked = (node: Json, value: string) => all(node, 'text').find(text => text.text?.includes(value))?.marks ?? [];

for (const format of ['docx', 'odt'] as const) {
  test(`${format}: yazılan belge geri okunur; biçimler, liste, tablo, resim, formül ve sayfa korunur`, async ({ page }) => {
    await page.goto('/');
    const { back } = await roundTrip(page, format, sampleDocument());

    const headings = all(back, 'heading');
    expect(headings.map(heading => [heading.attrs?.level, textOf(heading)])).toEqual([[1, 'Birinci Başlık'], [2, 'İkinci başlık']]);
    expect(headings[0].attrs?.textAlign).toBe('center');

    const styled = all(back, 'paragraph').find(paragraph => textOf(paragraph).startsWith('Kalın'))!;
    expect(styled.attrs?.lineHeight).toBe('1.5');
    expect(styled.attrs?.indent).toBe(1);
    expect(styled.attrs?.textAlign).toBe('justify');
    expect(marked(back, 'Kalın').map(mark => mark.type)).toContain('bold');
    expect(marked(back, 'eğik').map(mark => mark.type)).toContain('italic');
    expect(marked(back, 'altı çizili').map(mark => mark.type)).toContain('underline');
    expect(marked(back, 'üstü çizili').map(mark => mark.type)).toContain('strike');
    const red = marked(back, 'kırmızı').find(mark => mark.type === 'textStyle')?.attrs;
    expect(red).toMatchObject({ color: '#c00000', fontSize: '16pt' });
    expect(red?.fontFamily).toMatch(/^Arial/);
    expect(marked(back, 'vurgulu').find(mark => mark.type === 'highlight')?.attrs?.color).toBe('#fff176');
    expect(textOf(styled)).toContain('  iki boşluk\tsekme ');
    expect(marked(back, 'bağlantı').find(mark => mark.type === 'link')?.attrs?.href).toBe('https://madematik.com/');
    expect(all(styled, 'hardBreak')).toHaveLength(1);
    const latex = all(back, 'formula')[0]?.attrs?.latex as string;
    expect(latex.replace(/\s/g, '').replace(/\^\{(\w)\}/g, '^$1')).toBe('\\frac{a+1}{2}+x^2+\\sqrt{b}');

    const bullet = back.content!.find(block => block.type === 'bulletList')!;
    expect(bullet.content!.map(item => textOf(item.content![0]))).toEqual(['madde bir', 'madde iki']);
    expect(bullet.content![0].content![1]?.type).toBe('orderedList');
    const third = back.content!.find(block => block.type === 'orderedList' && textOf(block).includes('üçten'))!;
    expect(third.attrs?.start).toBe(3);

    const table = all(back, 'table')[0];
    expect(table.content!.map(row => row.content!.map(cell => [cell.type, cell.attrs?.colspan, cell.attrs?.rowspan, textOf(cell)]))).toEqual([
      [['tableHeader', 2, 1, 'Başlık iki sütun'], ['tableHeader', 1, 1, 'Üç']],
      [['tableCell', 1, 2, 'İki satır'], ['tableCell', 1, 1, 'b1'], ['tableCell', 1, 1, 'c1']],
      [['tableCell', 1, 1, 'b2'], ['tableCell', 1, 1, 'c2']],
    ]);

    const images = all(back, 'image');
    expect(images.map(image => [image.attrs?.width, image.attrs?.wrap])).toEqual([[120, 'center'], [80, 'right']]);
    expect(images[0].attrs?.src).toMatch(/^data:image\/png;base64,/);

    expect(back.content!.filter(block => block.type === 'pageBreak')).toHaveLength(1);
    const lines = all(back, 'paragraph').map(textOf);
    expect(lines).toContain('1. Birinci soru? (10 puan)');
    expect(lines).toContain('A) bir');
    expect(lines).toContain('A) x\tB) y');
    expect(lines.at(-1)).toBe('Son paragraf.');

    expect(back.attrs?.page).toMatchObject({
      orientation: 'landscape', header: 'Fen Lisesi', footer: 'Başarılar', pageNumbers: 'bottom-right', numberFormat: 'number-of-total',
      margins: { top: 20, right: 15, bottom: 20, left: 15 },
    });
  });

  test(`${format}: açılan dosya düzenleyiciye gelir; Kaydet aynı biçimde yazar, soru eklenince awDOC olarak sorar`, async ({ page }) => {
    await page.goto('/');
    const plain = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ofis belgesi' }] }] };
    const { bytes } = await roundTrip(page, format, plain);
    await page.locator('#fileInput').setInputFiles({ name: `Rapor.${format}`, mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
    await expect(page.locator('#document')).toHaveText('Ofis belgesi');
    await expect(page.locator('#documentStatus')).toContainText(`Rapor.${format}`);
  });
}

test('Word Olarak Kaydet: sorulu belgenin Word kopyası yazılır, belge awDOC olarak kalır', async ({ page }) => {
  await fakeSavePicker(page, ['Sınav.docx', 'Sınav.awd']);
  await page.goto('/');
  await openFile(page, 'Sınav.awd', awdFile((sampleDocument() as { content: unknown[] }).content));
  await expect(page.locator('#document')).toContainText('Birinci soru?');
  await page.evaluate(() => (document.querySelector('#tool-saveDocx') as HTMLElement).click());
  await expect(page.locator('#toast')).toContainText('sorular, şıklar ve cevap anahtarı orada düz yazı');
  const files = await savedFiles(page);
  expect(files.map(file => file.name)).toContain('Sınav.docx');
});

test('eski Word (.doc) tarayıcıda açılmaz; ne yapılacağı söylenir', async ({ page }) => {
  await page.goto('/');
  await page.locator('#fileInput').setInputFiles({ name: 'Eski.doc', mimeType: 'application/msword', buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0]) });
  await expect(page.locator('#toast')).toContainText('LibreOffice kuruluysa açılır');
});
