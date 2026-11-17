import { expect, test } from '@playwright/test';
import { fakeSavePicker, openFile, savedFiles } from './helpers/fake-files';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#document')).toBeFocused();
});

test('Yazı ▾: renk, vurgu ve boyut art arda seçilir; boyut başlıkta görünür', async ({ page }) => {
  await page.locator('#group-text').click();
  const panel = page.locator('#group-text-panel');
  await expect(panel).toContainText('Boyut: 12');
  await page.locator('#tool-color-c00000').click();
  await page.locator('#tool-highlight-fff176').click();
  await page.locator('#tool-growText').click();
  await page.locator('#tool-growText').click();
  await expect(panel).toContainText('Boyut: 16');
  await expect(panel).toBeVisible();
  await page.keyboard.type('önemli');
  const span = page.locator('#document span[style*="color"]');
  await expect(span).toHaveText('önemli');
  await expect(span).toHaveCSS('color', 'rgb(192, 0, 0)');
  await expect(span).toHaveCSS('font-size', '21.3333px');
  await expect(page.locator('#document mark')).toHaveCSS('background-color', 'rgb(255, 241, 118)');
  await expect(page.locator('#tool-color-c00000')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tool-color-auto')).toHaveAttribute('aria-pressed', 'false');
  // A'nın altındaki çizgi seçili rengi gösterir; grup düğmesinde nokta var.
  await expect(page.locator('#group-text .toolbar__icon path[stroke="#c00000"]')).toHaveCount(1);
  await expect(page.locator('#group-text')).toHaveClass(/is-marked/);
  await page.locator('#tool-shrinkText').click();
  await expect(panel).toContainText('Boyut: 14');
});

test('Yazıyı Küçült en küçük boyutta, Büyüt en büyükte devre dışı', async ({ page }) => {
  await page.locator('#group-text').click();
  for (let step = 0; step < 4; step++) await page.locator('#tool-shrinkText').click();
  await expect(page.locator('#group-text-panel')).toContainText('Boyut: 8');
  await expect(page.locator('#tool-shrinkText')).toBeDisabled();
  for (let step = 0; step < 13; step++) await page.locator('#tool-growText').click();
  await expect(page.locator('#group-text-panel')).toContainText('Boyut: 72');
  await expect(page.locator('#tool-growText')).toBeDisabled();
});

test('başlıkta boyut başlığın kendi boyutundan başlar', async ({ page }) => {
  await page.keyboard.type('Başlık');
  await page.locator('#group-paragraph').click();
  await page.locator('#tool-heading1').click();
  await page.locator('#group-text').click();
  await expect(page.locator('#group-text-panel')).toContainText('Boyut: 20');
});

test('Yazı Tipi ▾: adlar kendi yazı tipiyle; seçilen işaretlenir, Calibri ayarı kaldırır', async ({ page }) => {
  await page.locator('#group-font').click();
  await expect(page.locator('#tool-font-times-new-roman .toolbar__label')).toHaveCSS('font-family', /Times New Roman/);
  await expect(page.locator('#tool-font-calibri')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#tool-font-times-new-roman').click();
  await expect(page.locator('#group-font-panel')).toBeHidden();
  await page.keyboard.type('Times ile');
  await expect(page.locator('#document span[style*="font-family"]')).toHaveText('Times ile');
  await expect(page.locator('#group-font')).toHaveClass(/is-marked/);
  await page.locator('#group-font').click();
  await expect(page.locator('#tool-font-times-new-roman')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#tool-font-calibri').click();
  await page.keyboard.type(' sonra');
  await expect(page.locator('#group-font')).not.toHaveClass(/is-marked/);
});

test('biçimler .awd ile kaydedilip geri açılınca korunur', async ({ page }) => {
  await fakeSavePicker(page, ['Renkli.awd']);
  await page.goto('/');
  await page.locator('#group-text').click();
  await page.locator('#tool-color-0070c0').click();
  await page.locator('#tool-highlight-a5f3a5').click();
  await page.locator('#tool-growText').click();
  await page.keyboard.type('mavi');
  await page.locator('#group-font').click();
  await page.locator('#tool-font-courier-new').click();
  await page.keyboard.type(' kod');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#documentStatus')).toHaveText('Renkli');
  const [file] = await savedFiles(page);
  await page.locator('#tool-newDocument').click();
  await openFile(page, 'Renkli.awd', file.text);
  await expect(page.locator('#document span[style*="color"]').first()).toHaveCSS('color', 'rgb(0, 112, 192)');
  await expect(page.locator('#document mark').first()).toHaveCSS('background-color', 'rgb(165, 243, 165)');
  await expect(page.locator('#document span[style*="font-family"]')).toHaveText(' kod');
  await expect(page.locator('#document span[style*="font-size: 14pt"]').first()).toBeVisible();
});

test('☰ içinde Yazı ▾: renk kutucukları yazısız, sıralı; Diğer renk düğmesi var', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await page.locator('#toolbarMenuButton').click();
  await page.locator('#toolbarMenu #group-font').click();
  await expect(page.locator('#tool-font-arial .toolbar__label')).toBeVisible();
  const text = page.locator('#group-text');
  if (await page.locator('#toolbarMenu #group-text').count()) await text.click();
  else {
    await page.keyboard.press('Escape');
    await text.click();
  }
  const red = page.locator('#tool-color-ff0000');
  await expect(red.locator('.toolbar__label')).toBeHidden();
  expect((await red.boundingBox())!.width).toBeLessThanOrEqual(48);
  await expect(page.locator('#tool-otherColor')).toBeVisible();
  const box = await page.locator('#group-text-panel').boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
});
