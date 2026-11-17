import { expect, test, type Page } from '@playwright/test';
import { fakeSavePicker, openFile, savedFiles } from './helpers/fake-files';
import { makePng } from './helpers/make-png';

async function pickImage(page: Page, name: string, buffer: Buffer) {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#group-image').click();
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

test('Resim ▾ yerleşimi: ortada tek başına, solda ve yazı yanında; araçlar yalnız resim seçiliyken', async ({ page }) => {
  await pickImage(page, 'sekil.png', makePng(200, 200));
  const image = page.locator('#document img[src^="data:"]');
  await page.locator('#group-image').click();
  await expect(page.locator('#tool-imageWrap-center')).toBeDisabled();
  await page.keyboard.press('Escape');
  await image.click();
  await page.locator('#group-image').click();
  await page.locator('#tool-imageWrap-center').click();
  await expect(image).toHaveAttribute('data-wrap', 'center');
  const container = page.locator('#document [data-resize-container]');
  await expect(container).toHaveCSS('display', 'flex');

  await page.locator('#group-image').click();
  await page.locator('#tool-imageWrap-left').click();
  await expect(container).toHaveCSS('float', 'left');
  // Text written after it runs beside the picture.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('Yanındaki yazı');
  const [picture, text] = await page.evaluate(() => {
    const paragraph = document.querySelector('#document p')!;
    const range = document.createRange();
    range.selectNodeContents(paragraph.lastChild!);
    return [document.querySelector('#document [data-resize-container]')!.getBoundingClientRect().right, range.getBoundingClientRect().left];
  });
  expect(text).toBeGreaterThan(picture);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(image).toHaveAttribute('data-wrap', 'center');
});

test('Kırp: çerçevenin dışı gider, genişlik orantılı küçülür; Geri Al eski resmi getirir', async ({ page }) => {
  await pickImage(page, 'sekil.png', makePng(400, 200));
  const image = page.locator('#document img[src^="data:"]');
  const original = await image.getAttribute('src');
  await image.click();
  await page.locator('#group-image').click();
  await page.locator('#tool-cropImage').click();
  const box = page.locator('#cropBox');
  await expect(box).toBeVisible();
  // The right edge dragged to the middle: half the picture stays.
  const frame = (await box.boundingBox())!;
  await page.mouse.move(frame.x + frame.width, frame.y + frame.height / 2);
  await page.mouse.down();
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Kırp', exact: true }).click();
  await expect(image).not.toHaveAttribute('src', original!);
  const natural = await image.evaluate(element => new Promise<number>(resolve => {
    const picture = element as HTMLImageElement;
    if (picture.complete && picture.naturalWidth) resolve(picture.naturalWidth);
    else picture.onload = () => resolve(picture.naturalWidth);
  }));
  expect(natural).toBeGreaterThan(190);
  expect(natural).toBeLessThan(210);
  expect((await image.boundingBox())!.width).toBeCloseTo(200, -1);
  await page.keyboard.press('Control+z');
  await expect(image).toHaveAttribute('src', original!);
});

test('resim altı yazısı "Şekil N:" diye numaralanır; düz metne de öyle yazılır', async ({ page }) => {
  await fakeSavePicker(page, ['Sekil.awd']);
  await page.reload();
  await pickImage(page, 'bir.png', makePng(100, 100));
  await page.locator('#document img[src^="data:"]').click();
  await page.locator('#group-image').click();
  await page.locator('#tool-imageCaption').click();
  await page.keyboard.type('Üçgen');
  const caption = page.locator('#document p[data-caption]');
  await expect(caption).toHaveText('Üçgen');
  expect(await caption.evaluate(element => getComputedStyle(element, '::before').content)).toContain('Şekil');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Sonraki paragraf');
  await expect(page.locator('#document p[data-caption]')).toHaveCount(1);

  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await savedFiles(page)).length).toBe(1);
  const saved = JSON.parse((await savedFiles(page))[0].text).document;
  const { txtFormat } = await import('../src/formats/txt');
  expect(new TextDecoder().decode(await txtFormat.write!(saved))).toContain('Şekil 1: Üçgen\nSonraki paragraf');
});
