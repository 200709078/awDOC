import { expect, test } from '@playwright/test';
import { awdFile, fakeSavePicker, openFile, savedFiles, savePickerCalls } from './helpers/fake-files';

test('Kaydet ilk seferde yer sorar, sonra aynı dosyaya yazar; dosya geri açılınca biçim korunur', async ({ page }) => {
  await fakeSavePicker(page, ['Ödev.awd']);
  await page.goto('/');
  await page.keyboard.type('Merhaba ');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('dünya');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#documentStatus')).toHaveText('Ödev');
  await expect(page.locator('#documentStatus')).not.toHaveClass(/is-dirty/);

  await page.keyboard.type('!');
  await expect(page.locator('#documentStatus')).toHaveClass(/is-dirty/);
  await page.locator('#tool-save').click();
  await expect(page.locator('#documentStatus')).not.toHaveClass(/is-dirty/);
  expect(await savePickerCalls(page)).toBe(1);
  const [file] = await savedFiles(page);
  expect(file.name).toBe('Ödev.awd');
  expect(file.writes).toBe(2);
  const saved = JSON.parse(file.text);
  expect(saved).toMatchObject({ format: 'awDOC', version: 1 });

  // Aynı dosya yeniden açılır.
  await page.locator('#tool-newDocument').click();
  await expect(page.locator('#document')).toHaveText('');
  await openFile(page, 'Ödev.awd', file.text);
  await expect(page.locator('#document')).toHaveText('Merhaba dünya!');
  await expect(page.locator('#document strong')).toHaveText('dünya!');
  await expect(page.locator('#documentStatus')).toHaveText('Ödev');
});

test('Ctrl+Shift+S her seferinde yer sorar ve yazıyı üstü çizili yapmaz', async ({ page }) => {
  await fakeSavePicker(page, ['Bir.awd', 'İki.awd']);
  await page.goto('/');
  await page.keyboard.type('yazı');
  await page.keyboard.press('Control+Shift+S');
  await expect(page.locator('#documentStatus')).toHaveText('Bir');
  await page.keyboard.press('Control+Shift+S');
  await expect(page.locator('#documentStatus')).toHaveText('İki');
  expect(await savePickerCalls(page)).toBe(2);
  await expect(page.locator('#document s')).toHaveCount(0);
});

test('.txt açılır; Kaydet düz metnin üzerine yazmaz, awDOC belgesi olarak yer sorar', async ({ page }) => {
  await fakeSavePicker(page);
  await page.goto('/');
  await openFile(page, 'notlar.txt', 'birinci satır\n\nüçüncü satır\n');
  await expect(page.locator('#document p')).toHaveText(['birinci satır', '', 'üçüncü satır']);
  await expect(page.locator('#documentStatus')).toHaveText('notlar.txt');
  await page.locator('#tool-save').click();
  await expect(page.locator('#documentStatus')).toHaveText('Deneme');
  expect(await savePickerCalls(page)).toBe(1);
});

test('değişiklik varken başka dosya açmak önce sorar; Kaydet seçilirse kaydedip açar', async ({ page }) => {
  await fakeSavePicker(page, ['Eski.awd']);
  await page.goto('/');
  await page.keyboard.type('eski belge');
  await openFile(page, 'yeni.awd', awdFile([{ type: 'paragraph', content: [{ type: 'text', text: 'yeni belge' }] }]));
  const dialog = page.locator('#unsavedDialog');
  await expect(dialog).toContainText('Adsız belge');
  await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(page.locator('#document')).toHaveText('yeni belge');
  const [file] = await savedFiles(page);
  expect(file.name).toBe('Eski.awd');
  expect(file.text).toContain('eski belge');
});

test('bozuk ya da tanınmayan dosya belgeyi bozmaz, nedenini söyler', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.type('yerinde kalır');
  await openFile(page, 'bozuk.awd', '{"format":"başka"}');
  await expect(page.locator('#toast')).toContainText('awDOC belgesi değil');
  await openFile(page, 'tablo.xlsx', 'PK');
  await expect(page.locator('#toast')).toContainText('dosya türünü henüz tanımıyor');
  await openFile(page, 'bozuk.png', 'PNG değil');
  await expect(page.locator('#toast')).toContainText('Resim okunamadı');
  await openFile(page, 'gelecek.awd', JSON.stringify({ format: 'awDOC', version: 99, app: 'x', document: { type: 'doc', content: [] } }));
  await expect(page.locator('#toast')).toContainText('daha yeni bir sürümüyle');
  // Düğüm türü bilinmeyen belge de açılmaz.
  await openFile(page, 'garip.awd', awdFile([{ type: 'uzayGemisi' }]));
  await expect(page.locator('#toast')).toContainText('garip.awd açılamadı');
  await expect(page.locator('#document')).toHaveText('yerinde kalır');
  await expect(page.locator('#unsavedDialog')).toBeHidden();
});

test('PDF Olarak Kaydet (web): yazdırma penceresi açılır, "PDF olarak kaydet" seçmesi söylenir', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { printCalls: 0 });
    window.print = () => { (window as unknown as { printCalls: number }).printCalls += 1; };
  });
  await page.goto('/');
  await page.keyboard.type('yazdırılacak');
  await page.locator('#toolbarMenuButton').isVisible();
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#tool-exportPdf')!.click());
  await expect(page.locator('#toast')).toContainText('PDF olarak kaydet');
  expect(await page.evaluate(() => (window as unknown as { printCalls: number }).printCalls)).toBe(1);
});
