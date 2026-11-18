import { expect, test } from '@playwright/test';
import { awdFile, openFile } from './helpers/fake-files';

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const heading = (level: number, text: string) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] });
const contentsEntries = (page: import('@playwright/test').Page) =>
  page.locator('#document .contents__entry').evaluateAll(items => items.map(item => [item.querySelector('.contents__text')!.textContent, item.querySelector('.contents__page')!.textContent]));

test('İçindekiler: başlıklar sayfa numaralarıyla listelenir, değişince yenilenir; tıklayınca başlığa gider', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openFile(page, 'Rapor.awd', awdFile([
    { type: 'paragraph' },
    heading(1, 'Giriş'), paragraph('Bir.'),
    { type: 'pageBreak' },
    heading(2, 'Yöntem'), paragraph('İki.'),
    { type: 'pageBreak' },
    heading(1, 'Sonuç'), paragraph('Üç.'),
  ]));
  await page.locator('#document p').first().click();
  await page.locator('#group-references').click();
  await page.locator('#tool-contents').click();
  await expect(page.locator('#document .contents')).toBeVisible();
  await expect.poll(() => contentsEntries(page)).toEqual([['Giriş', '1'], ['Yöntem', '2'], ['Sonuç', '3']]);

  // A new heading appears in the list at once.
  await page.locator('#document p', { hasText: 'Üç.' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Ekler');
  await page.locator('#group-paragraph').click();
  await page.locator('#tool-heading1').click();
  await expect.poll(() => contentsEntries(page)).toEqual([['Giriş', '1'], ['Yöntem', '2'], ['Sonuç', '3'], ['Ekler', '3']]);

  await page.locator('#document .contents__entry', { hasText: 'Yöntem' }).click();
  await expect.poll(() => page.evaluate(() => getSelection()?.anchorNode?.parentElement?.closest('h2')?.textContent)).toBe('Yöntem');
});

test('İçindekiler ve adres-mektup alanı Word ve LibreOffice dosyasında korunur', async ({ page }) => {
  await page.goto('/');
  const back = await page.evaluate(async () => {
    const formats = await import('/src/formats/index.ts');
    const doc = { type: 'doc', content: [
      { type: 'tableOfContents' },
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Bölüm' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Sayın ' }, { type: 'mergeField', attrs: { name: 'Ad Soyad' }, marks: [{ type: 'bold' }] }, { type: 'text', text: ',' }] },
    ] };
    const out: unknown[] = [];
    for (const format of [formats.docxFormat, formats.odtFormat]) out.push(await format.read!(await format.write!(doc as never)));
    return out as { content: { type: string; content?: { type: string; attrs?: { name?: string }; marks?: { type: string }[]; text?: string }[] }[] }[];
  });
  for (const document of back) {
    expect(document.content[0].type).toBe('tableOfContents');
    const field = document.content[2].content!.find(node => node.type === 'mergeField');
    expect(field?.attrs?.name).toBe('Ad Soyad');
    expect(field?.marks?.map(mark => mark.type)).toContain('bold');
  }
});

test('Adres-Mektup: sütunlar alan olarak eklenir; birleştirince her satır ayrı sayfada, numaralar ve cevap anahtarı kopya kopya', async ({ page }) => {
  await page.goto('/');
  await openFile(page, 'Sınav.awd', awdFile([
    { type: 'paragraph', content: [{ type: 'text', text: 'Öğrenci: ' }] },
    { type: 'question', attrs: { points: null }, content: [paragraph('Soru?'), { type: 'choices', attrs: { layout: 'list' }, content: [
      { type: 'choice', attrs: { correct: true }, content: [{ type: 'text', text: 'a' }] },
      { type: 'choice', attrs: { correct: false }, content: [{ type: 'text', text: 'b' }] },
    ] }] },
    { type: 'paragraph' },
    { type: 'pageBreak' },
    { type: 'answerKey' },
    { type: 'paragraph' },
  ]));
  await page.locator('#document p').first().click();
  await page.keyboard.press('End');
  await page.locator('#group-references').click();
  await page.locator('#tool-mailMerge').click();
  const dialog = page.locator('#mergeDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#mergeRun')).toBeDisabled();
  // Excel in Turkish: ";" between the columns, quotes around a value with one in it.
  await page.locator('#mergeFile').setInputFiles({ name: 'sinif.csv', mimeType: 'text/csv', buffer: Buffer.from('﻿Ad;Sınıf\nAyşe Işık;"9-A"\nÖmer Çelik;9-B\n', 'utf8') });
  await expect(page.locator('#mergeSource')).toHaveText('sinif.csv: 2 satır, 2 sütun.');
  await dialog.getByRole('button', { name: '«Ad»' }).click();
  await expect(page.locator('#document .merge-field')).toHaveText('«Ad»');
  await expect(dialog.locator('#mergeRun')).toBeEnabled();
  await dialog.locator('#mergeRun').click();
  // The field just put in is an unsaved change: asked about first.
  await page.locator('#unsavedDialog').getByRole('button', { name: 'Kaydetme', exact: true }).click();
  await expect(page.locator('#documentStatus')).toContainText('Sınav - birleştirilmiş');
  await expect(page.locator('#document p').filter({ hasText: 'Öğrenci:' })).toHaveText(['Öğrenci: Ayşe Işık', 'Öğrenci: Ömer Çelik']);
  await expect(page.locator('#document .page-break[data-restart]')).toHaveCount(1);
  // Each copy's answer key lists its own question; in a Word copy each is number 1 again.
  await expect(page.locator('#document .answer-key__list').first().locator('li')).toHaveText(['1. A']);
  await expect(page.locator('#document .answer-key__list').nth(1).locator('li')).toHaveText(['1. A']);
  const lines = await page.evaluate(async () => {
    const { mergeDocument } = await import('/src/app/mail-merge.ts');
    const { officeBlocks } = await import('/src/formats/office.ts');
    const doc = { type: 'doc', content: [
      { type: 'question', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Soru?' }] }] },
      { type: 'answerKey' },
    ] };
    const text = (node: { text?: string; content?: unknown[] }): string => node.text ?? (node.content ?? []).map(child => text(child as never)).join('');
    return officeBlocks(mergeDocument(doc, { name: 'x', columns: ['Ad'], rows: [['a'], ['b']] })).map(block => text(block));
  });
  expect(lines.filter(line => line.startsWith('1. Soru?'))).toHaveLength(2);
  expect(lines.filter(line => line === 'Cevap Anahtarı: 1. —')).toHaveLength(2);
});

test('Adres-Mektup: awCELL tablosu veri olur', async ({ page }) => {
  await page.goto('/');
  const data = await page.evaluate(async () => {
    const { readMergeData } = await import('/src/app/mail-merge.ts');
    const file = { app: 'awCELL', version: 1, activeSheetIndex: 0, sheets: [{ tableData: [[{ value: 'Ad' }, { value: 'Not' }], [{ value: 'Ali' }, { value: 85 }], null, [{ value: 'Su' }]] }] };
    return readMergeData('liste.awc', new TextEncoder().encode(JSON.stringify(file)));
  });
  expect(data).toEqual({ name: 'liste.awc', columns: ['Ad', 'Not'], rows: [['Ali', '85'], ['Su', '']] });
});
