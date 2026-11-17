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
  assert.deepEqual(await page.evaluate(() => Object.keys(window.awDOCDesktop ?? {}).sort()), ['files', 'screenKeyboard', 'windowControls'])

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

  // PDF Olarak Kaydet: the save dialog is answered in the main process, then the file must be a PDF.
  const pdfPath = path.join(folder, 'Deneme.pdf')
  await application.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target })
  }, pdfPath)
  await page.evaluate(() => document.querySelector('#tool-exportPdf').click())
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent?.includes('Deneme.pdf'))
  assert.equal(readFileSync(pdfPath).subarray(0, 5).toString('latin1'), '%PDF-', 'PDF dosyası yazılmalı')
  // AWDOC_TEST_PDF=<yol>: the PDF is kept there, to look at it.
  if (process.env.AWDOC_TEST_PDF) copyFileSync(pdfPath, process.env.AWDOC_TEST_PDF)

  assert.deepEqual(errors, [])
  console.log('✓ Electron: güvenlik ayarları, başlık çubuğu, komut satırından açma, aynı dosyaya kaydetme, son belgeler ve PDF aktarımı çalışıyor.')
} finally {
  await application.close()
  rmSync(folder, { recursive: true, force: true })
  rmSync(profile, { recursive: true, force: true })
}
