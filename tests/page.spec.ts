import { expect, test, type Page } from '@playwright/test';
import { normalizePageSetup } from '../src/editor/page-setup';
import { fakeSavePicker, openFile, savedFiles } from './helpers/fake-files';

const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';

function docFile(content: unknown[], pageSetup?: unknown): string {
  const document = { type: 'doc', ...(pageSetup ? { attrs: { page: pageSetup } } : {}), content };
  return JSON.stringify({ format: 'awDOC', version: 1, app: 'test', document });
}

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

/** Every line of text lies inside some sheet's text area (between its top and bottom margins). */
function linesOutsideTextArea(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('#editorHost')!;
    const style = getComputedStyle(host);
    const top = parseFloat(style.getPropertyValue('--margin-top'));
    const bottom = parseFloat(style.getPropertyValue('--margin-bottom'));
    const sheets = [...document.querySelectorAll('.page-sheet')].map(sheet => sheet.getBoundingClientRect());
    const walker = document.createTreeWalker(document.querySelector('#document')!, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const wrong: string[] = [];
    while (walker.nextNode()) {
      range.selectNodeContents(walker.currentNode);
      for (const rect of range.getClientRects()) {
        if (rect.height === 0) continue;
        // A glyph's box is a little taller than its line (Carlito), so the top may reach 3 px into the margin.
        const inside = sheets.some(sheet => rect.top >= sheet.top + top - 3 && rect.bottom <= sheet.bottom - bottom + 1);
        if (!inside) wrong.push(`${walker.currentNode.textContent!.slice(0, 20)} @ ${Math.round(rect.top)}`);
      }
    }
    return wrong;
  });
}

/** Where the gaps are and how high: equal before and after a full new layout. */
function gaps(page: Page): Promise<string[]> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.page-gap')]
    .map(gap => `${gap.className} ${Math.round(gap.getBoundingClientRect().top)} ${Math.round(gap.getBoundingClientRect().height)}`));
}

function pdfPages(pdf: Buffer): number {
  return pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
});

test('sayfa görünümü geniş ekranda açılır; uzun paragraf sayfa sınırında satır satır bölünür, yazdırma da aynı yerden böler', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#editorHost')).toHaveClass(/is-paged/);
  await expect(page.locator('.page-sheet')).toHaveCount(1);
  await openFile(page, 'Uzun.awd', docFile([paragraph('Başlangıç'), paragraph(LOREM.repeat(40)), paragraph('Son satır')]));
  await expect(page.locator('#document')).toContainText('Son satır');
  await expect(page.locator('.page-sheet')).toHaveCount(2);
  // The break is inside the long paragraph, before one of its lines.
  await expect(page.locator('#document p .page-gap--line')).toHaveCount(1);
  expect(await linesOutsideTextArea(page)).toEqual([]);
  // A full new layout finds the same gaps.
  const before = await gaps(page);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(100);
  expect(await gaps(page)).toEqual(before);
  expect(pdfPages(await page.pdf({ preferCSSPageSize: true }))).toBe(2);
});

test('yazdıkça metin yeni sayfaya geçer; ortadaki düzenlemeden sonra da satırlar kenar boşluklarına taşmaz', async ({ page }) => {
  await page.goto('/');
  await openFile(page, 'Uzun.awd', docFile(Array.from({ length: 60 }, (_, i) => paragraph(`${i + 1}. ${LOREM.repeat(i % 3 + 1)}`))));
  await expect(page.locator('#document')).toContainText('60. Lorem');
  const sheets = await page.locator('.page-sheet').count();
  expect(sheets).toBeGreaterThan(3);
  expect(await linesOutsideTextArea(page)).toEqual([]);

  // Typing in the third paragraph pushes everything below it down.
  await page.locator('#document p').nth(2).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Araya yazılan uzunca bir cümle, satırları ve sayfaları kaydırır.'.repeat(4));
  await page.keyboard.press('Enter');
  await page.keyboard.type('Yeni paragraf');
  await expect(page.locator('#document')).toContainText('Yeni paragraf');
  await page.waitForTimeout(100);
  expect(await linesOutsideTextArea(page)).toEqual([]);
  const afterTyping = await gaps(page);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(100);
  expect(await gaps(page)).toEqual(afterTyping);

  // Everything deleted: one page again.
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await expect(page.locator('.page-sheet')).toHaveCount(1);
  await expect(page.locator('.page-gap')).toHaveCount(0);
});

