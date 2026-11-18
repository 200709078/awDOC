import { expect, test, type Page } from '@playwright/test';
import { awdFile, openFile } from './helpers/fake-files';

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const question = (i: number) => ({
  type: 'question', attrs: { points: 5 }, content: [
    p(`Soru ${i}: ${'Bir kenarı verilen karenin alanı ve çevresi nedir? '.repeat(1 + (i % 3))}`),
    { type: 'choices', attrs: { layout: 'list' }, content: ['A', 'B', 'C', 'D'].map(letter => ({ type: 'choice', attrs: { correct: false }, content: [{ type: 'text', text: `şık ${letter}${i}` }] })) },
  ],
});
const exam = (count: number) => awdFile([
  { type: 'heading', attrs: { level: 1, textAlign: 'center' }, content: [{ type: 'text', text: 'MATEMATİK 1. YAZILI' }] },
  p('Adı Soyadı: ............  Numarası: .........'),
  { type: 'columnsStart' },
  ...Array.from({ length: count }, (_, index) => question(index + 1)),
]);
const pdfPages = (pdf: Buffer) => pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;

/** Each question: its sheet, its column (0 left, 1 right); and any that leave the text area or overlap. */
function columnsLayout(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('#editorHost')!;
    const style = getComputedStyle(host);
    const marginTop = parseFloat(style.getPropertyValue('--margin-top'));
    const marginBottom = parseFloat(style.getPropertyValue('--margin-bottom'));
    const marginLeft = parseFloat(style.getPropertyValue('--margin-left'));
    const sheets = [...document.querySelectorAll('.page-sheet')].map(sheet => sheet.getBoundingClientRect());
    const questions = [...document.querySelectorAll<HTMLElement>('#document > .question')].map(element => element.getBoundingClientRect());
    const placed = questions.map(rect => {
      const sheet = sheets.findIndex(candidate => rect.top >= candidate.top + marginTop - 3 && rect.bottom <= candidate.bottom - marginBottom + 1);
      const column = sheet < 0 ? -1 : rect.left - (sheets[sheet].left + marginLeft) < 20 ? 0 : 1;
      return { sheet, column, top: rect.top, bottom: rect.bottom };
    });
    const overlaps = placed.filter((a, i) => placed.some((b, j) => j !== i && a.sheet === b.sheet && a.column === b.column && a.top < b.bottom - 1 && b.top < a.bottom - 1)).length;
    return { places: placed.map(place => `${place.sheet}/${place.column}`), overlaps, sheets: sheets.length };
  });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
});

test('İki sütun: başlık tam genişlikte, sorular sütun sütun ve sayfa sayfa; kâğıt aynı sayıda sayfa', async ({ page }) => {
  await page.goto('/');
  await openFile(page, 'Sınav.awd', exam(14));
  await expect(page.locator('#document > .question')).toHaveCount(14);
  await expect.poll(async () => (await columnsLayout(page)).sheets).toBe(2);
  const layout = await columnsLayout(page);
  expect(layout.places.every(place => !place.startsWith('-1'))).toBe(true);
  expect(layout.overlaps).toBe(0);
  // In order: left column, then right, then the next page.
  const order = layout.places.map(place => place.split('/').map(Number)).map(([sheet, column]) => sheet * 2 + column);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(new Set(order).size).toBe(4);
  expect(pdfPages(await page.pdf({ preferCSSPageSize: true }))).toBe(2);

  // Writing on in a question of the right column: everything stays in place, no overlaps.
  await page.locator('#document > .question', { hasText: 'Soru 6:' }).locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Ek açıklama yazılıyor ve satır uzuyor, uzuyor, uzuyor.');
  await expect.poll(async () => (await columnsLayout(page)).overlaps).toBe(0);
  expect((await columnsLayout(page)).places.every(place => !place.startsWith('-1'))).toBe(true);
});

test('İki sütun aracı işareti imlecin yerine koyar, yeniden basınca kaldırır', async ({ page }) => {
  await page.goto('/');
  await openFile(page, 'Sınav.awd', awdFile([p('Başlık satırı'), ...Array.from({ length: 4 }, (_, index) => question(index + 1))]));
  await page.locator('#document > .question').first().locator('p').first().click();
  await page.locator('#group-page').click();
  await page.locator('#tool-twoColumns').click();
  await expect(page.locator('#document > .columns-start')).toHaveCount(1);
  await expect(page.locator('#document > .before-columns')).toHaveCount(1);
  await expect(page.locator('#document > .question.in-columns')).toHaveCount(4);
  await expect.poll(async () => (await columnsLayout(page)).places).toEqual(['0/0', '0/0', '0/0', '0/0']);

  await page.locator('#group-page').click();
  await expect(page.locator('#tool-twoColumns')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#tool-twoColumns').click();
  await expect(page.locator('#document > .columns-start')).toHaveCount(0);
  await expect(page.locator('#document > .in-columns')).toHaveCount(0);
});

test('İki sütun Word ve LibreOffice dosyasında korunur', async ({ page }) => {
  await page.goto('/');
  const document = JSON.parse(exam(6)).document;
  const back = await page.evaluate(async doc => {
    const formats = await import('/src/formats/index.ts');
    const out: { type: string }[][] = [];
    for (const format of [formats.docxFormat, formats.odtFormat]) {
      const bytes = await format.write!(doc as never);
      if ((window as unknown as { keep?: Uint8Array[] }).keep) (window as unknown as { keep: Uint8Array[] }).keep.push(bytes);
      out.push(((await format.read!(bytes)).content ?? []) as { type: string }[]);
    }
    return out.map(content => content.map(block => block.type));
  }, document);
  for (const types of back) {
    expect(types.slice(0, 3)).toEqual(['heading', 'paragraph', 'columnsStart']);
    expect(types.filter(type => type === 'columnsStart')).toHaveLength(1);
  }
});
