import { expect, test, type Page } from '@playwright/test';
import { awdFile, openFile } from './helpers/fake-files';

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

async function selectWord(page: Page, word: string) {
  await page.evaluate(target => {
    const walker = document.createTreeWalker(document.querySelector('#document')!, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent!.indexOf(target);
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + target.length);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      return;
    }
  }, word);
  await page.waitForTimeout(100);
}

async function review(page: Page, tool: string) {
  await page.locator('#group-review').click();
  await page.locator(`#tool-${tool}`).click();
}

test('Yorum: seçili yazıya eklenir, panelde görünür, çözülür ve silinir', async ({ page }) => {
  await page.goto('/');
  await openFile(page, 'Ödev.awd', awdFile([paragraph('Fotosentez bitkilerde olur.')]));
  await page.locator('#document p').click();
  await selectWord(page, 'bitkilerde');
  await review(page, 'addComment');
  const dialog = page.locator('#commentDialog');
  await expect(dialog.locator('#commentQuote')).toHaveText('“bitkilerde”');
  await dialog.locator('#commentAuthor').fill('Ayşe Öğretmen');
  await dialog.locator('#commentText').fill('Hangi organelde?');
  await dialog.getByRole('button', { name: 'Ekle' }).click();
  await expect(page.locator('#document .comment-mark')).toHaveText('bitkilerde');
  const item = page.locator('#commentsPanel .comment-item');
  await expect(item).toHaveCount(1);
  await expect(item.locator('.comment-item__head')).toContainText('Ayşe Öğretmen');
  await expect(item.locator('.comment-item__text')).toHaveText('Hangi organelde?');
  await item.getByRole('button', { name: 'Çözüldü' }).click();
  await expect(item).toHaveClass(/is-done/);
  // The name is remembered for the next one.
  await selectWord(page, 'olur');
  await review(page, 'addComment');
  await expect(dialog.locator('#commentAuthor')).toHaveValue('Ayşe Öğretmen');
  await dialog.getByRole('button', { name: 'Vazgeç' }).click();
  await item.getByRole('button', { name: 'Sil' }).click();
  await expect(page.locator('#commentsPanel .comment-item')).toHaveCount(0);
  await expect(page.locator('#document .comment-mark')).toHaveCount(0);
});

test('Değişiklikleri İzle: yazılan eklendi, silinen üstü çizili kalır; kabul ve ret', async ({ page }) => {
  await page.goto('/');
  await openFile(page, 'Metin.awd', awdFile([paragraph('Kedi uyur.')]));
  await page.locator('#document p').click();
  await review(page, 'trackChanges');
  await page.locator('#authorDialog #authorName').fill('Ali');
  await page.locator('#authorDialog').getByRole('button', { name: 'Başlat' }).click();
  await expect(page.locator('#group-review')).toHaveClass(/is-marked/);

  await page.keyboard.press('End');
  // "uyur." → Backspace twice takes "r." but they stay, struck through; the cursor stays before them.
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('yor.');
  await expect(page.locator('#document del')).toHaveText('r.');
  await expect(page.locator('#document ins')).toHaveText('yor.');
  await expect(page.locator('#document p')).toHaveText('Kedi uyuyor.r.');
  await expect(page.locator('#document ins')).toHaveAttribute('data-author', 'Ali');

  await review(page, 'acceptAll');
  await expect(page.locator('#document p')).toHaveText('Kedi uyuyor.');
  await expect(page.locator('#document ins, #document del')).toHaveCount(0);

  await page.keyboard.press('End');
  await page.keyboard.type(' Çok');
  await expect(page.locator('#document ins')).toHaveText(' Çok');
  await review(page, 'rejectAll');
  await expect(page.locator('#document p')).toHaveText('Kedi uyuyor.');

  // Off again: typing is plain.
  await review(page, 'trackChanges');
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await expect(page.locator('#document ins')).toHaveCount(0);
  await expect(page.locator('#document p')).toHaveText('Kedi uyuyor.!');
});

test('Değişiklikleri İzle: seçilenin üstüne yazınca eski silinmiş, yeni eklenmiş görünür; geri al ikisini birden geri alır', async ({ page }) => {
  await page.goto('/');
  await openFile(page, 'Metin.awd', awdFile([paragraph('Kırmızı elma')]));
  await page.evaluate(() => localStorage.setItem('awDOC.yazar', 'Veli'));
  await page.locator('#document p').click();
  await review(page, 'trackChanges');
  await selectWord(page, 'Kırmızı');
  await page.keyboard.type('Yeşil');
  await expect(page.locator('#document del')).toHaveText('Kırmızı');
  await expect(page.locator('#document ins')).toHaveText('Yeşil');
  await expect(page.locator('#document p')).toHaveText('KırmızıYeşil elma');
  await page.keyboard.press('Control+z');
  await expect(page.locator('#document p')).toHaveText('Kırmızı elma');
});

test('Yorumlar ve izlenen değişiklikler Word ve LibreOffice dosyasına yazılır, geri okunur', async ({ page }) => {
  await page.goto('/');
  const results = await page.evaluate(async () => {
    const formats = await import('/src/formats/index.ts');
    const info = { author: 'Ali', date: '2026-11-18T10:00:00Z' };
    const doc = {
      type: 'doc',
      attrs: { track: true, comments: [{ id: 'c1', author: 'Ayşe', date: '2026-11-18T09:00:00Z', text: 'Kaynak?' }] },
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'Dünya ' },
          { type: 'text', text: 'güneşin', marks: [{ type: 'comment', attrs: { id: 'c1' } }] },
          { type: 'text', text: ' etrafında', marks: [{ type: 'comment', attrs: { id: 'c1' } }, { type: 'bold' }] },
          { type: 'text', text: ' döner', marks: [{ type: 'insertion', attrs: info }] },
          { type: 'text', text: ' durur', marks: [{ type: 'deletion', attrs: info }] },
          { type: 'text', text: '.' },
        ] },
        { type: 'paragraph', content: [{ type: 'text', text: 'İkinci' }] },
      ],
    };
    const out: unknown[] = [];
    for (const format of [formats.docxFormat, formats.odtFormat]) out.push(await format.read!(await format.write!(doc as never)));
    return out as { attrs: { track: boolean; comments: { id: string; author: string; text: string }[] }; content: { content: { text: string; marks?: { type: string; attrs?: Record<string, string> }[] }[] }[] }[];
  });
  for (const back of results) {
    expect(back.attrs.track).toBe(true);
    expect(back.attrs.comments).toHaveLength(1);
    expect(back.attrs.comments[0]).toMatchObject({ author: 'Ayşe', text: 'Kaynak?' });
    const id = back.attrs.comments[0].id;
    const pieces = back.content.flatMap(block => block.content);
    const covered = pieces.filter(piece => piece.marks?.some(mark => mark.type === 'comment' && mark.attrs?.id === id)).map(piece => piece.text).join('');
    expect(covered).toBe('güneşin etrafında');
    const ofKind = (type: string) => pieces.filter(piece => piece.marks?.some(mark => mark.type === type));
    expect(ofKind('insertion').map(piece => piece.text).join('')).toBe(' döner');
    expect(ofKind('insertion')[0].marks?.find(mark => mark.type === 'insertion')?.attrs?.author).toBe('Ali');
    expect(ofKind('deletion').map(piece => piece.text).join('')).toBe(' durur');
    expect(pieces.map(piece => piece.text).join('')).toBe('Dünya güneşin etrafında döner durur.İkinci');
  }
});
