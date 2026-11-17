// Masaüstü uygulamasını gerçekten açıp dener (grafik oturum gerekir): `npm run test:electron`.
// Paketlenmiş uygulama için: AWDOC_ELECTRON_EXECUTABLE=$PWD/release/linux-unpacked/awdoc node scripts/test-electron.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { _electron as electron } from '@playwright/test'

const executablePath = process.env.AWDOC_ELECTRON_EXECUTABLE
const launchEnvironment = { ...process.env, AWDOC_DEV_SERVER_URL: '' }
delete launchEnvironment.ELECTRON_RUN_AS_NODE
const folder = mkdtempSync(path.join(tmpdir(), 'awdoc-'))
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

  assert.deepEqual(errors, [])
  console.log('✓ Electron: güvenlik ayarları, başlık çubuğu, komut satırından açma ve aynı dosyaya kaydetme çalışıyor.')
} finally {
  await application.close()
  rmSync(folder, { recursive: true, force: true })
}
