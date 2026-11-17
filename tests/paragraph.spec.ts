import { expect, test } from '@playwright/test';
import { fakeSavePicker, openFile, savedFiles } from './helpers/fake-files';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#document')).toBeFocused();
});

test('Tab girintiyi artırır, odak belgede kalır; Shift+Tab azaltır', async ({ page }) => {
  await page.keyboard.type('paragraf');
  await page.keyboard.press('Tab');
  await expect(page.locator('#document')).toBeFocused();
  const paragraph = page.locator('#document p').first();
  await expect(paragraph).toHaveCSS('margin-left', '48px');
  await page.keyboard.press('Tab');
  await expect(paragraph).toHaveCSS('margin-left', '96px');
  await expect(page.locator('#group-align')).toHaveClass(/is-marked/);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(paragraph).toHaveCSS('margin-left', '0px');
  await expect(paragraph).toHaveText('paragraf');
});

test('Hizalama ▾: girinti düğmeleri; en sola gelince Azalt devre dışı', async ({ page }) => {
  await page.keyboard.type('yazı');
  await page.locator('#group-align').click();
  await expect(page.locator('#tool-outdent')).toBeDisabled();
  await page.locator('#tool-indent').click();
  await expect(page.locator('#group-align-panel')).toBeHidden();
  await expect(page.locator('#document p').first()).toHaveCSS('margin-left', '48px');
  await page.locator('#group-align').click();
  await expect(page.locator('#tool-outdent')).toBeEnabled();
  await page.locator('#tool-outdent').click();
  await expect(page.locator('#document p').first()).toHaveCSS('margin-left', '0px');
});

test('listede Tab maddeyi bir öncekinin altına alır', async ({ page }) => {
  await page.locator('#group-list').click();
  await page.locator('#tool-bulletList').click();
  await page.keyboard.type('bir');
  await page.keyboard.press('Enter');
  await page.keyboard.type('iki');
  await page.keyboard.press('Tab');
  await expect(page.locator('#document ul ul li')).toHaveText('iki');
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#document ul ul')).toHaveCount(0);
});

test('satır aralığı: 2,0 seçilir ve işaretlenir; varsayılan 1,15 ayarı kaldırır', async ({ page }) => {
  await page.keyboard.type('satır');
  await page.locator('#group-align').click();
  await expect(page.locator('#tool-lineHeight-1_15')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tool-lineHeight-1_15')).toContainText('1,15 (varsayılan)');
  await page.locator('#tool-lineHeight-2').click();
  const paragraph = page.locator('#document p').first();
  await expect(paragraph).toHaveAttribute('style', /line-height: 2/);
  await page.locator('#group-align').click();
  await expect(page.locator('#tool-lineHeight-2')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#tool-lineHeight-1_15').click();
  await expect(paragraph).not.toHaveAttribute('style', /line-height/);
});

test('girinti ve satır aralığı .awd ile korunur', async ({ page }) => {
  await fakeSavePicker(page, ['Düzen.awd']);
  await page.goto('/');
  await page.keyboard.type('girintili');
  await page.keyboard.press('Tab');
  await page.locator('#group-align').click();
  await page.locator('#tool-lineHeight-1_5').click();
  await page.keyboard.press('Control+s');
  await expect(page.locator('#documentStatus')).toHaveText('Düzen');
  const [file] = await savedFiles(page);
  expect(JSON.parse(file.text).document.content[0].attrs).toMatchObject({ indent: 1, lineHeight: '1.5' });
  await page.locator('#tool-newDocument').click();
  await openFile(page, 'Düzen.awd', file.text);
  const paragraph = page.locator('#document p').first();
  await expect(paragraph).toHaveCSS('margin-left', '48px');
  await expect(paragraph).toHaveAttribute('style', /line-height: 1.5/);
});
