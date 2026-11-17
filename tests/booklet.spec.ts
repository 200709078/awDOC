import { expect, test } from '@playwright/test';
import { makeBooklet, shuffled } from '../src/app/booklet';
import { awdFile, openFile } from './helpers/fake-files';

/** The same "random" numbers every run. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const text = (value: string) => ({ type: 'text', text: value });
const paragraph = (value?: string) => ({ type: 'paragraph', ...(value ? { content: [text(value)] } : {}) });
const question = (stem: string, choices: string[] = [], correct = -1) => ({
  type: 'question',
  content: [paragraph(stem), ...(choices.length ? [{ type: 'choices', content: choices.map((choice, index) => ({ type: 'choice', attrs: { correct: index === correct }, content: [text(choice)] })) }] : [])],
});
const stems = (blocks: { type?: string; content?: { content?: { text?: string }[] }[] }[]) =>
  blocks.filter(block => block.type === 'question').map(block => block.content![0].content![0].text);

test('kitapçık: sorular kendi bölümlerinde karışır, başlık ve boş satırlar yerinde kalır, üst bilgiye B yazılır', () => {
  const document = {
    type: 'doc',
    attrs: { page: { header: 'Matematik 1. Yazılı' } },
    content: [
      paragraph('BAŞLIK'),
      question('1'), paragraph(), question('2'), question('3'),
      paragraph('B. Açık uçlu sorular'),
      question('4'), question('5'),
    ],
  };
  const booklet = makeBooklet(document, { questions: true, choices: false, label: 'B Kitapçığı' }, seeded(7));
  const blocks = booklet.content!;
  expect(blocks[0]).toEqual(paragraph('BAŞLIK'));
  expect(blocks[2]).toEqual(paragraph());
  expect(blocks[5]).toEqual(paragraph('B. Açık uçlu sorular'));
  const order = stems(blocks as never);
  expect(order.slice(0, 3).sort()).toEqual(['1', '2', '3']);
  expect(order.slice(0, 3)).not.toEqual(['1', '2', '3']);
  expect(order.slice(3)).toEqual(['5', '4']);
  expect((booklet.attrs!.page as { header: string }).header).toBe('Matematik 1. Yazılı — B Kitapçığı');
  // A is untouched.
  expect(stems(document.content as never)).toEqual(['1', '2', '3', '4', '5']);
});

test('kitapçık: şıklar karışır, doğru şık işaretiyle birlikte gider; yan yana çift birlikte taşınır', () => {
  const document = {
    type: 'doc',
    content: [
      question('S', ['a', 'b', 'c', 'd', 'e'], 1),
      { type: 'questionRow', content: [question('Sol'), question('Sağ')] },
    ],
  };
  const booklet = makeBooklet(document, { questions: true, choices: true, label: 'B Kitapçığı' }, seeded(3));
  const moved = booklet.content!.find(block => block.type === 'question')!;
  const choices = moved.content![1].content!;
  expect(choices.map(choice => choice.content![0].text).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  expect(choices.map(choice => choice.content![0].text)).not.toEqual(['a', 'b', 'c', 'd', 'e']);
  expect(choices.find(choice => choice.attrs!.correct)!.content![0].text).toBe('b');
  const row = booklet.content!.find(block => block.type === 'questionRow')!;
  expect(row.content!.map(part => part.content![0].content![0].text)).toEqual(['Sol', 'Sağ']);
  expect(booklet.content![0].type).toBe('questionRow');
});

test('karıştırma iki ve daha fazla ögede asıl sırayı hiç vermez', () => {
  for (let seed = 1; seed < 50; seed++) expect(shuffled([1, 2], seeded(seed))).toEqual([2, 1]);
  expect(shuffled([1, 2, 3], () => 0.999)).not.toEqual([1, 2, 3]);
  expect(shuffled([1])).toEqual([1]);
});

test('B kitapçığı yeni belge olarak açılır; cevap anahtarı B\'nin doğru şıklarına göre', async ({ page }) => {
  await page.goto('/');
  await openFile(page, 'Yazılı.awd', awdFile([
    paragraph('MATEMATİK YAZILISI'),
    question('Bir', ['1', '2', '3', '4'], 0),
    question('İki', ['1', '2', '3', '4'], 1),
    question('Üç', ['1', '2', '3', '4'], 2),
    question('Dört', ['1', '2', '3', '4'], 3),
    { type: 'pageBreak' },
    { type: 'answerKey' },
  ]));
  await expect(page.locator('#document .answer-key li')).toHaveText(['1. A', '2. B', '3. C', '4. D']);
  await page.locator('#group-exam').click();
  await page.locator('#tool-booklet').click();
  await page.getByRole('button', { name: 'B kitapçığını aç' }).click();
  await expect(page.locator('#toast')).toContainText('B kitapçığı açıldı');
  await expect(page.locator('#documentStatus')).toHaveText('Yazılı - B');
  await expect(page.locator('.page-sheet__header').first()).toHaveText('B Kitapçığı');
  await expect(page.locator('#document > p').first()).toHaveText('MATEMATİK YAZILISI');
  // Each question's key letter is where its marked choice now is.
  const expected = await page.locator('#document .question').evaluateAll(questions => questions.map((question, index) => {
    const choices = [...question.querySelectorAll('.choice')];
    return `${index + 1}. ${'ABCD'[choices.findIndex(choice => choice.hasAttribute('data-correct'))]}`;
  }));
  await expect(page.locator('#document .answer-key li')).toHaveText(expected);
  expect(await page.locator('#document .question p').allTextContents()).not.toEqual(['Bir', 'İki', 'Üç', 'Dört']);
});

test('tek açık uçlu soruda B kitapçığı yapılmaz, nedeni söylenir', async ({ page }) => {
  await page.goto('/');
  await openFile(page, 'Tek.awd', awdFile([question('Yalnız')]));
  await page.locator('#group-exam').click();
  await page.locator('#tool-booklet').click();
  await expect(page.locator('#toast')).toContainText('en az iki soru');
  await expect(page.locator('#bookletDialog')).toBeHidden();
});
