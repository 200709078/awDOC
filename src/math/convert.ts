/**
 * Formulas between awDOC (LaTeX), Word (OMML) and LibreOffice (MathML). Writing goes LaTeX → MathML
 * (MathLive) → OMML here; reading goes OMML or MathML → LaTeX here. The common structures of a
 * school formula are kept (fractions, powers, indices, roots, brackets, sums and integrals, accents,
 * functions, matrices); anything else keeps at least its characters.
 */

export const OMML_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math'
export const MATHML_NS = 'http://www.w3.org/1998/Math/MathML'

export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const local = (element: Element) => element.localName
const elements = (element: Element) => Array.from(element.children)

/* ---------- MathML → OMML ---------- */

const ACCENTS: Readonly<Record<string, string>> = {
  '¯': '̅', '‾': '̅', '^': '̂', 'ˆ': '̂', '~': '̃', '˜': '̃',
  '→': '⃗', '⃗': '⃗', '˙': '̇', '¨': '̈', '.': '̇',
}
const NARY = new Set(['∑', '∏', '∫', '∬', '∭', '∮', '⋃', '⋂'])

function run(text: string, plain = false): string {
  if (!text) return ''
  const style = plain ? '<m:rPr><m:sty m:val="p"/></m:rPr>' : ''
  return `<m:r>${style}<m:t xml:space="preserve">${escapeXml(text)}</m:t></m:r>`
}

