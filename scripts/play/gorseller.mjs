// Google Play mağaza görsellerini üretir (docs/play/): npm run play:gorseller (önce derler).
// Derlenmiş uygulama (dist/) Vite önizleme sunucusunda açılır; ekran görüntülerindeki belgeler aşağıdaki uydurma
// sınav kâğıdıdır (gerçek öğrenci verisi yok). Tarayıcı: sistemdeki Chromium (/usr/bin/chromium) ya da
// Playwright'ın kendi tarayıcısı (npx playwright install chromium).
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { preview } from 'vite'

const root = path.resolve(import.meta.dirname, '../..')
const out = path.join(root, 'docs/play')
const shots = path.join(out, 'ekran')
mkdirSync(shots, { recursive: true })

const text = (value, marks) => (marks ? { type: 'text', text: value, marks } : { type: 'text', text: value })
const bold = [{ type: 'bold' }]
const paragraph = (content, textAlign) => ({ type: 'paragraph', ...(textAlign ? { attrs: { textAlign } } : {}), content })
const cell = value => ({ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [paragraph([text(value, bold)])] })
const question = (stem, choices, correct, points, formula) => ({
  type: 'question',
  attrs: { points },
  content: [
    paragraph([...(stem ? [text(stem)] : []), ...(formula ? [{ type: 'formula', attrs: { latex: formula } }, text(' ifadesinin değeri kaçtır?')] : [])]),
    { type: 'choices', attrs: { layout: choices.length > 4 ? 'list' : 'grid' }, content: choices.map((choice, index) => ({ type: 'choice', attrs: { correct: index === correct }, content: [text(choice)] })) },
  ],
})

/** Uydurma bir matematik yazılısı: başlık, öğrenci tablosu, iki sütunda sorular, formüller. */
function examDocument() {
  return {
    type: 'doc',
    attrs: { page: { margins: { top: 15, right: 15, bottom: 15, left: 15 }, pageNumbers: 'bottom-center', numberFormat: 'number-of-total' } },
    content: [
      paragraph([text('2026-2027 EĞİTİM-ÖĞRETİM YILI', bold)], 'center'),
      paragraph([text('ATATÜRK ANADOLU LİSESİ', bold)], 'center'),
      paragraph([text('10. SINIF MATEMATİK DERSİ 1. DÖNEM 1. YAZILI', bold)], 'center'),
      { type: 'table', content: [
        { type: 'tableRow', content: [cell('Adı Soyadı:'), cell('Numarası:')] },
        { type: 'tableRow', content: [cell('Sınıfı:'), cell('Puanı:')] },
      ] },
      paragraph([text('Açıklama: ', bold), text('Süre 40 dakikadır. Her sorunun puanı yanında yazılıdır.')]),
      { type: 'columnsStart' },
      question('', ['1', '2', '3', '4'], 1, 10, '\\frac{3}{4}+\\frac{5}{4}-1'),
      question('Bir sınıfta 12 kız ve 18 erkek öğrenci vardır. Kız öğrencilerin sınıfa oranı kaçtır?', ['2/5', '3/5', '2/3', '1/2', '3/4'], 0, 10),
      question('', ['5', '7', '9', '11'], 2, 10, '\\sqrt{81}+2^{0}-1'),
      question('Kenar uzunluğu 6 cm olan bir karenin çevresi kaç santimetredir?', ['12', '18', '24', '36', '48'], 2, 10),
      question('', ['-1', '0', '1', '2'], 3, 10, '(x-1)^{2}\\text{, }x=3\\text{ için }'),
      question('Bir sayının 3 katının 5 fazlası 26 ise bu sayı kaçtır?', ['5', '6', '7', '8', '9'], 2, 10),
      { type: 'paragraph' },
      paragraph([text('Başarılar dilerim.')], 'right'),
    ],
  }
}