test('Ctrl+Enter sayfa sonu koyar; sonrası yeni sayfada başlar, Geri Al kaldırır; listede çalışmaz', async ({ page }) => {
  await fakeSavePicker(page, ['Sonlu.awd']);
  await page.goto('/');
  await page.keyboard.type('Birinci sayfa');
  await page.keyboard.press('Control+Enter');
  await page.keyboard.type('İkinci sayfa');
  await expect(page.locator('.page-sheet')).toHaveCount(2);
  await expect(page.locator('#document .page-break')).toHaveCount(1);
  // The paragraph begins on the first sheet (the gap is inside it); its text is on the second.
  const [sheetTop, textTop] = await page.evaluate(() => {
    const paragraph = [...document.querySelectorAll('#document p')].find(p => p.textContent === 'İkinci sayfa')!;
    const range = document.createRange();
    range.selectNodeContents(paragraph.lastChild!);
    return [document.querySelectorAll('.page-sheet')[1].getBoundingClientRect().top, range.getBoundingClientRect().top];
  });
  expect(textTop).toBeGreaterThan(sheetTop);
  expect(await linesOutsideTextArea(page)).toEqual([]);

  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await savedFiles(page)).length).toBe(1);
  const saved = JSON.parse((await savedFiles(page))[0].text);
  expect(saved.document.content.map((node: { type: string }) => node.type)).toEqual(['paragraph', 'pageBreak', 'paragraph']);

  for (let i = 0; i < 5 && await page.locator('#document .page-break').count(); i++) await page.keyboard.press('Control+z');
  await expect(page.locator('#document .page-break')).toHaveCount(0);
  await expect(page.locator('.page-sheet')).toHaveCount(1);

  // Inside a list the key does nothing (a page break sits between the document's paragraphs).
  await page.keyboard.press('Control+a');
  await page.keyboard.type('- madde');
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('#document .page-break')).toHaveCount(0);
});

test('Sayfa Düzeni: yatay sayfa, kenar boşlukları, üst bilgi ve sayfa numarası belgeyle kaydedilir; Geri Al geri döndürür', async ({ page }) => {
  await fakeSavePicker(page, ['Düzen.awd']);
  await page.goto('/');
  await page.keyboard.type('Sınav kâğıdı');
  await page.locator('#group-page').click();
  await page.locator('#tool-pageSetup').click();
  const dialog = page.locator('#pageDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#pageMarginTop')).toHaveValue('2,5');

  // A wrong value keeps the window open with the reason.
  await dialog.locator('#pageMarginLeft').fill('abc');
  await dialog.getByRole('button', { name: 'Uygula' }).click();
  await expect(dialog.locator('#pageError')).toBeVisible();
  await expect(dialog).toBeVisible();

  await dialog.locator('input[value="landscape"]').check();
  await dialog.locator('#pageMarginPreset').selectOption('narrow');
  await expect(dialog.locator('#pageMarginLeft')).toHaveValue('1,27');
  await dialog.locator('#pageMarginTop').fill('2');
  await expect(dialog.locator('#pageMarginPreset')).toHaveValue('custom');
  await dialog.locator('#pageHeader').fill('Matematik 1. Yazılı');
  await dialog.locator('#pageNumbers').selectOption('bottom-center');
  await dialog.locator('#pageNumberFormat').selectOption('page-number');
  await dialog.getByRole('button', { name: 'Uygula' }).click();
  await expect(dialog).toBeHidden();
  // Back in the text, where it was: typing goes on at the end.
  await expect(page.locator('#document')).toBeFocused();
  await page.keyboard.type('!');
  await expect(page.locator('#document')).toHaveText('Sınav kâğıdı!');

  const sheet = page.locator('.page-sheet').first();
  await expect.poll(async () => Math.round((await sheet.boundingBox())!.width)).toBe(1123);
  await expect(sheet.locator('.page-sheet__header')).toHaveText('Matematik 1. Yazılı');
  await expect(sheet.locator('.page-sheet__number')).toHaveText('Sayfa 1');
  const printStyle = await page.locator('#pageStyle').textContent();
  expect(printStyle).toContain('size: 297mm 210mm');
  expect(printStyle).toContain('margin: 20mm 12.7mm 12.7mm 12.7mm');
  expect(printStyle).toContain('"Matematik 1. Yazılı"');
  expect(printStyle).toContain('"Sayfa " counter(page)');
  expect(await linesOutsideTextArea(page)).toEqual([]);

  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await savedFiles(page)).length).toBe(1);
  const saved = JSON.parse((await savedFiles(page))[0].text);
  expect(saved.document.attrs.page).toMatchObject({
    orientation: 'landscape',
    margins: { top: 20, right: 12.7, bottom: 12.7, left: 12.7 },
    header: 'Matematik 1. Yazılı',
    pageNumbers: 'bottom-center',
    numberFormat: 'page-number',
  });

  // Ctrl+Z takes the page change back (after the "!").
  await page.keyboard.press('Control+z');
  await expect(page.locator('#document')).toHaveText('Sınav kâğıdı');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => Math.round((await sheet.boundingBox())!.width)).toBe(794);
  await expect(sheet.locator('.page-sheet__header')).toHaveText('');
});

