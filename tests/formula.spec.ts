import { expect, test, type Page } from '@playwright/test';
import { txtFormat } from '../src/formats/txt';
import { awdFile, fakeSavePicker, openFile, savedFiles } from './helpers/fake-files';


/** The formulas in the saved file. */
async function savedFormulas(page: Page): Promise<string[]> {
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await savedFiles(page)).length).toBeGreaterThan(0);
  const files = await savedFiles(page);
  const found: string[] = [];
  const walk = (node: { type: string; attrs?: { latex?: string }; content?: unknown[] }) => {
    if (node.type === 'formula') found.push(node.attrs!.latex!);
    (node.content as typeof node[] | undefined)?.forEach(walk);
  };
  walk(JSON.parse(files.at(-1)!.text).document);
  return found;
}

test('Formül: yazılan formül belgeye girer, MathLive ile çizilir ve dosyaya LaTeX olarak kaydedilir', async ({ page }) => {
  await fakeSavePicker(page, ['Formul.awd']);
  await page.goto('/');
  await page.keyboard.type('Alan: ');
  await page.locator('#tool-formula').click();
  const field = page.locator('#formulaInput');
  await expect(field).toBeVisible();
  await expect(page.locator('#formulaSave')).toHaveText('Ekle');
  await page.keyboard.type('x^2');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('+');
  await page.locator('.formula-dialog__piece[title="Kesir"]').click();
  await page.keyboard.type('1');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('2');
  await expect(page.locator('#formulaLatex')).toHaveValue('x^2+\\frac12');
  await page.keyboard.press('Enter');
  await expect(page.locator('#formulaDialog')).toBeHidden();
  await expect(page.locator('#document .formula .ML__latex')).toHaveCount(1);
  // The cursor is after the formula: writing goes on.
  await page.keyboard.type(' m²');
  await expect(page.locator('#document')).toContainText('m²');
  expect(await savedFormulas(page)).toEqual(['x^2+\\frac12']);
});

test('çift tıklama formülü açar; değişiklik Geri Al ile döner; boşaltılan formül silinir', async ({ page }) => {
  await page.goto('/');
  await openFile(page, 'F.awd', awdFile([{ type: 'paragraph', content: [{ type: 'text', text: 'Sonuç ' }, { type: 'formula', attrs: { latex: 'a+b' } }] }]));
  const formula = page.locator('#document .formula');
  await expect(formula.locator('.ML__latex')).toHaveCount(1);
  await formula.dblclick();
  await expect(page.locator('#formulaSave')).toHaveText('Tamam');
  await expect(page.locator('#formulaLatex')).toHaveValue('a+b');
  await page.locator('.formula-dialog__latex summary').click();
  await page.locator('#formulaLatex').fill('\\sqrt{2}');
  await page.locator('#formulaSave').click();
  await expect(formula).toHaveAttribute('data-latex', '\\sqrt{2}');
  await page.keyboard.press('Control+z');
  await expect(formula).toHaveAttribute('data-latex', 'a+b');

  // Selected (a click), Enter opens it too; emptied, it goes.
  await formula.click();
  await page.keyboard.press('Enter');
  await expect(page.locator('#formulaDialog')).toBeVisible();
  await page.locator('#formulaLatex').fill('');
  await page.locator('#formulaSave').click();
  await expect(page.locator('#document .formula')).toHaveCount(0);
  await expect(page.locator('#document')).toHaveText('Sonuç ');
});

test('Alt+= formül penceresini açar; ondalık virgül; Vazgeç belgeyi değiştirmez', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Alt+=');
  await expect(page.locator('#formulaInput')).toBeVisible();
  await page.keyboard.type('3,5');
  await expect(page.locator('#formulaLatex')).toHaveValue(/^3\{?,\}?5$/);
  await page.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(page.locator('#formulaDialog')).toBeHidden();
  await expect(page.locator('#document .formula')).toHaveCount(0);
  await expect(page.locator('#document')).toBeFocused();
});

test('formül klavyesi pencerenin içinde açılır; ↵ formülü ekler', async ({ page }) => {
  await page.goto('/');
  await page.locator('#tool-formula').click();
  await expect(page.locator('#formulaInput')).toBeVisible();
  await page.locator('#formulaKeyboard').click();
  const keyboard = page.locator('#formulaDialog .ML__keyboard');
  await expect(keyboard).toBeVisible();
  await expect(page.locator('#formulaDialog')).toHaveClass(/has-keyboard/);
  await page.locator('#formulaDialog .MLK__keycap[aria-label="7"]').locator('visible=true').first().click();
  await expect(page.locator('#formulaLatex')).toHaveValue('7');
  await page.locator('#formulaDialog .ML__keyboard [data-command*="commit"]').locator('visible=true').click();
  await expect(page.locator('#formulaDialog')).toBeHidden();
  await expect(page.locator('#document .formula')).toHaveAttribute('data-latex', '7');
});

test('düz metinde formül LaTeX olarak yazılır', async () => {
  const bytes = await txtFormat.write!({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x = ' }, { type: 'formula', attrs: { latex: '\\frac{1}{2}' } }] }] });
  expect(new TextDecoder().decode(bytes)).toBe('x = \\frac{1}{2}\n');
});
