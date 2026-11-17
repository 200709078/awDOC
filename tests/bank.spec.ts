import { expect, test, type Page } from '@playwright/test';
import { previewOf } from '../src/app/question-bank';
import { awdFile, openFile } from './helpers/fake-files';

const text = (value: string) => ({ type: 'text', text: value });
const question = (stem: string, choices: string[] = []) => ({
  type: 'question',
  content: [{ type: 'paragraph', content: [text(stem)] }, ...(choices.length ? [{ type: 'choices', content: choices.map(choice => ({ type: 'choice', content: [text(choice)] })) }] : [])],
});

async function examTool(page: Page, id: string): Promise<void> {
  await page.locator('#group-exam').click();
  await page.locator(`#tool-${id}`).click();
}

async function addToBank(page: Page, topic: string, all = false): Promise<void> {
  await examTool(page, 'bankAdd');
  const dialog = page.locator('#bankAddDialog');
  await expect(dialog).toBeVisible();
  if (all) await dialog.locator('input[value="all"]').check();
  await dialog.locator('#bankAddTopic').fill(topic);
  await dialog.getByRole('button', { name: 'Ekle' }).click();
}

test('soru bankaya eklenir, cihazda kalır; aranır, konuya göre süzülür, belgeye eklenir, iki basışla silinir', async ({ page }) => {
  await page.goto('/');
  await openFile(page, 'Sinav.awd', awdFile([
    question('Üçgenin iç açıları toplamı kaçtır?', ['90', '180', '270', '360']),
    question('Kümenin eleman sayısını bulunuz.'),
  ]));
  await page.locator('#document .question p').first().click();
  await addToBank(page, 'Üçgenler');
  await expect(page.locator('#toast')).toContainText('1 soru bankaya eklendi');
  await page.locator('#document .question p').nth(1).click();
  await addToBank(page, 'Kümeler');

  // Still there after the app is closed and opened again.
  await page.reload();
  await examTool(page, 'bank');
  const dialog = page.locator('#bankDialog');
  const items = dialog.locator('.bank-item');
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText('Kümenin eleman sayısını bulunuz.');
  await expect(items.first().locator('.bank-item__meta')).toContainText('Kümeler · açık uçlu');
  await expect(items.nth(1).locator('.bank-item__meta')).toContainText('Üçgenler · 4 şıklı');
  // Turkish letters folded, as in Bul: "İÇ" finds "iç".
  await dialog.locator('#bankSearch').fill('İÇ açıları');
  await expect(items).toHaveCount(1);
  await dialog.locator('#bankSearch').fill('');
  await dialog.locator('#bankTopic').selectOption('Kümeler');
  await expect(items).toHaveCount(1);
  await dialog.locator('#bankTopic').selectOption('');

  // "Ekle" puts it in the document; the window stays open for more.
  const before = await page.locator('#document .question').count();
  await items.filter({ hasText: 'Üçgenin' }).getByRole('button', { name: 'Ekle' }).click();
  await expect(page.locator('#document .question')).toHaveCount(before + 1);
  await expect(page.locator('#document .question .choice')).toHaveCount(4);
  await expect(dialog).toBeVisible();

  const remove = items.filter({ hasText: 'Kümenin' }).getByRole('button', { name: 'Sil' });
  await remove.click();
  await expect(items).toHaveCount(2);
  await items.filter({ hasText: 'Kümenin' }).getByRole('button', { name: 'Silinsin mi?' }).click();
  await expect(items).toHaveCount(1);
  await expect(dialog.locator('#bankTopic option')).toHaveText(['Tümü', 'Üçgenler']);
});

test('belgedeki bütün sorular bir kerede eklenir; aynısı ikinci kez eklenmez; liste yeni belgede açılır', async ({ page }) => {
  await page.goto('/');
  await openFile(page, 'Sinav.awd', awdFile([
    { type: 'paragraph', content: [text('Başlık')] },
    question('Bir', ['a', 'b']),
    { type: 'questionRow', content: [question('Sol'), question('Sağ')] },
  ]));
  await addToBank(page, 'Deneme', true);
  await expect(page.locator('#toast')).toContainText('2 soru bankaya eklendi');
  await addToBank(page, 'Deneme', true);
  await expect(page.locator('#toast')).toContainText('Bu sorular bankada zaten var.');

  await examTool(page, 'bank');
  await expect(page.locator('#bankDialog .bank-item')).toHaveCount(2);
  await expect(page.locator('#bankDialog .bank-item').first()).toContainText('Sol | Sağ');
  await page.locator('#bankExport').click();
  await expect(page.locator('#documentStatus')).toHaveText('Soru bankası');
  await expect(page.locator('#document .question')).toHaveCount(3);
  await expect(page.locator('#document .question-row')).toHaveCount(1);
});

test('belgede soru yokken bankaya ekleme nedenini söyler', async ({ page }) => {
  await page.goto('/');
  await examTool(page, 'bankAdd');
  await expect(page.locator('#toast')).toContainText('Belgede soru yok');
  await expect(page.locator('#bankAddDialog')).toBeHidden();
});

test('bankadaki sorunun ön yazısı: metin, formül LaTeX olarak, çiftte iki soru', () => {
  expect(previewOf(question('Kök', ['1']))).toBe('Kök');
  expect(previewOf({ type: 'question', content: [{ type: 'paragraph', content: [text('x = '), { type: 'formula', attrs: { latex: '\\frac12' } }] }] })).toBe('x = \\frac12');
  expect(previewOf({ type: 'questionRow', content: [question('A'), question('B')] })).toBe('A | B');
  expect(previewOf(question('ç'.repeat(300))).length).toBe(160);
});
