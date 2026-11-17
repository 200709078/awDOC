import { expect, test, type Page } from '@playwright/test';
import { schoolYear } from '../src/app/exam-template';

async function openExamDialog(page: Page): Promise<void> {
  await page.locator('#group-exam').click();
  await page.locator('#tool-examPaper').click();
  await expect(page.locator('#examDialog')).toBeVisible();
}

test('Yeni sınav kâğıdı: büyük harfli başlık, öğrenci tablosu, ilk soru, imza; bilgiler hatırlanır', async ({ page }) => {
  await page.goto('/');
  await openExamDialog(page);
  await expect(page.locator('#examYear')).toHaveValue(schoolYear());
  await page.locator('#examSchool').fill('Atatürk Anadolu Lisesi');
  await page.locator('#examGrade').fill('10. Sınıf');
  await page.locator('#examSubject').fill('Matematik');
  await page.locator('#examName').fill('1. Dönem 1. Yazılı');
  await page.locator('#examTeacher').fill('Ayşe Yılmaz');
  await page.getByRole('button', { name: 'Yeni sınav kâğıdı' }).click();

  const paragraphs = page.locator('#document > p');
  await expect(paragraphs.first()).toHaveText(`${schoolYear()} EĞİTİM-ÖĞRETİM YILI ATATÜRK ANADOLU LİSESİ`);
  await expect(paragraphs.nth(1)).toHaveText('10. SINIF MATEMATİK DERSİ 1. DÖNEM 1. YAZILI SINAVI');
  await expect(page.locator('#document table td')).toHaveText(['Adı Soyadı:', 'Numarası:', 'Sınıfı:', 'Puanı:']);
  await expect(page.locator('#document .question .choice')).toHaveCount(5);
  await expect(paragraphs.last()).toHaveText('Matematik Öğretmeni');
  // The cursor waits in the first question.
  await page.keyboard.type('İlk soru');
  await expect(page.locator('#document .question p').first()).toHaveText('İlk soru');
  // Narrow margins and "1 / 1" at the bottom.
  await expect(page.locator('.page-sheet__number').first()).toHaveText('1 / 1');
  expect(await page.locator('#pageStyle').textContent()).toContain('margin: 15mm 15mm 15mm 15mm');

  // Remembered for the next exam.
  await page.reload();
  await openExamDialog(page);
  await expect(page.locator('#examSchool')).toHaveValue('Atatürk Anadolu Lisesi');
  await expect(page.locator('#examTeacher')).toHaveValue('Ayşe Yılmaz');
});

test('Başlığı bu belgeye ekle: başlık belgenin başına girer, yazılan yerinde kalır; Geri Al kaldırır', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.type('Var olan metin');
  await openExamDialog(page);
  await page.locator('#examSchool').fill('Fen Lisesi');
  await page.locator('#examSubject').fill('Fizik');
  await page.getByRole('button', { name: 'Başlığı bu belgeye ekle' }).click();
  await expect(page.locator('#document > p').first()).toHaveText(`${schoolYear()} EĞİTİM-ÖĞRETİM YILI FEN LİSESİ`);
  await expect(page.locator('#document > p').nth(1)).toHaveText('FİZİK DERSİ');
  await expect(page.locator('#document > p').last()).toHaveText('Var olan metin');
  await page.keyboard.press('Control+z');
  await expect(page.locator('#document table')).toHaveCount(0);
  await expect(page.locator('#document')).toHaveText('Var olan metin');
});

test('öğretim yılı Eylül\'de değişir', () => {
  expect(schoolYear(new Date(2026, 8, 1))).toBe('2026-2027');
  expect(schoolYear(new Date(2027, 5, 20))).toBe('2026-2027');
  expect(schoolYear(new Date(2027, 7, 31))).toBe('2026-2027');
});
