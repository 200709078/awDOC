import { expect, test, type Page } from '@playwright/test';
import { pretendAndroid } from './helpers/android-bridge';
import { awdFile, opfsSavePicker } from './helpers/fake-files';

// These start as a user does: with the welcome screen (the other tests turn it off).
test.use({ storageState: { cookies: [], origins: [] } });

const welcome = (page: Page) => page.locator('#welcome');

async function openTool(page: Page, id: string): Promise<void> {
  const button = page.locator(`#tool-${id}`);
  if (!await button.isVisible()) await page.locator('#toolbarMenuButton').click();
  await button.click();
}

test('açılışta giriş ekranı: logo, Yeni Belge, Sınav Kâğıdı, Belge Aç; Yeni Belge yazmaya geçirir', async ({ page }) => {
  await page.goto('/');
  await expect(welcome(page)).toBeVisible();
  await expect(page.locator('#editorHost')).toBeHidden();
  await expect(welcome(page).locator('.welcome__actions button:visible')).toHaveText(['Yeni Belge', 'Sınav Kâğıdı', 'Belge Aç']);
  await expect(page.locator('#welcomeNew')).toBeFocused();
  // The buttons are one column, all as wide as the longest.
  const widths = await welcome(page).locator('.welcome__actions button:visible').evaluateAll(buttons => buttons.map(button => Math.round(button.getBoundingClientRect().width)));
  expect(new Set(widths).size).toBe(1);
  await page.locator('#welcomeNew').click();
  await expect(welcome(page)).toBeHidden();
  await expect(page.locator('#document')).toBeFocused();
  await page.keyboard.type('Merhaba');
  await expect(page.locator('#document')).toHaveText('Merhaba');
  await expect(page.locator('.page-sheet')).toHaveCount(1);
});

test('Belge Aç dosyayı açar; Sınav Kâğıdı şablonu açar; bir araçla eklenen soru da ekranı kapatır', async ({ page }) => {
  // Without Chromium's own file picker the app uses a file input, which the test can answer.
  await page.addInitScript(() => { Object.assign(window, { showOpenFilePicker: undefined }); });
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#welcomeOpen').click();
  await (await chooser).setFiles({ name: 'Ders.awd', mimeType: 'application/octet-stream', buffer: Buffer.from(awdFile([{ type: 'paragraph', content: [{ type: 'text', text: 'Açılan belge' }] }])) });
  await expect(welcome(page)).toBeHidden();
  await expect(page.locator('#document')).toHaveText('Açılan belge');

  await openTool(page, 'welcome');
  await expect(welcome(page)).toBeVisible();
  await page.locator('#welcomeExam').click();
  await page.locator('#examSubject').fill('Fizik');
  await page.getByRole('button', { name: 'Yeni sınav kâğıdı' }).click();
  await expect(welcome(page)).toBeHidden();
  await expect(page.locator('#document .question')).toHaveCount(1);

  // Over a document, what needs it rests as well (awPDF's rule): a question cannot be added from here.
  await openTool(page, 'welcome');
  await page.locator('#group-exam').click();
  await expect(page.locator('#tool-openQuestion')).toBeDisabled();
  await expect(page.locator('#tool-examPaper')).toBeEnabled();
});

test('giriş ekranında araç çubuğu görünür; belge gerektirenler pasif, kısayolları da (awPDF gibi)', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto('/');
  await expect(welcome(page)).toBeVisible();
  await expect(page.locator('#toolbar')).toBeVisible();
  for (const id of ['tool-newDocument', 'tool-open', 'group-exam']) await expect(page.locator(`#${id}`)).toBeEnabled();
  for (const id of ['tool-save', 'tool-undo', 'group-text', 'group-paragraph', 'tool-find', 'tool-formula', 'group-table', 'group-page', 'tool-print']) {
    await expect(page.locator(`#${id}`)).toBeDisabled();
  }
  // Ctrl+F (Bul) does nothing here; Ctrl+N works.
  await page.keyboard.press('Control+f');
  await expect(page.locator('#searchBar')).toBeHidden();
  await page.keyboard.press('Control+n');
  await expect(welcome(page)).toBeHidden();
  await expect(page.locator('#tool-save')).toBeEnabled();
  await expect(page.locator('#group-text')).toBeEnabled();
});

test('Son Belgeler ekranda; Belgeye Dön açık belgeye döner; Listeyi Temizle', async ({ page }) => {
  await opfsSavePicker(page, ['Not.awd']);
  await page.goto('/');
  await expect(welcome(page)).toBeVisible();
  await expect(page.locator('#welcomeRecent')).toBeHidden();
  await page.locator('#welcomeNew').click();
  await page.keyboard.type('Saklanan');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#documentStatus')).not.toHaveClass(/is-dirty/);
  await page.locator('#tool-newDocument').click();
  await page.keyboard.type('Başka');

  await openTool(page, 'welcome');
  await expect(page.locator('#welcomeBack')).toBeVisible();
  await expect(page.locator('#welcomeRecentList .recent-item__name')).toHaveText(['Not']);
  await page.locator('#welcomeBack').click();
  await expect(welcome(page)).toBeHidden();
  await expect(page.locator('#document')).toHaveText('Başka');

  await openTool(page, 'welcome');
  await page.locator('#welcomeRecentList .recent-item').click();
  await page.getByRole('button', { name: 'Kaydetmeden devam et' }).click();
  await expect(page.locator('#document')).toHaveText('Saklanan');
  await expect(welcome(page)).toBeHidden();

  await openTool(page, 'welcome');
  await page.locator('#welcomeRecentClear').click();
  await expect(page.locator('#welcomeRecent')).toBeHidden();
});

