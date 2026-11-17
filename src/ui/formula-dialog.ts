import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import type { MathfieldElement } from 'mathlive'
import { loadMath, type MathKit } from '../math/load'

/**
 * Common pieces, as Word's equation ribbon has them. `#@` takes what is selected (or the thing
 * before the cursor), `#0` the selection or an empty box, `#?` an empty box.
 */
const PALETTE: readonly { readonly insert: string; readonly label: string; readonly name: string }[] = [
  { insert: '\\frac{#@}{#?}', label: '\\frac{a}{b}', name: 'Kesir' },
  { insert: '#@^{#?}', label: 'x^{n}', name: 'Üs' },
  { insert: '#@_{#?}', label: 'x_{n}', name: 'Alt indis' },
  { insert: '\\sqrt{#0}', label: '\\sqrt{x}', name: 'Karekök' },
  { insert: '\\sqrt[#?]{#0}', label: '\\sqrt[n]{x}', name: 'Kök' },
  { insert: '\\left|#0\\right|', label: '|x|', name: 'Mutlak değer' },
  { insert: '\\left(#0\\right)', label: '(x)', name: 'Parantez' },
  { insert: '\\overline{#0}', label: '\\overline{AB}', name: 'Üst çizgi' },
  { insert: '\\vec{#0}', label: '\\vec{u}', name: 'Vektör' },
  { insert: '\\pm', label: '\\pm', name: 'Artı eksi' },
  { insert: '\\times', label: '\\times', name: 'Çarpı' },
  { insert: '\\div', label: '\\div', name: 'Bölü' },
  { insert: '\\cdot', label: '\\cdot', name: 'Nokta çarpım' },
  { insert: '\\le', label: '\\le', name: 'Küçük eşit' },
  { insert: '\\ge', label: '\\ge', name: 'Büyük eşit' },
  { insert: '\\ne', label: '\\ne', name: 'Eşit değil' },
  { insert: '\\approx', label: '\\approx', name: 'Yaklaşık' },
  { insert: '\\pi', label: '\\pi', name: 'Pi' },
  { insert: '\\infty', label: '\\infty', name: 'Sonsuz' },
  { insert: '^{\\circ}', label: '30^{\\circ}', name: 'Derece' },
  { insert: '\\widehat{#0}', label: '\\widehat{ABC}', name: 'Açı (şapka)' },
  { insert: '\\angle', label: '\\angle', name: 'Açı' },
  { insert: '\\triangle', label: '\\triangle', name: 'Üçgen' },
  { insert: '\\parallel', label: '\\parallel', name: 'Paralel' },
  { insert: '\\perp', label: '\\perp', name: 'Dik' },
  { insert: '\\in', label: '\\in', name: 'Elemanıdır' },
  { insert: '\\notin', label: '\\notin', name: 'Elemanı değildir' },
  { insert: '\\subset', label: '\\subset', name: 'Alt küme' },
  { insert: '\\cup', label: '\\cup', name: 'Birleşim' },
  { insert: '\\cap', label: '\\cap', name: 'Kesişim' },
  { insert: '\\emptyset', label: '\\emptyset', name: 'Boş küme' },
  { insert: '\\mathbb{R}', label: '\\mathbb{R}', name: 'Gerçek sayılar' },
  { insert: '\\Rightarrow', label: '\\Rightarrow', name: 'İse' },
  { insert: '\\Leftrightarrow', label: '\\Leftrightarrow', name: 'Ancak ve ancak' },
  { insert: '\\sum_{#?}^{#?}#?', label: '\\sum', name: 'Toplam' },
  { insert: '\\int_{#?}^{#?}#?\\,dx', label: '\\int', name: 'İntegral' },
  { insert: '\\lim_{#?\\to#?}#?', label: '\\lim', name: 'Limit' },
  { insert: '\\log_{#?}#?', label: '\\log_{a}', name: 'Logaritma' },
  { insert: '\\sin#?', label: '\\sin', name: 'Sinüs' },
  { insert: '\\cos#?', label: '\\cos', name: 'Kosinüs' },
  { insert: '\\alpha', label: '\\alpha', name: 'Alfa' },
  { insert: '\\theta', label: '\\theta', name: 'Teta' },
  { insert: '\\Delta', label: '\\Delta', name: 'Delta' },
  { insert: '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}', label: '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', name: 'Matris' },
]

let field: Promise<MathfieldElement> | undefined

function mountField(math: MathKit, host: HTMLElement, latexInput: HTMLInputElement, onEnter: () => void): Promise<MathfieldElement> {
  field ??= math.createField(host).then(created => setUpField(created, latexInput, onEnter))
  return field
}