const DEVICES = {
  telefon: { viewport: { width: 360, height: 720 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  tablet7: { viewport: { width: 600, height: 960 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tablet10: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
}

const server = await preview({ root, preview: { host: '127.0.0.1', port: 4179, strictPort: true } })
const url = 'http://127.0.0.1:4179/'
const browser = await chromium.launch(existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium' } : {})
const work = mkdtempSync(path.join(tmpdir(), 'awdoc-play-'))
const file = path.join(work, 'Matematik 1. Yazılı.awd')
writeFileSync(file, JSON.stringify({ format: 'awDOC', version: 1, app: 'awDOC', document: examDocument() }))

async function openPage(device) {
  const context = await browser.newContext({ ...DEVICES[device], locale: 'tr-TR' })
  await context.addInitScript(() => localStorage.setItem('awDOC.girisEkrani', 'kapali'))
  const page = await context.newPage()
  await page.goto(url)
  await page.setInputFiles('#fileInput', file)
  await page.waitForSelector('#document .question .formula .ML__latex, #document .question .formula math', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1200)
  return { context, page }
}

const save = (page, name) => page.screenshot({ path: path.join(shots, `${name}.png`) })

/** A tool, from the row or the ☰ menu. */
async function openGroup(page, id) {
  const button = page.locator(`#group-${id}`)
  if (!(await button.isVisible())) await page.locator('[aria-controls="toolbarMenu"]').click()
  await button.scrollIntoViewIfNeeded()
  await button.click()
  await page.waitForTimeout(400)
}

try {
  for (const device of Object.keys(DEVICES)) {
    let { context, page } = await openPage(device)
    await page.locator('#document').evaluate(element => element.closest('.workspace')?.scrollTo(0, 0))
    await save(page, `${device}-1-sinav`)

    await page.locator('#document .question p').nth(1).click()
    await page.keyboard.press('End')
    await openGroup(page, 'exam')
    await save(page, `${device}-2-sinav-araclari`)
    await context.close()

    ;({ context, page } = await openPage(device))
    await page.locator('#document .question .formula').first().dblclick()
    await page.waitForSelector('#formulaDialog[open]')
    await page.waitForTimeout(1200)
    await save(page, `${device}-3-formul`)
    await context.close()

    ;({ context, page } = await openPage(device))
    await page.locator('#document .question p').first().click()
    await openGroup(page, 'references')
    await save(page, `${device}-4-basvurular`)
    await context.close()
    console.log(`${device}: tamam`)
  }

  // Öne çıkan görsel (1024×500)
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 } })
  await page.setContent(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>
    body { margin: 0; width: 1024px; height: 500px; display: flex; align-items: center; gap: 48px; padding: 0 64px; box-sizing: border-box;
      background: linear-gradient(135deg, #ffffff 0%, #e8efff 100%); font-family: "Noto Sans", Arial, sans-serif; color: #1f2937; }
    img { width: 220px; height: 220px; flex: none; }
    h1 { margin: 0; font-size: 84px; letter-spacing: -1px; }
    h1 span { color: #2563eb; }
    p { margin: 8px 0 0; font-size: 30px; color: #374151; }
    ul { display: flex; gap: 12px; margin: 28px 0 0; padding: 0; list-style: none; }
    li { padding: 8px 16px; border-radius: 999px; background: #ffffff; border: 2px solid #c7d7fe; font-size: 20px; font-weight: 600; color: #1d4ed8; }
  </style></head><body>
    <img src="${url}img/app-icon.svg" alt="">
    <div><h1>aw<span>DOC</span></h1><p>Öğretmen dostu kelime işlemci</p>
    <ul><li>Sınav kâğıdı</li><li>Formül</li><li>Word</li><li>LibreOffice</li></ul></div>
  </body></html>`)
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(out, 'one-cikan-1024x500.png') })
  copyFileSync(path.join(root, 'public/img/app-icon.png'), path.join(out, 'simge-512.png'))
  console.log('öne çıkan görsel ve simge: tamam')
} finally {
  await browser.close()
  await new Promise(resolve => server.httpServer.close(resolve))
  rmSync(work, { recursive: true, force: true })
}
