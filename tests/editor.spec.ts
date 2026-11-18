import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#document')).toBeFocused();
});

test('Türkçe yazı yazılır; geri al ve yinele çalışır', async ({ page }) => {
  const document = page.locator('#document');
  await page.keyboard.type('Çağrı ışığı söndü; İĞNE ÖZÜ.');
  await expect(document).toHaveText('Çağrı ışığı söndü; İĞNE ÖZÜ.');
  await expect(page.locator('#tool-undo')).toBeEnabled();
  await page.locator('#tool-undo').click();
  await expect(document).toHaveText('');
  await page.locator('#tool-redo').click();
  await expect(document).toHaveText('Çağrı ışığı söndü; İĞNE ÖZÜ.');
});

test('Yazı ▾: kalın ve italik art arda seçilir, pencere açık kalır; grup düğmesi işaret taşır', async ({ page }) => {
  const group = page.locator('#group-text');
  await group.click();
  const panel = page.locator('#group-text-panel');
  await expect(panel).toBeVisible();
  await page.locator('#tool-bold').click();
  await expect(panel).toBeVisible();
  await page.locator('#tool-italic').click();
  await expect(page.locator('#tool-bold')).toHaveAttribute('aria-pressed', 'true');
  await expect(group).toHaveClass(/is-marked/);
  await page.keyboard.type('kalın ve eğik');
  await expect(page.locator('#document strong em, #document em strong')).toHaveText('kalın ve eğik');
  // Belgeye dokununca pencere kapanır.
  await page.locator('#document').click();
  await expect(panel).toBeHidden();
});

test('Ctrl+B kalın yapar; düğme durumu seçime göre değişir', async ({ page }) => {
  await page.keyboard.type('düz ');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('kalın');
  await expect(page.locator('#document strong')).toHaveText('kalın');
  await expect(page.locator('#group-text')).toHaveClass(/is-marked/);
  await page.keyboard.press('Home');
  await expect(page.locator('#group-text')).not.toHaveClass(/is-marked/);
});

test('Paragraf ▾: Başlık 1 seçilir, pencere kapanır, grup düğmesi başlık simgesini gösterir', async ({ page }) => {
  await page.keyboard.type('Birinci bölüm');
  await page.locator('#group-paragraph').click();
  await page.locator('#tool-heading1').click();
  await expect(page.locator('#group-paragraph-panel')).toBeHidden();
  await expect(page.locator('#document h1')).toHaveText('Birinci bölüm');
  // Seçim yazıda kalır: yazmaya devam edilir.
  await page.keyboard.type('!');
  await expect(page.locator('#document h1')).toHaveText('Birinci bölüm!');
  await page.locator('#group-paragraph').click();
  await expect(page.locator('#tool-heading1')).toHaveAttribute('aria-pressed', 'true');
});

test('Liste ve hizalama', async ({ page }) => {
  await page.keyboard.type('elma');
  await page.locator('#group-list').click();
  await page.locator('#tool-bulletList').click();
  await page.keyboard.press('Enter');
  await page.keyboard.type('armut');
  await expect(page.locator('#document ul li')).toHaveText(['elma', 'armut']);
  await expect(page.locator('#group-list')).toHaveClass(/is-marked/);
  await page.locator('#group-align').click();
  await page.locator('#tool-align-center').click();
  await expect(page.locator('#document li:nth-child(2) p')).toHaveCSS('text-align', 'center');
  await page.locator('#group-align').click();
  await expect(page.locator('#tool-align-center')).toHaveAttribute('aria-pressed', 'true');
});

test('Değişiklik olunca adın önünde nokta çıkar; Yeni boş belge açmadan önce sorar', async ({ page }) => {
  const status = page.locator('#documentStatus');
  await expect(status).toHaveText('Adsız belge');
  await expect(status).not.toHaveClass(/is-dirty/);
  await page.keyboard.type('taslak');
  await expect(status).toHaveClass(/is-dirty/);
  await expect(page.locator('#tool-save')).toHaveClass(/is-marked/);
  await expect(page).toHaveTitle('• Adsız belge | awDOC');

  await page.locator('#tool-newDocument').click();
  const dialog = page.locator('#unsavedDialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(page.locator('#document')).toHaveText('taslak');

  await page.locator('#tool-newDocument').click();
  await dialog.getByRole('button', { name: 'Kaydetme', exact: true }).click();
  await expect(page.locator('#document')).toHaveText('');
  await expect(status).not.toHaveClass(/is-dirty/);
  // Yeni belgede geri al eski belgeye dönmez.
  await expect(page.locator('#tool-undo')).toBeDisabled();
});
