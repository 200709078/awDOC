// Masaüstü uygulamasını gerçekten açıp dener (grafik oturum gerekir): `npm run test:electron`.
// Paketlenmiş uygulama için: AWDOC_ELECTRON_EXECUTABLE=$PWD/release/linux-unpacked/awdoc node scripts/test-electron.mjs
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { _electron as electron } from '@playwright/test'

const executablePath = process.env.AWDOC_ELECTRON_EXECUTABLE
const folder = mkdtempSync(path.join(tmpdir(), 'awdoc-'))
// A profile of its own, so the user's recent list never sees the test's files.
const profile = mkdtempSync(path.join(tmpdir(), 'awdoc-profil-'))
const launchEnvironment = { ...process.env, AWDOC_DEV_SERVER_URL: '', AWDOC_USER_DATA: profile }
delete launchEnvironment.ELECTRON_RUN_AS_NODE
const file = path.join(folder, 'Deneme.awd')
writeFileSync(file, `${JSON.stringify({
  format: 'awDOC',
  version: 1,
  app: 'test',
  document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Masaüstü denemesi' }] }] },
})}\n`)

const application = await electron.launch({
  ...(executablePath ? { executablePath } : {}),
  args: [...(executablePath ? [] : ['.']), file],
  env: launchEnvironment,
  timeout: 30_000,
})

