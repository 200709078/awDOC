import { expect, test, type Page } from '@playwright/test';
import { txtFormat } from '../src/formats/txt';
import { awdFile, fakeSavePicker, openFile, savedFiles } from './helpers/fake-files';

async function examTool(page: Page, id: string): Promise<void> {
  await page.locator('#group-exam').click();
  await page.locator(`#tool-${id}`).click();
}

const choiceTexts = (page: Page, question = 0) => page.locator('#document .question').nth(question).locator('.choice').allTextContents();


test('çoktan seçmeli soru: A–E şıkları gelir, Enter ve Tab şıktan şıkka geçer, numara ve harfler kendiliğinden', async ({ page }) => {
  await fakeSavePicker(page, ['Sinav.awd']);
  await page.goto('/');
  await page.keyboard.type('Başlık');
  await examTool(page, 'multipleChoice');
  await expect(page.locator('#document .question')).toHaveCount(1);
  await expect(page.locator('#document .choice')).toHaveCount(5);
  await page.keyboard.type('Hangisi asaldır?');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('4');
  await page.keyboard.press('Enter');
  await page.keyboard.type('6');
  await page.keyboard.press('Tab');
  await page.keyboard.type('7');
  await page.keyboard.press('Enter');
  await page.keyboard.type('9');
  await page.keyboard.press('Enter');
  await page.keyboard.type('15');
  expect(await choiceTexts(page)).toEqual(['4', '6', '7', '9', '15']);
  // Shift+Tab goes back (to the end of D); Tab on to E; Enter after the last written choice adds one.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.type('0');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('#document .choice')).toHaveCount(6);
  // An empty last choice and Enter: it goes, and the cursor is out of the question, below it.
  await page.keyboard.press('Enter');
  await page.keyboard.type('Sonraki satır');
  expect(await choiceTexts(page)).toEqual(['4', '6', '7', '90', '15']);
  await expect(page.locator('#document > p').last()).toHaveText('Sonraki satır');

  await examTool(page, 'openQuestion');
  await page.keyboard.type('İkinci soru');
  await expect(page.locator('#document .question')).toHaveCount(2);

  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await savedFiles(page)).length).toBe(1);
  const saved = JSON.parse((await savedFiles(page))[0].text).document;
  expect(saved.content.map((node: { type: string }) => node.type)).toEqual(['paragraph', 'question', 'paragraph', 'question', 'paragraph']);
  const text = new TextDecoder().decode(await txtFormat.write!(saved));
  expect(text).toBe('Başlık\n1. Hangisi asaldır?\n   A) 4\n   B) 6\n   C) 7\n   D) 90\n   E) 15\nSonraki satır\n2. İkinci soru\n\n');
});