test('açılan dosyanın sayfa ayarı uygulanır; Dikey / Yatay Sayfa ▾ içinden değişir', async ({ page }) => {
  await page.goto('/');
  await openFile(page, 'Yatay.awd', docFile([paragraph('Yatay belge')], { orientation: 'landscape', footer: 'Alt', pageNumbers: 'bottom-right' }));
  await expect(page.locator('#document')).toHaveText('Yatay belge');
  await expect.poll(async () => Math.round((await page.locator('.page-sheet').first().boundingBox())!.width)).toBe(1123);
  await expect(page.locator('.page-sheet__footer').first()).toHaveText('Alt');
  await expect(page.locator('.page-sheet__number').first()).toHaveText('1');

  await page.locator('#tool-newDocument').click();
  await expect.poll(async () => Math.round((await page.locator('.page-sheet').first().boundingBox())!.width)).toBe(794);
  await page.locator('#group-page').click();
  await page.locator('#tool-landscape').click();
  await expect.poll(async () => Math.round((await page.locator('.page-sheet').first().boundingBox())!.width)).toBe(1123);
  await page.locator('#group-page').click();
  await expect(page.locator('#tool-landscape')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#tool-portrait').click();
  await expect.poll(async () => Math.round((await page.locator('.page-sheet').first().boundingBox())!.width)).toBe(794);
});

test('Sürekli görünüm sayfaları gizler ama sayfaları bilir; seçim hatırlanır', async ({ page }) => {
  await page.goto('/');
  await openFile(page, 'Uzun.awd', docFile([paragraph(LOREM.repeat(40))]));
  await expect(page.locator('.page-sheet')).toHaveCount(2);
  await page.locator('#group-page').click();
  await page.locator('#tool-continuousView').click();
  await expect(page.locator('#editorHost')).not.toHaveClass(/is-paged/);
  await expect(page.locator('.page-sheets')).toBeHidden();
  await expect(page.locator('.page-gap').first()).toBeHidden();
  // The text column is the page's, so the pages are still known (and printing breaks them alike).
  await expect(page.locator('#editorHost')).toHaveClass(/is-paginated/);
  await page.locator('#group-page').click();
  await expect(page.locator('.toolbar__section-title', { hasText: 'Sayfa (2 sayfa)' })).toBeVisible();
  expect(pdfPages(await page.pdf({ preferCSSPageSize: true }))).toBe(2);

  await page.reload();
  await expect(page.locator('#editorHost')).not.toHaveClass(/is-paged/);
  await page.locator('#group-page').click();
  await page.locator('#tool-pageView').click();
  await expect(page.locator('#editorHost')).toHaveClass(/is-paged/);
});

test('telefonda sürekli görünümle açılır; sayfa bölünmesi yazdırmaya bırakılır', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await expect(page.locator('#editorHost')).not.toHaveClass(/is-paged/);
  await expect(page.locator('#editorHost')).not.toHaveClass(/is-paginated/);
});

test('dosyadaki sayfa ayarı denetlenir: bilinmeyen değerler varsayılana, aşırı kenar boşlukları sınıra döner', () => {
  expect(normalizePageSetup(undefined)).toEqual(normalizePageSetup({}));
  const setup = normalizePageSetup({ orientation: 'diagonal', margins: { top: 1, left: 'x', right: 200 }, header: '  Çok\n satırlı   başlık ', pageNumbers: 'middle' });
  expect(setup.orientation).toBe('portrait');
  expect(setup.margins).toEqual({ top: 5, right: 80, bottom: 25, left: 25 });
  expect(setup.header).toBe('Çok satırlı başlık');
  expect(setup.pageNumbers).toBe('none');
});
