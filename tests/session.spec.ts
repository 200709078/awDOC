import { expect, test } from '@playwright/test';
import { fakeSavePicker, opfsSavePicker, opfsText, savedFiles } from './helpers/fake-files';

test('kaydedilmemiş iş kapanıştan sonra geri yüklenir; Sil seçilirse bir daha sorulmaz', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.type('Yarım kalan yazı');
  await page.waitForTimeout(2600);
  page.on('dialog', dialog => dialog.accept());
  await page.reload();
  const dialog = page.locator('#recoveryDialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#recoveryMessage')).toContainText('Adsız belge');
  await dialog.getByRole('button', { name: 'Geri Yükle' }).click();
  await expect(page.locator('#document')).toHaveText('Yarım kalan yazı');
  await expect(page.locator('#documentStatus')).toHaveClass(/is-dirty/);

  await page.reload();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Sil' }).click();
  await expect(page.locator('#document')).toHaveText('');
  await page.reload();
  await page.waitForTimeout(500);
  await expect(dialog).toBeHidden();
});

test('kaydedilen belge için kurtarma sorulmaz', async ({ page }) => {
  await fakeSavePicker(page, ['Tamam.awd']);
  await page.goto('/');
  await page.keyboard.type('kaydedildi');
  await page.waitForTimeout(2600);
  await page.keyboard.press('Control+s');
  await expect(page.locator('#documentStatus')).toHaveText('Tamam');
  await page.reload();
  await page.waitForTimeout(500);
  await expect(page.locator('#recoveryDialog')).toBeHidden();
});

test('Otomatik Kaydet: kaydedilmiş belge yazmaya ara verince kendiliğinden yazılır; kapatılınca yazılmaz', async ({ page }) => {
  await fakeSavePicker(page, ['Oto.awd']);
  await page.goto('/');
  await page.keyboard.type('ilk');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#documentStatus')).toHaveText('Oto');
  await page.keyboard.type(' ikinci');
  await expect(page.locator('#documentStatus')).toHaveClass(/is-dirty/);
  await expect(page.locator('#documentStatus')).not.toHaveClass(/is-dirty/, { timeout: 8000 });
  let [file] = await savedFiles(page);
  expect(file.writes).toBe(2);
  expect(file.text).toContain('ilk ikinci');

  await page.locator('#toolbarMenuButton').click();
  await expect(page.locator('#tool-autoSave')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#tool-autoSave').click();
  await page.keyboard.type(' üçüncü');
  await page.waitForTimeout(5000);
  await expect(page.locator('#documentStatus')).toHaveClass(/is-dirty/);
  [file] = await savedFiles(page);
  expect(file.writes).toBe(2);
});

test('Son Belgeler: kaydedilen belge listede; dokununca yeniden açılır; silinmiş dosya listeden çıkar', async ({ page }) => {
  await opfsSavePicker(page, ['Bir.awd', 'İki.awd']);
  await page.goto('/');
  await page.keyboard.type('birinci belge');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#documentStatus')).toHaveText('Bir');
  expect(await opfsText(page, 'Bir.awd')).toContain('birinci belge');
  await page.locator('#tool-newDocument').click();
  await page.keyboard.type('ikinci belge');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#documentStatus')).toHaveText('İki');

  await page.locator('#toolbarMenuButton').click();
  await page.locator('#tool-recent').click();
  const items = page.locator('#recentList .recent-item__name');
  await expect(items).toHaveText(['İki', 'Bir']);
  await items.filter({ hasText: 'Bir' }).click();
  await expect(page.locator('#document')).toHaveText('birinci belge');
  await expect(page.locator('#documentStatus')).toHaveText('Bir');

  await page.evaluate(async () => (await navigator.storage.getDirectory()).removeEntry('İki.awd'));
  await page.locator('#toolbarMenuButton').click();
  await page.locator('#tool-recent').click();
  await page.locator('#recentList .recent-item__name', { hasText: 'İki' }).click();
  await expect(page.locator('#toast')).toContainText('bulunamadı');
  await page.locator('#toolbarMenuButton').click();
  await page.locator('#tool-recent').click();
  await expect(items).toHaveText(['Bir']);
});
