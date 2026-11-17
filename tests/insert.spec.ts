import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#document')).toBeFocused();
});

test('Bul: Türkçe büyük/küçük harf ayrımı yok; eşleşmeler işaretlenir, Enter ile gezilir', async ({ page }) => {
  await page.keyboard.type('Işık ışık IŞIK işik isik. İnce ince.');
  await page.keyboard.press('Control+f');
  const input = page.locator('#searchInput');
  await expect(input).toBeFocused();
  await input.fill('ışık');
  await expect(page.locator('#searchStatus')).toHaveText('1 / 4');
  await expect(page.locator('#document .search-match')).toHaveCount(4);
  await input.press('Enter');
  await expect(page.locator('#searchStatus')).toHaveText('2 / 4');
  await input.press('Shift+Enter');
  await input.press('Shift+Enter');
  await expect(page.locator('#searchStatus')).toHaveText('4 / 4');
  await input.fill('ince');
  await expect(page.locator('#searchStatus')).toHaveText('1 / 2');
  await input.fill('yok');
  await expect(page.locator('#searchStatus')).toHaveText('Bulunamadı');
  await input.press('Escape');
  await expect(page.locator('#searchBar')).toBeHidden();
  await expect(page.locator('#document .search-match')).toHaveCount(0);
  await expect(page.locator('#document')).toBeFocused();
});

test('Değiştir önce eşleşmeyi seçer, sonra değiştirir; Tümünü Değiştir hepsini', async ({ page }) => {
  await page.keyboard.type('kedi köpek kedi kuş kedi');
  await page.keyboard.press('Home');
  await page.keyboard.press('Control+h');
  await expect(page.locator('#replaceRow')).toBeVisible();
  await page.locator('#searchInput').fill('kedi');
  await page.locator('#replaceInput').fill('tavşan');
  await page.locator('#replaceOne').click();
  await expect(page.locator('#document')).toHaveText('kedi köpek kedi kuş kedi');
  await page.locator('#replaceOne').click();
  await expect(page.locator('#document')).toHaveText('tavşan köpek kedi kuş kedi');
  await expect(page.locator('#searchStatus')).toHaveText('1 / 2');
  await page.locator('#replaceAll').click();
  await expect(page.locator('#document')).toHaveText('tavşan köpek tavşan kuş tavşan');
  await expect(page.locator('#searchStatus')).toHaveText('2 yer değiştirildi');
  // Geri al bütün değişiklikleri tek tek geri getirir.
  await page.locator('#searchClose').click();
  await page.keyboard.press('Control+z');
  await expect(page.locator('#document')).toHaveText('tavşan köpek kedi kuş kedi');
});

test('Bağlantı: seçili yazı bağlantı olur; adres tamamlanır; düzenlenir ve kaldırılır', async ({ page }) => {
  await page.keyboard.type('madematik sitesi');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Control+k');
  const dialog = page.locator('#linkDialog');
  await expect(page.locator('#linkTextField')).toBeHidden();
  await page.locator('#linkUrl').fill('javascript:alert(1)');
  await dialog.getByRole('button', { name: 'Tamam' }).click();
  await expect(page.locator('#linkError')).toBeVisible();
  await page.locator('#linkUrl').fill('madematik.com');
  await dialog.getByRole('button', { name: 'Tamam' }).click();
  await expect(dialog).toBeHidden();
  const link = page.locator('#document a');
  await expect(link).toHaveText('madematik sitesi');
  await expect(link).toHaveAttribute('href', 'https://madematik.com/');
  // Bağlantının içine dokunup yeniden açınca adres gelir, Kaldır görünür.
  await link.click();
  await page.locator('#tool-link').click();
  await expect(page.locator('#linkUrl')).toHaveValue('https://madematik.com/');
  await dialog.getByRole('button', { name: 'Kaldır' }).click();
  await expect(page.locator('#document a')).toHaveCount(0);
  await expect(page.locator('#document')).toHaveText('madematik sitesi');
});

test('Bağlantı: seçim yokken görünen yazı da sorulur; e-posta mailto olur', async ({ page }) => {
  await page.keyboard.type('Yazın: ');
  await page.locator('#tool-link').click();
  await page.locator('#linkText').fill('destek');
  await page.locator('#linkUrl').fill('destek@madematik.com');
  await page.locator('#linkDialog').getByRole('button', { name: 'Tamam' }).click();
  await expect(page.locator('#document a')).toHaveAttribute('href', 'mailto:destek@madematik.com');
  await expect(page.locator('#document')).toHaveText('Yazın: destek');
});

test('Kelime sayısı: bütün belge ve seçili bölüm', async ({ page }) => {
  await page.keyboard.type('Bir iki üç.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Dört — beş');
  await page.keyboard.press('Control+Shift+G');
  const dialog = page.locator('#countDialog');
  await expect(dialog.locator('dd')).toHaveText(['5', '17', '21', '2']);
  await dialog.getByRole('button', { name: 'Kapat' }).click();
  // Kapanınca imleç belgeye geri döner; ProseMirror seçimini bir an sonra yeniler, o yüzden seçim denetlenir.
  await expect(page.locator('#document')).toBeFocused();
  await expect(async () => {
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Home');
    expect(await page.evaluate(() => getSelection()?.toString())).toBe('Dört — beş');
  }).toPass();
  await page.keyboard.press('Control+Shift+G');
  await expect(page.locator('#countTitle')).toHaveText('Kelime sayısı (seçili bölüm)');
  await expect(dialog.locator('dd').first()).toHaveText('2');
});
