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

test('sayfa sonuna gelen soru numarasıyla birlikte yeni sayfaya geçer; yan yana şıklar bölünmez', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const filler = Array.from({ length: 36 }, (_, i) => ({ type: 'paragraph', content: [{ type: 'text', text: `Satır ${i + 1}` }] }));
  const question = (text: string) => ({ type: 'question', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }, { type: 'choices', attrs: { layout: 'row' }, content: ['a', 'b', 'c', 'd', 'e'].map(choice => ({ type: 'choice', content: [{ type: 'text', text: choice }] })) }] });
  await openFile(page, 'S.awd', awdFile([...filler, question('Sınırdaki soru'), question('Sonraki soru')]));
  await expect(page.locator('.page-sheet')).toHaveCount(2);
  // Whatever moved, the question's number is on the sheet of its text, and the choices are inside a sheet's text area.
  const placed = await page.evaluate(() => {
    const host = getComputedStyle(document.querySelector('#editorHost')!);
    const top = parseFloat(host.getPropertyValue('--margin-top'));
    const bottom = parseFloat(host.getPropertyValue('--margin-bottom'));
    const sheets = [...document.querySelectorAll('.page-sheet')].map(sheet => sheet.getBoundingClientRect());
    const sheetOf = (y: number) => sheets.findIndex(sheet => y >= sheet.top + top - 3 && y <= sheet.bottom - bottom + 1);
    return [...document.querySelectorAll('#document .question')].map(question => {
      const stem = question.querySelector('p')!;
      const range = document.createRange();
      range.selectNodeContents(stem);
      const text = range.getBoundingClientRect();
      const choices = question.querySelector('.choices')!.getBoundingClientRect();
      return { number: sheetOf(question.getBoundingClientRect().top + 2), text: sheetOf(text.top + 2), choicesTop: sheetOf(choices.top + 1), choicesBottom: sheetOf(choices.bottom - 1) };
    });
  });
  for (const question of placed) {
    expect(question.number).toBe(question.text);
    expect(question.choicesTop).toBeGreaterThanOrEqual(0);
    expect(question.choicesTop).toBe(question.choicesBottom);
  }
});
