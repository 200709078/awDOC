import type { MathfieldElement, VirtualKeyboardInterface } from 'mathlive'

/** What awDOC uses of MathLive, once it has been loaded. */
export interface MathKit {
  /**
   * A formula field for the formula window, put in `host`: decimal comma, no English menu, no
   * sounds. Resolves once MathLive has set it up (before that it takes no settings).
   */
  createField(host: HTMLElement): Promise<MathfieldElement>
  /** MathLive's on-screen keyboard of maths keys. */
  readonly keyboard: VirtualKeyboardInterface & EventTarget
  /** HTML that draws the formula (MathLive's static markup, fonts from the app itself). */
  toMarkup(latex: string): string
  /** MathML of the formula: what Word and LibreOffice files will need (stage 5). */
  toMathMl(latex: string): string
  /** False when the LaTeX has errors. */
  isValid(latex: string): boolean
}

let loading: Promise<MathKit> | undefined

/**
 * MathLive is large, so it comes only when a formula is seen or written. Its fonts are bundled
 * with the app (no network: Electron and Android have none), and it plays no sounds.
 */
export function loadMath(): Promise<MathKit> {
  loading ??= (async () => {
    // static.css has the fonts too (fonts.css would declare them a second time).
    const [mathlive] = await Promise.all([import('mathlive'), import('mathlive/static.css')])
    const { MathfieldElement } = mathlive
    MathfieldElement.fontsDirectory = null
    MathfieldElement.soundsDirectory = null
    // In Turkish 3,5 is three and a half.
    MathfieldElement.decimalSeparator = ','
    return {
      createField: async host => {
        const field = new MathfieldElement()
        const mounted = new Promise(resolve => field.addEventListener('mount', resolve, { once: true }))
        host.replaceChildren(field)
        await mounted
        // Its menu is in English; the window has its own buttons.
        field.menuItems = []
        field.mathVirtualKeyboardPolicy = 'auto'
        return field
      },
      keyboard: window.mathVirtualKeyboard as VirtualKeyboardInterface & EventTarget,
      toMarkup: latex => mathlive.convertLatexToMarkup(latex, { defaultMode: 'inline-math' }),
      toMathMl: latex => mathlive.convertLatexToMathMl(latex),
      isValid: latex => mathlive.validateLatex(latex).length === 0,
    }
  })()
  return loading
}