test('kaydedilmemiş iş giriş ekranında kart olarak çıkar: Geri Yükle getirir, Sil siler', async ({ page }) => {
  await page.goto('/');
  await page.locator('#welcomeNew').click();
  await page.keyboard.type('Kurtarılacak yazı');
  // The copy is kept two seconds after typing stops.
  await page.waitForTimeout(2600);
  await page.reload();
  await expect(page.locator('#welcomeRecovery')).toBeVisible();
  await expect(page.locator('#recoveryDialog')).toBeHidden();
  await page.locator('#welcomeRestore').click();
  await expect(welcome(page)).toBeHidden();
  await expect(page.locator('#document')).toHaveText('Kurtarılacak yazı');
  await expect(page.locator('#documentStatus')).toHaveClass(/is-dirty/);

  await page.waitForTimeout(2600);
  await page.reload();
  await page.locator('#welcomeDiscard').click();
  await expect(page.locator('#welcomeRecovery')).toBeHidden();
  await page.reload();
  await expect(welcome(page)).toBeVisible();
  await expect(page.locator('#welcomeRecovery')).toBeHidden();
});

test('kart dururken başka belge açılırsa kaydedilmemiş iş yine sorulur', async ({ page }) => {
  await page.goto('/');
  await page.locator('#welcomeNew').click();
  await page.keyboard.type('Kaybolmasın');
  await page.waitForTimeout(2600);
  await page.reload();
  await expect(page.locator('#welcomeRecovery')).toBeVisible();
  await page.locator('#welcomeNew').click();
  await expect(page.locator('#recoveryDialog')).toBeVisible();
  await page.locator('#recoveryDialog').getByRole('button', { name: 'Geri Yükle' }).click();
  await expect(page.locator('#document')).toHaveText('Kaybolmasın');
});

test('"Açılışta bu ekranı göster" kapatılınca uygulama doğrudan belgeyle açılır', async ({ page }) => {
  await page.goto('/');
  await page.locator('#welcomeAtStart').uncheck();
  await page.reload();
  await expect(welcome(page)).toBeHidden();
  await expect(page.locator('#document')).toBeFocused();
  await openTool(page, 'welcome');
  await expect(page.locator('#welcomeAtStart')).not.toBeChecked();
});

test.describe('Android geri düğmesi (awPDF\'teki gibi)', () => {
  const back = (page: Page) => page.evaluate(() => (window as unknown as { sendNative(event: string, data: unknown): void }).sendNative('backButton', {}));
  const calls = (page: Page) => page.evaluate(() => (window as unknown as { androidCalls: string[] }).androidCalls);

  test('üstteki kapanır, sonra belge (önce sorulur) ve giriş ekranı gelir; giriş ekranından uygulama arka plana geçer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await pretendAndroid(page);
    await page.goto('/');
    await expect(welcome(page)).toBeVisible();
    await page.locator('#welcomeNew').click();
    await page.keyboard.type('Yarım iş');

    // The ☰ menu first.
    await page.locator('#toolbarMenuButton').click();
    await expect(page.locator('#toolbarMenuButton')).toHaveAttribute('aria-label', 'Menüyü Kapat');
    await back(page);
    await expect(page.locator('#toolbarMenuButton')).toHaveAttribute('aria-label', 'Menüyü Aç');
    await expect(welcome(page)).toBeHidden();

    // Then the document: unsaved, so asked; "Vazgeç" keeps it.
    await back(page);
    await expect(page.locator('#unsavedDialog')).toBeVisible();
    await back(page);
    await expect(page.locator('#unsavedDialog')).toBeHidden();
    await expect(page.locator('#document')).toHaveText('Yarım iş');
    await back(page);
    await page.locator('#unsavedDialog').getByRole('button', { name: 'Kaydetmeden devam et' }).click();
    await expect(welcome(page)).toBeVisible();
    expect(await calls(page)).not.toContain('leaveApp');

    // From the welcome screen the app goes behind the others.
    await back(page);
    await expect.poll(() => calls(page)).toContain('leaveApp');
    await expect(welcome(page)).toBeVisible();
  });

  test('belgenin üstüne açılan giriş ekranında geri belgeye döner', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await pretendAndroid(page);
    await page.goto('/');
    await page.locator('#welcomeNew').click();
    await page.keyboard.type('Duran belge');
    await openTool(page, 'welcome');
    await expect(welcome(page)).toBeVisible();
    await back(page);
    await expect(welcome(page)).toBeHidden();
    await expect(page.locator('#document')).toHaveText('Duran belge');
    expect(await calls(page)).not.toContain('leaveApp');
  });
});
