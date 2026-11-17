import { expect, test } from '@playwright/test';
import { fakeSavePicker, openFile, savedFiles } from './helpers/fake-files';

async function insertTable(page: import('@playwright/test').Page, rows: number, columns: number, header = false) {
  await page.locator('#group-table').click();
  await page.locator('#tool-insertTable').click();
  await page.locator('#tableRows').fill(String(rows));
  await page.locator('#tableColumns').fill(String(columns));
  if (header) await page.locator('#tableHeader').check();
  await page.locator('#tableDialog').getByRole('button', { name: 'Ekle' }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#document')).toBeFocused();
});

test('tablo eklenir; imleç ilk hücrede, Tab ile hücreler arasında gezilir', async ({ page }) => {
  await insertTable(page, 2, 3);
  await expect(page.locator('#document table tr')).toHaveCount(2);
  await expect(page.locator('#document table tr').first().locator('td')).toHaveCount(3);
  await page.keyboard.type('A1');
  await page.keyboard.press('Tab');
  await page.keyboard.type('B1');
  await expect(page.locator('#document td').nth(1)).toHaveText('B1');
  await expect(page.locator('#group-table')).toHaveClass(/is-marked/);
  // Tablonun içindeyken yeni tablo eklenmez.
  await page.locator('#group-table').click();
  await expect(page.locator('#tool-insertTable')).toBeDisabled();
});

test('tablo dışındayken satır/sütun araçları devre dışı', async ({ page }) => {
  await page.locator('#group-table').click();
  for (const id of ['addRowBefore', 'deleteRow', 'addColumnAfter', 'mergeCells', 'deleteTable']) {
    await expect(page.locator(`#tool-${id}`)).toBeDisabled();
  }
  await expect(page.locator('#tool-insertTable')).toBeEnabled();
});

test('satır ve sütun eklenir, silinir; başlık satırı açılıp kapanır; tablo silinir', async ({ page }) => {
  await insertTable(page, 2, 2);
  const table = page.locator('#document table');
  await page.locator('#group-table').click();
  await page.locator('#tool-addRowAfter').click();
  await expect(table.locator('tr')).toHaveCount(3);
  await page.locator('#group-table').click();
  await page.locator('#tool-addColumnBefore').click();
  await expect(table.locator('tr').first().locator('td')).toHaveCount(3);
  await page.locator('#group-table').click();
  await page.locator('#tool-deleteColumn').click();
  await expect(table.locator('tr').first().locator('td')).toHaveCount(2);
  await page.locator('#group-table').click();
  await page.locator('#tool-toggleHeaderRow').click();
  await expect(table.locator('th')).toHaveCount(2);
  await page.locator('#group-table').click();
  await expect(page.locator('#tool-toggleHeaderRow')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#tool-deleteRow').click();
  await expect(table.locator('tr')).toHaveCount(2);
  await page.locator('#group-table').click();
  await page.locator('#tool-deleteTable').click();
  await expect(page.locator('#document table')).toHaveCount(0);
});

test('seçilen hücreler birleştirilir ve yeniden bölünür', async ({ page }) => {
  await insertTable(page, 2, 2);
  await page.keyboard.type('sol');
  // İki hücre parmakla ya da fareyle sürüklenerek seçilir.
  const [first, second] = [await page.locator('#document td').nth(0).boundingBox(), await page.locator('#document td').nth(1).boundingBox()];
  await page.mouse.move(first!.x + 10, first!.y + first!.height / 2);
  await page.mouse.down();
  await page.mouse.move(second!.x + second!.width / 2, second!.y + second!.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#document .selectedCell')).toHaveCount(2);
  await page.locator('#group-table').click();
  await expect(page.locator('#tool-mergeCells')).toBeEnabled();
  await page.locator('#tool-mergeCells').click();
  await expect(page.locator('#document td[colspan="2"]')).toHaveCount(1);
  await page.locator('#group-table').click();
  await page.locator('#tool-splitCell').click();
  await expect(page.locator('#document td[colspan="2"]')).toHaveCount(0);
  await expect(page.locator('#document tr').first().locator('td')).toHaveCount(2);
});

test('tablo .awd ile korunur; düz metinde hücreler sekmeyle ayrılır', async ({ page }) => {
  await fakeSavePicker(page, ['Tablolu.awd']);
  await page.goto('/');
  await insertTable(page, 1, 2, true);
  await page.keyboard.type('Ad');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Puan');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#documentStatus')).toHaveText('Tablolu');
  const [file] = await savedFiles(page);
  await page.locator('#tool-newDocument').click();
  await openFile(page, 'Tablolu.awd', file.text);
  await expect(page.locator('#document th')).toHaveText(['Ad', 'Puan']);
  Object.assign(globalThis, { __APP_VERSION__: 'test' });
  const { txtFormat } = await import('../src/formats/txt');
  const text = new TextDecoder().decode(await txtFormat.write!(JSON.parse(file.text).document));
  expect(text).toContain('Ad\tPuan');
});