test('numaralar ve harfler yazdırmada da görünür; puan sağ üstte; şık düzeni değişir', async ({ page }) => {
  await page.goto('/');
  await openFile(page, 'S.awd', awdFile([
    { type: 'question', attrs: { points: 10 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Birinci' }] }, { type: 'choices', content: ['a', 'b', 'c', 'd'].map(text => ({ type: 'choice', content: [{ type: 'text', text }] })) }] },
    { type: 'question', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'İkinci' }] }] },
  ]));
  await expect(page.locator('#document .question')).toHaveCount(2);
  const numbers = await page.locator('#document .question').evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect();
    return { content: getComputedStyle(element, '::before').content, top: box.top };
  }));
  expect(numbers.every(number => number.content.includes('counter(question)'))).toBe(true);
  expect(await page.locator('#document .question').first().evaluate(element => getComputedStyle(element, '::after').content)).toContain('puan');
  await expect(page.locator('#document .question').first()).toHaveAttribute('data-points', '10');

  await page.locator('#document .choice').first().click();
  await examTool(page, 'choicesRow');
  await expect(page.locator('#document .choices')).toHaveAttribute('data-layout', 'row');
  const tops = await page.locator('#document .choice').evaluateAll(elements => elements.map(element => Math.round(element.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  await examTool(page, 'choicesGrid');
  const gridTops = await page.locator('#document .choice').evaluateAll(elements => elements.map(element => Math.round(element.getBoundingClientRect().top)));
  expect(new Set(gridTops).size).toBe(2);
  await examTool(page, 'choicesList');
  await expect(page.locator('#document .choices')).toHaveAttribute('data-layout', 'list');

  // Points: changed, then removed; the group shows the total.
  await examTool(page, 'points');
  await page.locator('#pointsInput').fill('7,5');
  await page.keyboard.press('Enter');
  await expect(page.locator('#document .question').first()).toHaveAttribute('data-points', '7,5');
  await page.locator('#group-exam').click();
  await expect(page.locator('.toolbar__section-title', { hasText: 'toplam 7,5 puan' })).toBeVisible();
  await page.locator('#tool-points').click();
  await page.locator('#pointsRemove').click();
  await expect(page.locator('#document .question').first()).not.toHaveAttribute('data-points', /./);
});

test('altı şık doluyken son şıkta Enter sorudan çıkar', async ({ page }) => {
  await page.goto('/');
  await openFile(page, 'S.awd', awdFile([
    { type: 'question', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Soru' }] }, { type: 'choices', content: ['a', 'b', 'c', 'd', 'e', 'f'].map(text => ({ type: 'choice', content: [{ type: 'text', text }] })) }] },
  ]));
  await page.locator('#document .choice').last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Dışarıda');
  expect(await choiceTexts(page)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  await expect(page.locator('#document > p').last()).toHaveText('Dışarıda');
});

test('şık ekle / sil, soruyu taşı ve sil; Geri Al geri getirir', async ({ page }) => {
  await page.goto('/');
  await openFile(page, 'S.awd', awdFile([
    { type: 'question', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Birinci' }] }, { type: 'choices', content: ['a', 'b'].map(text => ({ type: 'choice', content: [{ type: 'text', text }] })) }] },
    { type: 'question', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'İkinci' }] }] },
  ]));
  await page.locator('#document .choice').first().click();
  await examTool(page, 'addChoice');
  await page.keyboard.type('yeni');
  expect(await choiceTexts(page)).toEqual(['a', 'yeni', 'b']);
  await examTool(page, 'removeChoice');
  expect(await choiceTexts(page)).toEqual(['a', 'b']);
  // An open-ended question gets its first choice.
  await page.locator('#document .question').nth(1).locator('p').click();
  await examTool(page, 'addChoice');
  await page.keyboard.type('şık');
  expect(await choiceTexts(page, 1)).toEqual(['şık']);

  await examTool(page, 'moveQuestionUp');
  await expect(page.locator('#document .question').first()).toContainText('İkinci');
  await page.locator('#group-exam').click();
  await expect(page.locator('#tool-moveQuestionUp')).toBeDisabled();
  await page.locator('#tool-deleteQuestion').click();
  await expect(page.locator('#document .question')).toHaveCount(1);
  await expect(page.locator('#document .question').first()).toContainText('Birinci');
  await page.keyboard.press('Control+z');
  await expect(page.locator('#document .question')).toHaveCount(2);
});

