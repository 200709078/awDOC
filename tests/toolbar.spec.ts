import { expect, test } from '@playwright/test';

test('geniş ekranda bütün araçlar çubukta; ☰ yalnız Hakkında için', async ({ page }) => {
  await page.goto('/');
  for (const id of ['tool-newDocument', 'tool-open', 'tool-save', 'tool-undo', 'tool-redo', 'group-text', 'group-paragraph', 'group-list', 'group-align', 'tool-print', 'tool-saveAs', 'tool-fullscreen', 'tool-theme']) {
    await expect(page.locator(`#toolbar > #${id}, #toolbar > .toolbar__group > #${id}`)).toBeVisible();
  }
  await expect(page.locator('#toolbarMenuButton')).toBeVisible();
  await expect(page.locator('#toolbarMenu')).toBeHidden();
  // Çubuk taşmaz, kaymaz.
  const overflow = await page.locator('#toolbar').evaluate(element => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('dar ekranda sığmayanlar sondan başlayarak ☰ menüsüne geçer; menü ✕ ile, Esc ile ve dışarı dokununca kapanır', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto('/');
  const toggle = page.locator('#toolbarMenuButton');
  const menu = page.locator('#toolbarMenu');
  await expect(page.locator('#toolbar > #tool-newDocument')).toBeVisible();
  // Telefonda belge adı gizlenir; yer yazı biçimlerine kalır.
  await expect(page.locator('#documentStatus')).toBeHidden();
  await expect(page.locator('#toolbar > .toolbar__group > #group-text')).toBeVisible();
  await expect(menu.locator('#tool-theme')).toHaveCount(1);
  await expect(menu.locator('#group-align')).toHaveCount(1);
  const overflow = await page.locator('#toolbar').evaluate(element => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await toggle.click();
  await expect(menu).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-label', 'Menüyü Kapat');
  await toggle.click();
  await expect(menu).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-label', 'Menüyü Aç');

  await toggle.click();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  // Menünün dışında, belgenin altında bir yere dokunulur.
  await toggle.click();
  await page.mouse.click(20, 780);
  await expect(menu).toBeHidden();
});

test('☰ içinde gruplar yerinde açılır, aynı anda tek grup açık kalır; seçim menüyü kapatır', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto('/');
  await page.keyboard.type('başlık olacak');
  await page.locator('#toolbarMenuButton').click();
  const menu = page.locator('#toolbarMenu');
  const paragraph = menu.locator('#group-paragraph');
  const align = menu.locator('#group-align');
  await expect(paragraph).toContainText('Paragraf');
  await paragraph.click();
  const panel = page.locator('#group-paragraph-panel');
  await expect(panel).toBeVisible();
  // Yerinde: menünün içinde, başlığın hemen altında.
  const header = await paragraph.boundingBox();
  const box = await panel.locator('button').first().boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
  expect(box!.x).toBeGreaterThan(header!.x);
  await align.click();
  await expect(panel).toBeHidden();
  await expect(page.locator('#group-align-panel')).toBeVisible();
  await paragraph.click();
  await page.locator('#tool-heading2').click();
  await expect(menu).toBeHidden();
  await expect(page.locator('#document h2')).toHaveText('başlık olacak');
});

test('çubuktaki grup penceresi ekranın sağından taşmaz', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 700 });
  await page.goto('/');
  const groups = page.locator('#toolbar > .toolbar__group > .toolbar__group-button');
  const count = await groups.count();
  for (let index = 0; index < count; index++) {
    await groups.nth(index).click();
    const panel = page.locator('#toolbar > .toolbar__group > .toolbar__panel:not([hidden])');
    const box = await panel.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(760);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  }
});

test('koyu tema arayüzü boyar, kâğıt beyaz kalır', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.locator('#tool-theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#tool-theme')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#toolbar')).toHaveCSS('background-color', 'rgb(31, 41, 55)');
  await expect(page.locator('#document')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('☰ içinde bilinen simgeler (hizalama) yazısız yan yana, ötekiler simge ve adla durur', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto('/');
  await page.locator('#toolbarMenuButton').click();
  await page.locator('#toolbarMenu #group-align').click();
  const left = page.locator('#tool-align-left');
  const center = page.locator('#tool-align-center');
  await expect(left.locator('.toolbar__label')).toBeHidden();
  const [a, b] = [await left.boundingBox(), await center.boundingBox()];
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(1);
  expect(a!.width).toBeLessThanOrEqual(48);
  await page.locator('#toolbarMenu #group-paragraph').click();
  await expect(page.locator('#tool-heading1 .toolbar__label')).toBeVisible();
});