function setUpField(created: MathfieldElement, latexInput: HTMLInputElement, onEnter: () => void): MathfieldElement {
  created.id = 'formulaInput'
  created.setAttribute('aria-label', 'Formül')
  created.addEventListener('input', () => { latexInput.value = created.value })
  // Enter finishes the formula, as in Word's equation box.
  created.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onEnter()
    }
  }, true)
  // The ↵ key of the maths keyboard.
  created.addEventListener('beforeinput', event => {
    if (event.inputType === 'insertLineBreak') {
      event.preventDefault()
      onEnter()
    }
  })
  latexInput.addEventListener('input', () => { created.value = latexInput.value })
  return created
}

function fillPalette(math: MathKit, palette: HTMLElement, input: MathfieldElement): void {
  if (palette.childElementCount) return
  palette.replaceChildren(...PALETTE.map(item => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'formula-dialog__piece'
    button.title = item.name
    button.setAttribute('aria-label', item.name)
    button.innerHTML = math.toMarkup(item.label)
    // The field keeps its cursor: the button does not take the focus.
    button.addEventListener('mousedown', event => event.preventDefault())
    button.addEventListener('click', () => {
      input.insert(item.insert, { insertionMode: 'replaceSelection', selectionMode: 'placeholder', focus: true })
      input.dispatchEvent(new Event('input'))
    })
    return button
  }))
}

/**
 * Formül: a new formula where the cursor is, or the one at `pos` changed. Emptied, an existing
 * formula is removed.
 */
export async function showFormulaDialog(editor: Editor, pos?: number): Promise<void> {
  const dialog = document.querySelector<HTMLDialogElement>('#formulaDialog')!
  if (dialog.open) return
  const latexInput = document.querySelector<HTMLInputElement>('#formulaLatex')!
  const save = document.querySelector<HTMLButtonElement>('#formulaSave')!
  const node = pos === undefined ? null : editor.state.doc.nodeAt(pos)
  const existing = node?.type.name === 'formula' ? String(node.attrs.latex) : null
  save.textContent = existing === null ? 'Ekle' : 'Tamam'
  dialog.returnValue = ''
  dialog.showModal()

  const math = await loadMath()
  if (!dialog.open) return
  const input = await mountField(math, document.querySelector<HTMLElement>('#formulaField')!, latexInput, () => {
    const open = document.querySelector<HTMLDialogElement>('#formulaDialog')!
    if (open.open) open.close('save')
  })
  if (!dialog.open) return
  fillPalette(math, document.querySelector<HTMLElement>('#formulaPalette')!, input)
  input.value = existing ?? ''
  latexInput.value = input.value
  // The maths keys show inside the window (the page behind it does not take touches), at the
  // screen's bottom; the window moves up and shrinks to stay above them.
  math.keyboard.container = dialog
  const fitAboveKeyboard = () => {
    const height = math.keyboard.visible ? math.keyboard.boundingRect.height : 0
    dialog.classList.toggle('has-keyboard', height > 0)
    dialog.style.maxHeight = height > 0 ? `calc(100vh - ${height + 16}px)` : ''
  }
  math.keyboard.addEventListener('geometrychange', fitAboveKeyboard)
  math.keyboard.addEventListener('virtual-keyboard-toggle', fitAboveKeyboard)
  document.querySelector<HTMLButtonElement>('#formulaKeyboard')!.onclick = () => {
    if (math.keyboard.visible) math.keyboard.hide()
    else {
      input.focus()
      math.keyboard.show()
    }
  }
  input.focus()
  input.executeCommand('moveToMathfieldEnd')

  dialog.onclose = () => {
    math.keyboard.hide()
    math.keyboard.removeEventListener('geometrychange', fitAboveKeyboard)
    math.keyboard.removeEventListener('virtual-keyboard-toggle', fitAboveKeyboard)
    fitAboveKeyboard()
    math.keyboard.container = document.body
    const latex = input.value.trim()
    const chain = editor.chain().focus()
    if (dialog.returnValue !== 'save' || (existing === null && !latex)) {
      chain.run()
      return
    }
    if (existing === null) {
      chain.insertFormula(latex).run()
      return
    }
    chain.command(({ tr }) => {
      const current = tr.doc.nodeAt(pos!)
      if (current?.type.name !== 'formula') return false
      if (!latex) tr.delete(pos!, pos! + current.nodeSize)
      else {
        tr.setNodeMarkup(pos!, undefined, { ...current.attrs, latex })
        tr.setSelection(NodeSelection.create(tr.doc, pos!))
      }
      return true
    }).run()
  }
}