test('sayfa sonuna gelen soru bölünmez, bütünüyle yeni sayfaya geçer', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const filler = Array.from({ length: 36 }, (_, i) => ({ type: 'paragraph', content: [{ type: 'text', text: `Satır ${i + 1}` }] }));
  const question = (text: string, layout: string) => ({ type: 'question', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }, { type: 'choices', attrs: { layout }, content: ['a', 'b', 'c', 'd', 'e'].map(choice => ({ type: 'choice', content: [{ type: 'text', text: choice }] })) }] });
  await openFile(page, 'S.awd', awdFile([...filler, question('Sınırdaki soru', 'list'), question('Yan yana', 'row'), question('Sonraki soru', 'list')]));
  await expect(page.locator('.page-sheet')).toHaveCount(2);
  // On which sheet's text area each part of each question lies.
  const placed = await page.evaluate(() => {
    const host = getComputedStyle(document.querySelector('#editorHost')!);
    const top = parseFloat(host.getPropertyValue('--margin-top'));
    const bottom = parseFloat(host.getPropertyValue('--margin-bottom'));
    const sheets = [...document.querySelectorAll('.page-sheet')].map(sheet => sheet.getBoundingClientRect());
    const sheetOf = (y: number) => sheets.findIndex(sheet => y >= sheet.top + top - 3 && y <= sheet.bottom - bottom + 1);
    return [...document.querySelectorAll('#document .question')].map(question => {
      const range = document.createRange();
      range.selectNodeContents(question.querySelector('p')!);
      const choices = question.querySelector('.choices')!.getBoundingClientRect();
      return {
        number: sheetOf(question.getBoundingClientRect().top + 2),
        text: sheetOf(range.getBoundingClientRect().top + 2),
        choicesTop: sheetOf(choices.top + 1),
        choicesBottom: sheetOf(choices.bottom - 1),
      };
    });
  });
  // The filler fills most of the first page: the first question does not fit after it.
  expect(placed[0].number).toBe(1);
  for (const question of placed) {
    expect(question.text).toBe(question.number);
    expect(question.choicesTop).toBe(question.number);
    expect(question.choicesBottom).toBe(question.number);
  }
});

test('doğru şık işaretlenir (soru başına bir), yalnız ekranda görünür ve gizlenebilir; cevap anahtarı canlı', async ({ page }) => {
  await page.goto('/');
  const mc = (text: string) => ({ type: 'question', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }, { type: 'choices', content: ['a', 'b', 'c', 'd'].map(choice => ({ type: 'choice', content: [{ type: 'text', text: choice }] })) }] });
  await openFile(page, 'S.awd', awdFile([mc('Bir'), { type: 'question', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Açık uçlu' }] }] }, mc('Üç')]));
  await page.locator('#document .question').first().locator('.choice').nth(1).click();
  await examTool(page, 'correctChoice');
  await expect(page.locator('#document .question').first().locator('.choice[data-correct]')).toHaveText('b');
  // Another choice of the same question takes the mark over.
  await page.locator('#document .question').first().locator('.choice').nth(3).click();
  await examTool(page, 'correctChoice');
  await expect(page.locator('#document .question').first().locator('.choice[data-correct]')).toHaveText('d');
  const ring = () => page.locator('#document .choice[data-correct]').evaluate(element => getComputedStyle(element, '::before').boxShadow);
  expect(await ring()).not.toBe('none');

  // Hidden for the board; never printed.
  await examTool(page, 'showAnswers');
  expect(await ring()).toBe('none');
  await examTool(page, 'showAnswers');
  expect(await ring()).not.toBe('none');
  await page.emulateMedia({ media: 'print' });
  expect(await ring()).toBe('none');
  await page.emulateMedia({ media: 'screen' });

  // The key lists every question and follows the changes.
  await examTool(page, 'answerKey');
  const key = page.locator('#document .answer-key');
  await expect(key).toHaveCount(1);
  await expect(key.locator('li')).toHaveText(['1. D', '2. —', '3. ?']);
  await expect(page.locator('#document .page-break')).toHaveCount(1);
  await page.locator('#document .question').nth(2).locator('.choice').first().click();
  await examTool(page, 'correctChoice');
  await expect(key.locator('li')).toHaveText(['1. D', '2. —', '3. A']);
  await page.keyboard.press('Control+z');
  await expect(key.locator('li')).toHaveText(['1. D', '2. —', '3. ?']);
  // Asked again, it does not make a second key.
  await examTool(page, 'answerKey');
  await expect(page.locator('#document .answer-key')).toHaveCount(1);
});

test('düz metinde cevap anahtarı satırı', async () => {
  const choice = (text: string, correct = false) => ({ type: 'choice', attrs: { correct }, content: [{ type: 'text', text }] });
  const bytes = await txtFormat.write!({ type: 'doc', content: [
    { type: 'question', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'S' }] }, { type: 'choices', content: [choice('x'), choice('y', true)] }] },
    { type: 'answerKey' },
  ] });
  expect(new TextDecoder().decode(bytes)).toBe('1. S\n   A) x\n   B) y\nCevap Anahtarı: 1. B\n');
});

