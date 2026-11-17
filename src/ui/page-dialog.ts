import type { Editor } from '@tiptap/core'
import {
  currentPageSetup,
  MARGIN_PRESETS,
  MAX_MARGIN,
  MIN_MARGIN,
  normalizePageSetup,
  type Margins,
  type PageNumberFormat,
  type PageNumberPlace,
  type PageSetup,
} from '../editor/page-setup'

const SIDES = ['top', 'bottom', 'left', 'right'] as const
const INPUT_IDS: Record<(typeof SIDES)[number], string> = {
  top: '#pageMarginTop',
  bottom: '#pageMarginBottom',
  left: '#pageMarginLeft',
  right: '#pageMarginRight',
}
const CUSTOM = 'custom'

/** Centimetres as written in Turkish: "2,5". */
function centimetres(millimetres: number): string {
  return (millimetres / 10).toLocaleString('tr-TR', { maximumFractionDigits: 2 })
}

/** "2,5", "2.5" or "2" cm in millimetres; NaN when it is not a number. */
function parseCentimetres(text: string): number {
  const clean = text.trim().replace(',', '.')
  return /^\d+(\.\d+)?$/.test(clean) ? Number(clean) * 10 : Number.NaN
}

function sameMargins(a: Margins, b: Margins): boolean {
  return SIDES.every(side => Math.abs(a[side] - b[side]) < 0.1)
}

/**
 * Sayfa Düzeni: orientation, margins (a preset or one's own, in cm), header, footer and page
 * number. Applied as one change, so a single Ctrl+Z takes it back.
 */
export function showPageDialog(editor: Editor): void {
  const dialog = document.querySelector<HTMLDialogElement>('#pageDialog')!
  const form = dialog.querySelector('form')!
  const preset = document.querySelector<HTMLSelectElement>('#pageMarginPreset')!
  const header = document.querySelector<HTMLInputElement>('#pageHeader')!
  const footer = document.querySelector<HTMLInputElement>('#pageFooter')!
  const numbers = document.querySelector<HTMLSelectElement>('#pageNumbers')!
  const format = document.querySelector<HTMLSelectElement>('#pageNumberFormat')!
  const error = document.querySelector<HTMLElement>('#pageError')!
  const inputs = Object.fromEntries(SIDES.map(side => [side, document.querySelector<HTMLInputElement>(INPUT_IDS[side])!])) as Record<(typeof SIDES)[number], HTMLInputElement>
  const setup = currentPageSetup(editor)

  preset.replaceChildren(...[...MARGIN_PRESETS, { id: CUSTOM, label: 'Özel' }].map(({ id, label }) => new Option(label, id)))
  const showMargins = (margins: Margins) => {
    for (const side of SIDES) inputs[side].value = centimetres(margins[side])
  }
  showMargins(setup.margins)
  preset.value = MARGIN_PRESETS.find(choice => sameMargins(choice.margins, setup.margins))?.id ?? CUSTOM
  preset.onchange = () => {
    const choice = MARGIN_PRESETS.find(item => item.id === preset.value)
    if (choice) showMargins(choice.margins)
  }
  for (const side of SIDES) {
    inputs[side].oninput = () => {
      const typed = Object.fromEntries(SIDES.map(each => [each, parseCentimetres(inputs[each].value)])) as unknown as Margins
      preset.value = MARGIN_PRESETS.find(choice => sameMargins(choice.margins, typed))?.id ?? CUSTOM
    }
  }
  for (const radio of form.querySelectorAll<HTMLInputElement>('input[name="pageOrientation"]')) radio.checked = radio.value === setup.orientation
  header.value = setup.header
  footer.value = setup.footer
  numbers.value = setup.pageNumbers
  format.value = setup.numberFormat
  const syncFormat = () => { format.disabled = numbers.value === 'none' }
  numbers.onchange = syncFormat
  syncFormat()
  error.hidden = true

  const read = (): PageSetup | string => {
    const margins = Object.fromEntries(SIDES.map(side => [side, parseCentimetres(inputs[side].value)])) as unknown as Margins
    const wrong = SIDES.find(side => !(margins[side] >= MIN_MARGIN && margins[side] <= MAX_MARGIN))
    if (wrong) return `Kenar boşlukları ${centimetres(MIN_MARGIN)} ile ${centimetres(MAX_MARGIN)} cm arasında olmalı.`
    const orientation = form.querySelector<HTMLInputElement>('input[name="pageOrientation"]:checked')?.value ?? setup.orientation
    const wanted = {
      orientation,
      margins,
      header: header.value,
      footer: footer.value,
      pageNumbers: numbers.value as PageNumberPlace,
      numberFormat: format.value as PageNumberFormat,
    }
    const result = normalizePageSetup(wanted)
    // normalizePageSetup falls back to the default margins when no room is left for the text.
    if (!sameMargins(result.margins, margins)) return 'Bu kenar boşluklarıyla yazıya yer kalmıyor; daha küçük değerler girin.'
    return result
  }

  form.onsubmit = event => {
    if ((event.submitter as HTMLButtonElement | null)?.value !== 'apply') return
    const result = read()
    if (typeof result === 'string') {
      event.preventDefault()
      error.textContent = result
      error.hidden = false
    }
  }
  dialog.onclose = () => {
    const chain = editor.chain().focus()
    const result = dialog.returnValue === 'apply' ? read() : null
    if (result && typeof result !== 'string' && JSON.stringify(result) !== JSON.stringify(setup)) chain.setPageSetup(result).run()
    else chain.run()
  }
  dialog.returnValue = ''
  dialog.showModal()
}