try {
  const page = await application.firstWindow()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.waitForLoadState('load')
  assert.ok(page.url().startsWith('awdoc://app/'), 'Üretim çıktısı uygulamanın kendi adresinden açılmalı')

  const preferences = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences())
  assert.equal(preferences.nodeIntegration, false)
  assert.equal(preferences.contextIsolation, true)
  assert.equal(preferences.sandbox, true)
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  assert.deepEqual(await page.evaluate(() => Object.keys(window.awDOCDesktop ?? {}).sort()), ['files', 'office', 'screenKeyboard', 'windowControls'])

  // Frameless window: the renderer's title bar replaces the system frame.
  const titlebar = page.locator('#titlebar')
  await titlebar.waitFor()
  assert.equal(await titlebar.locator('.titlebar__title').textContent(), 'awDOC | mADEMatik')
  assert.equal((await page.locator('#toolbar').boundingBox()).y, (await titlebar.boundingBox()).height, 'Araç çubuğu başlık çubuğunun altında başlamalı')

  // The file from the command line opens; Kaydet writes the same file without asking.
  const documentElement = page.locator('#document')
  await page.waitForFunction(() => document.querySelector('#document')?.textContent === 'Masaüstü denemesi')
  assert.equal(await page.locator('#documentStatus').textContent(), 'Deneme')
  await documentElement.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' — eklendi')
  await page.keyboard.press('Control+s')
  await page.waitForFunction(() => !document.querySelector('#documentStatus').classList.contains('is-dirty'))
  const saved = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(saved.document.content[0].content[0].text, 'Masaüstü denemesi — eklendi')
  assert.deepEqual(readdirSync(folder), ['Deneme.awd'], 'Geçici dosya kalmamalı')

  // The recent list finds the file again through the shell's lasting source.
  await page.locator('#tool-newDocument').click()
  await page.waitForFunction(() => document.querySelector('#document')?.textContent === '')
  await page.locator('#toolbarMenuButton').click()
  await page.locator('#tool-recent').click()
  await page.locator('#recentList .recent-item__name', { hasText: 'Deneme' }).click()
  await page.waitForFunction(() => document.querySelector('#document')?.textContent === 'Masaüstü denemesi — eklendi')

  // A header and page numbers (Sayfa Düzeni) are printed in the PDF's margins; a page break makes a second page.
  await page.evaluate(() => document.querySelector('#tool-pageSetup').click())
  await page.locator('#pageHeader').fill('Masaüstü üst bilgisi')
  await page.locator('#pageNumbers').selectOption('bottom-right')
  await page.locator('#pageNumberFormat').selectOption('number-of-total')
  await page.locator('#pageDialog').getByRole('button', { name: 'Uygula' }).click()
  await page.locator('#pageDialog').waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.activeElement?.id === 'document')
  await page.locator('#document p').first().click()
  await page.keyboard.press('End')
  await page.keyboard.press('Control+Enter')
  await page.keyboard.type('İkinci sayfa ')
  // A formula: MathLive and its fonts come from the app itself (no network, strict CSP).
  await page.keyboard.press('Alt+=')
  await page.locator('#formulaInput').waitFor()
  await page.keyboard.type('x^2')
  await page.keyboard.press('Enter')
  await page.locator('#document .formula .ML__latex').waitFor()
  await page.waitForFunction(() => document.fonts.check('16px KaTeX_Main') && document.fonts.check('italic 16px KaTeX_Math'))
  // A question with its choices: the number and the letters are printed too.
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.evaluate(() => document.querySelector('#tool-multipleChoice').click())
  await page.keyboard.type('Masaüstü sorusu')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.type('bir')
  await page.keyboard.press('Enter')
  await page.keyboard.type('iki')
  await page.locator('#document .question .choice', { hasText: 'iki' }).waitFor()
  await page.waitForFunction(() => document.querySelectorAll('.page-sheet').length === 2 || !document.querySelector('#editorHost.is-paged'))
  // Saved with the file (and nothing left unsaved to ask about when the window closes).
  await page.keyboard.press('Control+s')
  await page.waitForFunction(() => !document.querySelector('#documentStatus').classList.contains('is-dirty'))
  const withPages = JSON.parse(readFileSync(file, 'utf8')).document
  assert.equal(withPages.attrs.page.header, 'Masaüstü üst bilgisi')
  assert.deepEqual(withPages.content.map(node => node.type), ['paragraph', 'pageBreak', 'paragraph', 'question', 'paragraph'])

  // PDF Olarak Kaydet: the save dialog is answered in the main process, then the file must be a PDF.
  const pdfPath = path.join(folder, 'Deneme.pdf')
  await application.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target })
  }, pdfPath)
  await page.evaluate(() => document.querySelector('#tool-exportPdf').click())
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent?.includes('Deneme.pdf'))
  assert.equal(readFileSync(pdfPath).subarray(0, 5).toString('latin1'), '%PDF-', 'PDF dosyası yazılmalı')
  assert.equal(readFileSync(pdfPath).toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length, 2, 'Sayfa sonundan sonra PDF iki sayfa olmalı')
  assert.match(readFileSync(pdfPath).toString('latin1'), /KaTeX_Math/, 'Formülün yazı tipi PDF\'e gömülmeli')
  // AWDOC_TEST_PDF=<yol>: the PDF is kept there, to look at it.
  if (process.env.AWDOC_TEST_PDF) copyFileSync(pdfPath, process.env.AWDOC_TEST_PDF)

  // Closing with unsaved changes: the page's own window asks (as before Yeni or Aç), not the shell.
  await page.locator('#document').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' kapanırken')
  await page.waitForFunction(() => document.querySelector('#documentStatus').classList.contains('is-dirty'))
  const unsaved = page.locator('#unsavedDialog')
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await unsaved.waitFor()
  // A second click on ✕ meanwhile does not ask twice.
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  assert.deepEqual(await unsaved.locator('button').evaluateAll(buttons => buttons.filter(b => b.offsetParent).sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x).map(b => b.textContent)), ['Vazgeç', 'Kaydetme', 'Kaydet'])
  await unsaved.getByRole('button', { name: 'Vazgeç' }).click()
  await unsaved.waitFor({ state: 'hidden' })
  await page.waitForTimeout(500)
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1, 'Vazgeç pencereyi açık tutmalı')
  assert.deepEqual(errors, [])
  const closed = application.waitForEvent('close')
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await unsaved.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await closed
  assert.match(readFileSync(file, 'utf8'), /kapanırken/, 'Kaydet dosyaya yazmalı, sonra pencere kapanmalı')
  console.log('✓ Electron: güvenlik ayarları, başlık çubuğu, komut satırından açma, aynı dosyaya kaydetme, son belgeler, sayfa düzeni, formül, soru, PDF aktarımı ve kapatırken Kaydet çalışıyor.')
} finally {
  await application.close()
  rmSync(folder, { recursive: true, force: true })
  rmSync(profile, { recursive: true, force: true })
}