function omml(element: Element): string {
  const kids = elements(element)
  const all = () => kids.map(omml).join('')
  const part = (index: number) => (kids[index] ? omml(kids[index]) : '')
  switch (local(element)) {
    case 'math': case 'mrow': case 'mstyle': case 'mpadded': case 'mphantom': case 'menclose':
      return all()
    case 'semantics':
      return part(0)
    case 'annotation': case 'annotation-xml': case 'mspace': case 'none': case 'mprescripts':
      return ''
    case 'mi': {
      const text = element.textContent ?? ''
      return run(text, text.length > 1 || element.getAttribute('mathvariant') === 'normal')
    }
    case 'mn': case 'mo': case 'mtext': case 'ms':
      return run(element.textContent ?? '', local(element) !== 'mo' || /^[A-Za-z]/.test(element.textContent ?? ''))
    case 'mfrac':
      return `<m:f><m:num>${part(0)}</m:num><m:den>${part(1)}</m:den></m:f>`
    case 'msup':
      return `<m:sSup><m:e>${part(0)}</m:e><m:sup>${part(1)}</m:sup></m:sSup>`
    case 'msub':
      return `<m:sSub><m:e>${part(0)}</m:e><m:sub>${part(1)}</m:sub></m:sSub>`
    case 'msubsup': {
      const base = kids[0]
      if (base && local(base) === 'mo' && NARY.has(base.textContent ?? '')) return nary(base.textContent!, part(1), part(2))
      return `<m:sSubSup><m:e>${part(0)}</m:e><m:sub>${part(1)}</m:sub><m:sup>${part(2)}</m:sup></m:sSubSup>`
    }
    case 'msqrt':
      return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${all()}</m:e></m:rad>`
    case 'mroot':
      return `<m:rad><m:deg>${part(1)}</m:deg><m:e>${part(0)}</m:e></m:rad>`
    case 'mover': {
      const mark = kids[1]?.textContent ?? ''
      if (ACCENTS[mark]) return `<m:acc><m:accPr><m:chr m:val="${ACCENTS[mark]}"/></m:accPr><m:e>${part(0)}</m:e></m:acc>`
      if (kids[0] && NARY.has(kids[0].textContent ?? '')) return nary(kids[0].textContent!, '', part(1))
      return `<m:limUpp><m:e>${part(0)}</m:e><m:lim>${part(1)}</m:lim></m:limUpp>`
    }
    case 'munder': {
      if (kids[0] && NARY.has(kids[0].textContent ?? '')) return nary(kids[0].textContent!, part(1), '')
      return `<m:limLow><m:e>${part(0)}</m:e><m:lim>${part(1)}</m:lim></m:limLow>`
    }
    case 'munderover': {
      if (kids[0] && NARY.has(kids[0].textContent ?? '')) return nary(kids[0].textContent!, part(1), part(2))
      return `<m:limUpp><m:e><m:limLow><m:e>${part(0)}</m:e><m:lim>${part(1)}</m:lim></m:limLow></m:e><m:lim>${part(2)}</m:lim></m:limUpp>`
    }
    case 'mfenced': {
      const open = element.getAttribute('open') ?? '('
      const close = element.getAttribute('close') ?? ')'
      return `<m:d><m:dPr><m:begChr m:val="${escapeXml(open)}"/><m:endChr m:val="${escapeXml(close)}"/></m:dPr>${kids.map(kid => `<m:e>${omml(kid)}</m:e>`).join('')}</m:d>`
    }
    case 'mtable':
      return `<m:m>${kids.map(row => `<m:mr>${elements(row).map(cell => `<m:e>${elements(cell).map(omml).join('')}</m:e>`).join('')}</m:mr>`).join('')}</m:m>`
    default:
      return kids.length ? all() : run(element.textContent ?? '')
  }
}

/** A sum, product or integral; its body follows it in the formula as written. */
function nary(symbol: string, lower: string, upper: string): string {
  const hide = (lower ? '' : '<m:subHide m:val="1"/>') + (upper ? '' : '<m:supHide m:val="1"/>')
  return `<m:nary><m:naryPr><m:chr m:val="${symbol}"/>${hide}</m:naryPr><m:sub>${lower}</m:sub><m:sup>${upper}</m:sup><m:e/></m:nary>`
}

/** A Word formula (`<m:oMath>`) from MathML; null when the MathML cannot be read. */
export function mathMlToOmml(mathml: string): string | null {
  const parsed = new DOMParser().parseFromString(mathml.includes('xmlns') ? mathml : mathml.replace('<math', `<math xmlns="${MATHML_NS}"`), 'application/xml')
  if (parsed.getElementsByTagName('parsererror').length) return null
  return `<m:oMath>${omml(parsed.documentElement)}</m:oMath>`
}

/* ---------- characters back to LaTeX ---------- */

const SYMBOLS: Readonly<Record<string, string>> = {
  '×': '\\times ', '·': '\\cdot ', '⋅': '\\cdot ', '÷': '\\div ', '±': '\\pm ', '∓': '\\mp ', '≤': '\\le ', '≥': '\\ge ',
  '≠': '\\ne ', '≈': '\\approx ', '≡': '\\equiv ', '∞': '\\infty ', '→': '\\to ', '⇒': '\\Rightarrow ', '⇔': '\\Leftrightarrow ',
  '∈': '\\in ', '∉': '\\notin ', '⊂': '\\subset ', '⊆': '\\subseteq ', '∪': '\\cup ', '∩': '\\cap ', '∅': '\\emptyset ',
  '∀': '\\forall ', '∃': '\\exists ', '∠': '\\angle ', '°': '^{\\circ}', '△': '\\triangle ', '⊥': '\\perp ', '∥': '\\parallel ',
  'α': '\\alpha ', 'β': '\\beta ', 'γ': '\\gamma ', 'δ': '\\delta ', 'ε': '\\varepsilon ', 'θ': '\\theta ', 'λ': '\\lambda ',
  'μ': '\\mu ', 'π': '\\pi ', 'ρ': '\\rho ', 'σ': '\\sigma ', 'τ': '\\tau ', 'φ': '\\varphi ', 'ω': '\\omega ', 'Δ': '\\Delta ',
  'Σ': '\\Sigma ', 'Ω': '\\Omega ', 'Π': '\\Pi ', 'Θ': '\\Theta ', '∂': '\\partial ', '∇': '\\nabla ', '…': '\\ldots ',
  '−': '-', '′': "'", '{': '\\{', '}': '\\}', '%': '\\%', '#': '\\#', '&': '\\&', '_': '\\_', '$': '\\$',
}
const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'lim', 'exp', 'max', 'min', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'det', 'deg', 'gcd'])
const NARY_LATEX: Readonly<Record<string, string>> = { '∑': '\\sum', '∏': '\\prod', '∫': '\\int', '∬': '\\iint', '∭': '\\iiint', '∮': '\\oint', '⋃': '\\bigcup', '⋂': '\\bigcap' }
const ACCENT_LATEX: Readonly<Record<string, string>> = { '̅': '\\overline', '¯': '\\overline', '̂': '\\hat', '^': '\\hat', '̃': '\\tilde', '~': '\\tilde', '⃗': '\\vec', '→': '\\vec', '̇': '\\dot', '̈': '\\ddot' }
const BRACKETS: Readonly<Record<string, string>> = { '(': '(', ')': ')', '[': '[', ']': ']', '{': '\\{', '}': '\\}', '|': '|', '‖': '\\|', '⟨': '\\langle', '⟩': '\\rangle', '': '.' }

function latexText(text: string): string {
  const word = text.trim()
  if (FUNCTIONS.has(word)) return `\\${word} `
  return Array.from(text).map(character => SYMBOLS[character] ?? character).join('')
}

const group = (latex: string) => (latex.length === 1 ? latex : `{${latex}}`)

/* ---------- OMML → LaTeX ---------- */

function child(element: Element, name: string): Element | undefined {
  return elements(element).find(kid => local(kid) === name)
}
function property(element: Element, container: string, name: string): string | null {
  const props = child(element, container)
  const prop = props && child(props, name)
  return prop ? prop.getAttribute('m:val') ?? prop.getAttributeNS(OMML_NS, 'val') : null
}

function fromOmml(element: Element): string {
  const inside = (name: string) => {
    const kid = child(element, name)
    return kid ? elements(kid).map(fromOmml).join('') : ''
  }
  switch (local(element)) {
    case 'r': return latexText(elements(element).filter(kid => local(kid) === 't').map(kid => kid.textContent ?? '').join(''))
    case 'f': return `\\frac{${inside('num')}}{${inside('den')}}`
    case 'sSup': return `${group(inside('e'))}^${group(inside('sup'))}`
    case 'sSub': return `${group(inside('e'))}_${group(inside('sub'))}`
    case 'sSubSup': return `${group(inside('e'))}_${group(inside('sub'))}^${group(inside('sup'))}`
    case 'rad': {
      const degree = inside('deg')
      return degree ? `\\sqrt[${degree}]{${inside('e')}}` : `\\sqrt{${inside('e')}}`
    }
    case 'd': {
      const open = property(element, 'dPr', 'begChr') ?? '('
      const close = property(element, 'dPr', 'endChr') ?? ')'
      const parts = elements(element).filter(kid => local(kid) === 'e').map(kid => elements(kid).map(fromOmml).join(''))
      return `\\left${BRACKETS[open] ?? open}${parts.join(',')}\\right${BRACKETS[close] ?? close}`
    }
    case 'nary': {
      const symbol = NARY_LATEX[property(element, 'naryPr', 'chr') ?? '∫'] ?? '\\int'
      const lower = inside('sub')
      const upper = inside('sup')
      return `${symbol}${lower ? `_${group(lower)}` : ''}${upper ? `^${group(upper)}` : ''} ${inside('e')}`
    }
    case 'acc': return `${ACCENT_LATEX[property(element, 'accPr', 'chr') ?? '̂'] ?? '\\hat'}{${inside('e')}}`
    case 'bar': return `${property(element, 'barPr', 'pos') === 'bot' ? '\\underline' : '\\overline'}{${inside('e')}}`
    case 'limLow': {
      const base = inside('e')
      return FUNCTIONS.has(base.replace(/[\\ ]/g, '')) ? `${base}_{${inside('lim')}}` : `\\underset{${inside('lim')}}{${base}}`
    }
    case 'limUpp': return `\\overset{${inside('lim')}}{${inside('e')}}`
    case 'func': return `${inside('fName')}${inside('e')}`
    case 'm': return `\\begin{matrix}${elements(element).filter(kid => local(kid) === 'mr').map(row => elements(row).filter(kid => local(kid) === 'e').map(cell => elements(cell).map(fromOmml).join('')).join('&')).join('\\\\')}\\end{matrix}`
    case 'rPr': case 'ctrlPr': case 'fPr': case 'radPr': case 'dPr': case 'naryPr': case 'accPr': case 'sSupPr': case 'sSubPr': case 'sSubSupPr': case 'barPr': case 'limLowPr': case 'limUppPr': case 'funcPr': case 'mPr': case 'oMathParaPr':
      return ''
    default: return elements(element).map(fromOmml).join('')
  }
}

/** LaTeX of a Word formula (`<m:oMath>`). */
export function ommlToLatex(element: Element): string {
  return fromOmml(element).replace(/\s+/g, ' ').trim()
}

/* ---------- MathML → LaTeX ---------- */

function fromMathMl(element: Element): string {
  const kids = elements(element)
  const part = (index: number) => (kids[index] ? fromMathMl(kids[index]) : '')
  switch (local(element)) {
    case 'semantics': {
      const tex = kids.find(kid => local(kid) === 'annotation' && /tex/i.test(kid.getAttribute('encoding') ?? ''))
      return tex?.textContent ?? part(0)
    }
    case 'annotation': case 'annotation-xml': case 'mspace': return ''
    case 'mi': case 'mn': case 'mo': case 'mtext': case 'ms': return latexText(element.textContent ?? '')
    case 'mfrac': return `\\frac{${part(0)}}{${part(1)}}`
    case 'msup': return `${group(part(0))}^${group(part(1))}`
    case 'msub': return `${group(part(0))}_${group(part(1))}`
    case 'msubsup': return `${group(part(0))}_${group(part(1))}^${group(part(2))}`
    case 'msqrt': return `\\sqrt{${kids.map(fromMathMl).join('')}}`
    case 'mroot': return `\\sqrt[${part(1)}]{${part(0)}}`
    case 'mover': {
      const mark = kids[1]?.textContent ?? ''
      return ACCENT_LATEX[mark] ? `${ACCENT_LATEX[mark]}{${part(0)}}` : `\\overset{${part(1)}}{${part(0)}}`
    }
    case 'munder': return `\\underset{${part(1)}}{${part(0)}}`
    case 'munderover': return `${group(part(0))}_${group(part(1))}^${group(part(2))}`
    case 'mfenced': return `\\left${BRACKETS[element.getAttribute('open') ?? '('] ?? '('}${kids.map(fromMathMl).join(',')}\\right${BRACKETS[element.getAttribute('close') ?? ')'] ?? ')'}`
    case 'mtable': return `\\begin{matrix}${kids.map(row => elements(row).map(cell => elements(cell).map(fromMathMl).join('')).join('&')).join('\\\\')}\\end{matrix}`
    default: return kids.map(fromMathMl).join('')
  }
}

/** LaTeX of a MathML `<math>` element (an annotation in TeX wins when the file has one). */
export function mathMlToLatex(element: Element): string {
  return fromMathMl(element).replace(/\s+/g, ' ').trim()
}
