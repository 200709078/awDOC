import { expect, test, type Page } from '@playwright/test';
import { fakeSavePicker, openFile, savedFiles } from './helpers/fake-files';
import { makePng } from './helpers/make-png';

async function pickImage(page: Page, name: string, buffer: Buffer) {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#tool-image').click();
  await (await chooser).setFiles({ name, mimeType: 'image/png', buffer });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#document')).toBeFocused();
});

test('Resim: seçilen resim imlecin yerine girer; sayfa genişliğini aşmadan başlar; köşelerde tutamaç', async ({ page }) => {
  await page.keyboard.type('Şekil: ');
  await pickImage(page, 'sekil.png', makePng(800, 400));
  const image = page.locator('#document img[src^="data:"]');
  await expect(image).toHaveCount(1);
  await expect(image).toHaveAttribute('src', /^data:image\/png;base64,/);
  expect((await image.boundingBox())!.width).toBeCloseTo(600, 0);
  await expect(page.locator('#document [data-resize-handle]')).toHaveCount(4);
  await expect(page.locator('#document p').first()).toContainText('Şekil:');
  await expect(page.locator('#documentStatus')).toHaveClass(/is-dirty/);
});

test('büyük resim en uzun kenarı 1600 piksele küçültülür', async ({ page }) => {
  await pickImage(page, 'buyuk.png', makePng(2400, 1200, [0, 112, 192]));
  const natural = await page.locator('#document img[src^="data:"]').evaluate(element => new Promise<number>(resolve => {
    const image = element as HTMLImageElement;
    if (image.complete) resolve(image.naturalWidth);
    else image.onload = () => resolve(image.naturalWidth);
  }));
  expect(natural).toBe(1600);
});

test('panodan yapıştırılan resim (ekran görüntüsü) belgeye girer', async ({ page }) => {
  const base64 = makePng(120, 60).toString('base64');
  await page.locator('#document').evaluate((element, data) => {
    const bytes = Uint8Array.from(atob(data), letter => letter.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'ekran.png', { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, base64);
  await expect(page.locator('#document img[src^="data:"]')).toHaveCount(1);
});

test('Aç ile seçilen resim belge olarak açılmaz, belgeye eklenir', async ({ page }) => {
  await page.keyboard.type('metin');
  await page.locator('#fileInput').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: makePng(50, 50) });
  await expect(page.locator('#document img[src^="data:"]')).toHaveCount(1);
  await expect(page.locator('#document')).toContainText('metin');
  await expect(page.locator('#unsavedDialog')).toBeHidden();
});

test('resim ve hizalaması .awd ile korunur', async ({ page }) => {
  await fakeSavePicker(page, ['Resimli.awd']);
  await page.goto('/');
  await pickImage(page, 'logo.png', makePng(300, 100));
  await page.locator('#group-align').click();
  await page.locator('#tool-align-center').click();
  await page.keyboard.press('Control+s');
  await expect(page.locator('#documentStatus')).toHaveText('Resimli');
  const [file] = await savedFiles(page);
  const saved = JSON.parse(file.text).document.content[0];
  expect(saved.attrs.textAlign).toBe('center');
  expect(saved.content[0]).toMatchObject({ type: 'image', attrs: { width: 300 } });
  await page.locator('#tool-newDocument').click();
  await openFile(page, 'Resimli.awd', file.text);
  const image = page.locator('#document img[src^="data:"]');
  await expect(image).toHaveCount(1);
  const [box, page_] = [await image.boundingBox(), await page.locator('#document').boundingBox()];
  // Ortalanmış: resmin ortası kâğıdın ortasında.
  expect(Math.abs(box!.x + box!.width / 2 - (page_!.x + page_!.width / 2))).toBeLessThan(3);
});

test('köşeden sürükleyince resim oranı bozulmadan küçülür; yeni genişlik belgeye yazılır', async ({ page }) => {
  await fakeSavePicker(page, ['Boy.awd']);
  await page.goto('/');
  await pickImage(page, 'kare.png', makePng(400, 200));
  const image = page.locator('#document img[src^="data:"]');
  await image.click();
  const handle = page.locator('#document [data-resize-handle="bottom-right"]');
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 200, box.y + box.height / 2 - 100, { steps: 8 });
  await page.mouse.up();
  const size = (await image.boundingBox())!;
  expect(size.width).toBeLessThan(260);
  expect(size.width / size.height).toBeCloseTo(2, 1);
  await page.keyboard.press('Control+s');
  await expect(page.locator('#documentStatus')).toHaveText('Boy');
  const [file] = await savedFiles(page);
  const width = JSON.parse(file.text).document.content[0].content[0].attrs.width;
  expect(width).toBeLessThan(260);
});