test('yan yana iki soru: soldan sağa numaralanır; eşle, taşı, ayır; çiftten silinen soru öbürünü yalnız bırakır', async ({ page }) => {
  await page.goto('/');
  await examTool(page, 'questionRow');
  await expect(page.locator('#document .question-row .question')).toHaveCount(2);
  await page.keyboard.type('Sol soru');
  await page.locator('#document .question-row .question').nth(1).locator('p').click();
  await page.keyboard.type('Sağ soru');
  const boxes = await page.locator('#document .question-row .question').evaluateAll(elements => elements.map(element => element.getBoundingClientRect()).map(box => ({ top: Math.round(box.top), left: box.left })));
  expect(boxes[0].top).toBe(boxes[1].top);
  expect(boxes[0].left).toBeLessThan(boxes[1].left);

  await openFile(page, 'S.awd', awdFile(['Bir', 'İki', 'Üç'].map(text => ({ type: 'question', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }))));
  await page.getByRole('button', { name: 'Kaydetmeden devam et' }).click();
  await expect(page.locator('#document .question')).toHaveCount(3);
  await page.locator('#document .question p', { hasText: 'Bir' }).click();
  await examTool(page, 'pairQuestions');
  await expect(page.locator('#document .question-row .question')).toHaveText(['Bir', 'İki']);
  // The pair moves as one.
  await examTool(page, 'moveQuestionDown');
  await expect(page.locator('#document > div').first()).toHaveText('Üç');
  await expect(page.locator('#document .question-row')).toHaveCount(1);
  await examTool(page, 'unpairQuestions');
  await expect(page.locator('#document .question-row')).toHaveCount(0);
  await expect(page.locator('#document .question')).toHaveText(['Üç', 'Bir', 'İki']);
  // Paired again, then one of the pair deleted: the other stays on its own.
  await page.locator('#document .question p', { hasText: 'Bir' }).click();
  await examTool(page, 'pairQuestions');
  await page.locator('#document .question p', { hasText: 'İki' }).click();
  await examTool(page, 'deleteQuestion');
  await expect(page.locator('#document .question-row')).toHaveCount(0);
  await expect(page.locator('#document .question')).toHaveText(['Üç', 'Bir']);
});

test('sayfa sonuna gelen yan yana soru çifti bölünmez', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const filler = Array.from({ length: 34 }, (_, i) => ({ type: 'paragraph', content: [{ type: 'text', text: `Satır ${i + 1}` }] }));
  const question = (text: string) => ({ type: 'question', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }, { type: 'paragraph' }, { type: 'paragraph' }, { type: 'paragraph' }] });
  await openFile(page, 'S.awd', awdFile([...filler, { type: 'questionRow', content: [question('Sol'), question('Sağ')] }]));
  await expect(page.locator('.page-sheet')).toHaveCount(2);
  const sheets = await page.evaluate(() => {
    const host = getComputedStyle(document.querySelector('#editorHost')!);
    const top = parseFloat(host.getPropertyValue('--margin-top'));
    const bottom = parseFloat(host.getPropertyValue('--margin-bottom'));
    const pages = [...document.querySelectorAll('.page-sheet')].map(sheet => sheet.getBoundingClientRect());
    const row = document.querySelector('#document .question-row')!.getBoundingClientRect();
    const sheetOf = (y: number) => pages.findIndex(sheet => y >= sheet.top + top - 3 && y <= sheet.bottom - bottom + 1);
    return [sheetOf(row.top + 2), sheetOf(row.bottom - 2)];
  });
  expect(sheets).toEqual([1, 1]);
});
