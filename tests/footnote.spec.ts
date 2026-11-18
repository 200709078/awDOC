import { expect, test, type Page } from '@playwright/test';
import { openFile } from './helpers/fake-files';

const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
const docFile = (content: unknown[]) => JSON.stringify({ format: 'awDOC', version: 1, app: 'test', document: { type: 'doc', content } });
const withNote = (text: string, note: string) => ({ type: 'paragraph', content: [{ type: 'text', text }, { type: 'footnote', attrs: { text: note } }, { type: 'text', text: ' devam.' }] });
const pdfPages = (pdf: Buffer) => pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;

/** For every note: the sheet its number is on and the sheet its text is on; and lines outside the text areas. */
function layout(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('#editorHost')!;
    const style = getComputedStyle(host);
    const top = parseFloat(style.getPropertyValue('--margin-top'));
    const bottom = parseFloat(style.getPropertyValue('--margin-bottom'));
    const sheets = [...document.querySelectorAll('.page-sheet')].map(sheet => sheet.getBoundingClientRect());
    const sheetOf = (rect: DOMRect) => sheets.findIndex(sheet => rect.top >= sheet.top && rect.bottom <= sheet.bottom);
    const refs = [...document.querySelectorAll('#document .footnote-ref')].map(ref => sheetOf(ref.getBoundingClientRect()));
    const notes = [...document.querySelectorAll('#document .page-notes .page-notes__item')].map(item => sheetOf(item.getBoundingClientRect()));
    const lists = [...document.querySelectorAll('#document .page-notes__list')].map(list => {
      const rect = list.getBoundingClientRect();
      const sheet = sheets[sheetOf(rect)];
      return sheet ? Math.round(sheet.bottom - bottom - rect.bottom) : -999;
    });
    const walker = document.createTreeWalker(document.querySelector('#document')!, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const outside: string[] = [];
    while (walker.nextNode()) {
      if ((walker.currentNode.parentElement as HTMLElement).closest('.footnotes-list')) continue;
      range.selectNodeContents(walker.currentNode);
      for (const rect of range.getClientRects()) {
        if (rect.height === 0) continue;
        if (!sheets.some(sheet => rect.top >= sheet.top + top - 3 && rect.bottom <= sheet.bottom - bottom + 1)) outside.push(walker.currentNode.textContent!.slice(0, 20));
      }
    }
    return { refs, notes, lists, outside, sheets: sheets.length };
  });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
});

test('Dipnot: araçla eklenir, numarası metinde, yazısı sayfanın altında; tıklayınca düzenlenir, silinir', async ({ page }) => {
  await page.goto('/');
  await openFile(page, 'Not.awd', docFile([{ type: 'paragraph', content: [{ type: 'text', text: 'Fotosentez' }] }]));
  await page.locator('#document p').click();
  await page.keyboard.press('End');
  await page.locator('#group-references').click();
  await page.locator('#tool-footnote').click();
  await page.locator('#footnoteText').fill('Bitkilerin besin üretmesi.');
  await page.locator('#footnoteDialog').getByRole('button', { name: 'Tamam' }).click();
  await expect(page.locator('#document .footnote-ref')).toHaveCount(1);
  await expect(page.locator('#document .page-notes .page-notes__item')).toHaveText('1 Bitkilerin besin üretmesi.');
  const { lists, notes, refs } = await layout(page);
  expect(refs).toEqual([0]);
  expect(notes).toEqual([0]);
  // The notes end at the page's bottom margin.
  expect(Math.abs(lists[0])).toBeLessThanOrEqual(4);

  await page.locator('#document .footnote-ref').click();
  await expect(page.locator('#footnoteText')).toHaveValue('Bitkilerin besin üretmesi.');
  await page.locator('#footnoteText').fill('Klorofil ile.');
  await page.locator('#footnoteDialog').getByRole('button', { name: 'Tamam' }).click();
  await expect(page.locator('#document .page-notes .page-notes__item')).toHaveText('1 Klorofil ile.');

  // The continuous view lists the notes at the end.
  await page.locator('#group-page').click();
  await page.locator('#tool-continuousView').click();
  await expect(page.locator('#document .footnotes-list')).toBeVisible();
  await expect(page.locator('#document .footnotes-list .page-notes__item')).toHaveText('1 Klorofil ile.');

  await page.locator('#document .footnote-ref').click();
  await page.locator('#footnoteDialog').getByRole('button', { name: 'Dipnotu sil' }).click();
  await expect(page.locator('#document .footnote-ref')).toHaveCount(0);
  await expect(page.locator('#document .footnotes-list')).toHaveCount(0);
});

test('Dipnot: her not numarasıyla aynı sayfada; satırlar notlara taşmaz; yazdırma da aynı sayıda sayfa', async ({ page }) => {
  await page.goto('/');
  const content = Array.from({ length: 24 }, (_, index) => withNote(`${index + 1}. paragraf. ${LOREM.repeat(2)}`, `Not ${index + 1}: ${LOREM.slice(0, 40 + (index % 3) * 60)}`));
  await openFile(page, 'Notlar.awd', docFile(content));
  await expect(page.locator('#document .footnote-ref')).toHaveCount(24);
  await expect.poll(async () => (await layout(page)).sheets).toBeGreaterThan(2);
  const result = await layout(page);
  expect(result.notes).toEqual(result.refs);
  expect(result.outside).toEqual([]);
  for (const gap of result.lists) expect(Math.abs(gap)).toBeLessThanOrEqual(3);
  expect(pdfPages(await page.pdf({ preferCSSPageSize: true }))).toBe(result.sheets);
});
