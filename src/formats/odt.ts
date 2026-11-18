import type { JSONContent } from '@tiptap/core'
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { DEFAULT_PAGE_SETUP, normalizePageSetup, pageSize, type PageNumberFormat, type PageNumberPlace, type PageSetup } from '../editor/page-setup'
import { escapeXml, MATHML_NS, mathMlToLatex } from '../math/convert'
import { FormatError, type DocumentFormat } from './format'
import {
  BORDERLESS, bytesToDataUrl, changeOf, commentIdsOf, dataUrlBytes, lastCommentPieces, storedComments, type StoredComment, extensionOfMime, fontCss, fontName, formulasIn, hasTeacherBlocks, hexColor,
  imageMime, lineHeightOf, officeBlocks, pointsOf, shownSize, tidy, type Marks,
} from './office'

/**
 * LibreOffice / OpenDocument text (`.odt`), written and read by hand like `docx.ts`: the same
 * paragraphs, styles, lists, tables, pictures, links, page breaks and page; formulas are
 * LibreOffice formula objects (MathML, with the LaTeX kept beside it for awDOC).
 */

const NS = {
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
  xlink: 'http://www.w3.org/1999/xlink',
  svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
  meta: 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0',
  dc: 'http://purl.org/dc/elements/1.1/',
}
const DECLARE = Object.entries(NS).map(([prefix, uri]) => `xmlns:${prefix}="${uri}"`).join(' ')
const XML = '<?xml version="1.0" encoding="UTF-8"?>\n'
const MIME = 'application/vnd.oasis.opendocument.text'
const HEADING_SIZES: Readonly<Record<number, number>> = { 1: 20, 2: 16, 3: 13 }
const INDENT_CM = 1.27
const PX_PER_CM = 96 / 2.54
/** A 10 pt header or footer line, and the space between it and the text, in millimetres. */
const HEADER_LINE_MM = 4.2
const HEADER_SPACING_MM = 2.5

const cm = (value: number) => `${Math.round(value * 1000) / 1000}cm`

/** ODF folds runs of spaces: every space after the first is written as `<text:s/>`. */
function textXml(value: string): string {
  return value.split('\t').map(piece => escapeXml(piece)
    .replace(/^ /, '<text:s/>')
    .replace(/ {2,}/g, spaces => ` <text:s text:c="${spaces.length - 1}"/>`)).join('<text:tab/>')
}

/* ================= writing ================= */

class Writer {
  readonly styles: string[] = []
  private readonly styleNames = new Map<string, string>()
  readonly files: Zippable = {}
  readonly manifest: string[] = []
  readonly fonts = new Set<string>(['Calibri'])
  private pictures = 0
  private objects = 0
  private tables = 0
  /** The next paragraph starts a new page (a page break came before it). */
  private breakBefore = false
  /** Inside a table cell: paragraphs have no space below, as in Word's table style. */
  private inTable = 0

  constructor(private readonly maths: ReadonlyMap<string, string>, private readonly textWidthCm: number) {}

  /** An automatic style for these properties, made once. */
  private style(family: string, prefix: string, body: string, parent = ''): string {
    const key = `${family}|${parent}|${body}`
    let name = this.styleNames.get(key)
    if (!name) {
      name = `${prefix}${this.styleNames.size + 1}`
      this.styleNames.set(key, name)
      this.styles.push(`<style:style style:name="${name}" style:family="${family}"${parent ? ` style:parent-style-name="${parent}"` : ''}>${body}</style:style>`)
    }
    return name
  }

  private textStyle(marks: Marks = []): string | null {
    const has = (type: string) => marks.find(mark => mark.type === type)
    const style = has('textStyle')?.attrs ?? {}
    let props = ''
    if (has('bold')) props += ' fo:font-weight="bold" style:font-weight-complex="bold"'
    if (has('italic')) props += ' fo:font-style="italic" style:font-style-complex="italic"'
    if (has('underline') || has('link')) props += ' style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"'
    if (has('strike')) props += ' style:text-line-through-style="solid"'
    const color = hexColor(style.color) ?? (has('link') ? '#0563c1' : null)
    if (color) props += ` fo:color="${color}"`
    const size = pointsOf(style.fontSize)
    if (size) props += ` fo:font-size="${size}pt"`
    const font = fontName(style.fontFamily) ?? (has('code') ? 'Courier New' : null)
    if (font) {
      this.fonts.add(font)
      props += ` style:font-name="${escapeXml(font)}"`
    }
    const highlight = has('highlight')
    if (highlight) props += ` fo:background-color="${hexColor(highlight.attrs?.color) ?? '#ffff00'}"`
    return props ? this.style('text', 'T', `<style:text-properties${props}/>`) : null
  }

  private picture(attrs: Record<string, unknown>): string {
    const data = dataUrlBytes(attrs.src)
    if (!data) return ''
    const number = ++this.pictures
    const path = `Pictures/resim${number}.${extensionOfMime(data.mime)}`
    this.files[path] = [data.bytes, { level: 0 }]
    this.manifest.push(`<manifest:file-entry manifest:full-path="${path}" manifest:media-type="${data.mime}"/>`)
    const { width, height } = shownSize(attrs, data.bytes)
    const wrap = attrs.wrap
    const floating = wrap === 'left' || wrap === 'right'
    const graphic = this.style('graphic', 'fr', floating
      ? `<style:graphic-properties style:wrap="parallel" style:horizontal-pos="${wrap}" style:horizontal-rel="paragraph" style:vertical-pos="top" style:vertical-rel="paragraph" fo:margin-left="0.2cm" fo:margin-right="0.2cm"/>`
      : '<style:graphic-properties style:vertical-pos="bottom" style:vertical-rel="baseline"/>')
    return `<draw:frame draw:style-name="${graphic}" draw:name="Resim ${number}" text:anchor-type="${floating ? 'char' : 'as-char'}" svg:width="${cm(width / PX_PER_CM)}" svg:height="${cm(height / PX_PER_CM)}" draw:z-index="${number}"><draw:image xlink:href="${path}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>${attrs.alt ? `<svg:desc>${escapeXml(String(attrs.alt))}</svg:desc>` : ''}</draw:frame>`
  }

  private formula(latex: string): string {
    const mathml = this.maths.get(latex)
    if (!mathml) return `<text:span text:style-name="${this.textStyle([{ type: 'italic' }])}">${textXml(latex)}</text:span>`
    const number = ++this.objects
    const folder = `Object ${number}`
    // The LaTeX rides along as an annotation, so awDOC gets exactly the formula it wrote.
    const math = mathml.replace(/^<math[^>]*>/, `<math xmlns="${MATHML_NS}"><semantics><mrow>`).replace(/<\/math>\s*$/, `</mrow><annotation encoding="application/x-tex">${escapeXml(latex)}</annotation></semantics></math>`)
    this.files[`${folder}/content.xml`] = strToU8(`${XML}${math}`)
    this.manifest.push(`<manifest:file-entry manifest:full-path="${folder}/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.formula"/>`, `<manifest:file-entry manifest:full-path="${folder}/content.xml" manifest:media-type="text/xml"/>`)
    const width = Math.max(0.6, Math.min(this.textWidthCm, latex.replace(/\\[a-z]+|[{}^_ ]/gi, '').length * 0.24 + 0.3))
    const graphic = this.style('graphic', 'fr', '<style:graphic-properties style:vertical-pos="middle" style:vertical-rel="text"/>')
    return `<draw:frame draw:style-name="${graphic}" draw:name="Formül ${number}" text:anchor-type="as-char" svg:width="${cm(width)}" svg:height="${cm(/\\frac|\\sqrt|\^|_/.test(latex) ? 1.0 : 0.55)}"><draw:object xlink:href="./${folder}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`
  }

  private textNode(value: string, marks?: Marks): string {
    const style = this.textStyle(marks)
    let xml = textXml(value)
    if (style) xml = `<text:span text:style-name="${style}">${xml}</text:span>`
    const link = marks?.find(mark => mark.type === 'link')?.attrs?.href
    return link ? `<text:a xlink:type="simple" xlink:href="${escapeXml(String(link))}">${xml}</text:a>` : xml
  }

  private leaf(node: JSONContent): string {
    switch (node.type) {
      case 'text': return this.textNode(node.text ?? '', node.marks)
      case 'hardBreak': return '<text:line-break/>'
      case 'image': return this.picture(node.attrs ?? {})
      case 'formula': return this.formula(String(node.attrs?.latex ?? ''))
      // LibreOffice's fields need a database; the field is written as «Ad» and read back as a field.
      case 'mergeField': return this.textNode(`«${String(node.attrs?.name ?? '')}»`, node.marks)
      case 'footnote': {
        const number = ++this.notes
        return `<text:note text:id="ftn${number}" text:note-class="footnote"><text:note-citation>${number}</text:note-citation><text:note-body><text:p text:style-name="Footnote">${textXml(String(node.attrs?.text ?? ''))}</text:p></text:note-body></text:note>`
      }
      default: return ''
    }
  }

  /* ---- comments and tracked changes ---- */

  private lastPieces = new Map<string, number>()
  private commentEntries = new Map<string, StoredComment>()
  private readonly startedComments = new Set<string>()
  private pieceIndex = 0
  private notes = 0
  /** text:changed-region elements, written at the start of the text. */
  readonly regions: string[] = []

  prepare(blocks: JSONContent[], comments: readonly StoredComment[]): void {
    this.lastPieces = lastCommentPieces(blocks)
    this.commentEntries = new Map(comments.map(comment => [comment.id, comment]))
  }

  private changeInfo(change: { author: string; date: string }): string {
    return `<office:change-info><dc:creator>${escapeXml(change.author || 'Yazar')}</dc:creator><dc:date>${escapeXml((change.date || new Date().toISOString()).replace(/Z$/, ''))}</dc:date></office:change-info>`
  }

  /** One inline piece with its comment's start and end around it and its tracked change. */
  private wrapPiece(node: JSONContent, xml: string): string {
    const index = this.pieceIndex++
    let before = ''
    let after = ''
    for (const id of commentIdsOf(node.marks)) {
      const comment = this.commentEntries.get(id)
      if (!comment) continue
      if (!this.startedComments.has(id)) {
        this.startedComments.add(id)
        const paragraphs = comment.text.split('\n').map(line => `<text:p>${textXml(line)}</text:p>`).join('')
        before += `<office:annotation office:name="${escapeXml(id)}"><dc:creator>${escapeXml(comment.author || 'Yazar')}</dc:creator><dc:date>${escapeXml(comment.date.replace(/Z$/, ''))}</dc:date>${paragraphs}</office:annotation>`
      }
      if (this.lastPieces.get(id) === index) after += `<office:annotation-end office:name="${escapeXml(id)}"/>`
    }
    const change = changeOf(node.marks)
    if (change && xml) {
      const id = `ct${this.regions.length + 1}`
      if (change.kind === 'insertion') {
        this.regions.push(`<text:changed-region xml:id="${id}" text:id="${id}"><text:insertion>${this.changeInfo(change)}</text:insertion></text:changed-region>`)
        xml = `<text:change-start text:change-id="${id}"/>${xml}<text:change-end text:change-id="${id}"/>`
      } else {
        // A deletion keeps what was deleted in its region; the text only marks the place.
        this.regions.push(`<text:changed-region xml:id="${id}" text:id="${id}"><text:deletion>${this.changeInfo(change)}<text:p>${xml}</text:p></text:deletion></text:changed-region>`)
        xml = `<text:change text:change-id="${id}"/>`
      }
    }
    return before + xml + after
  }

  private inline(nodes: JSONContent[] = []): string {
    return nodes.map(node => (['text', 'hardBreak', 'image', 'formula', 'mergeField', 'footnote'].includes(node.type ?? '') ? this.wrapPiece(node, this.leaf(node)) : this.inline(node.content))).join('')
  }

  private paragraph(node: JSONContent, extraIndent = 0, inList = false): string {
    const attrs = node.attrs ?? {}
    const heading = node.type === 'heading' ? Math.min(3, Math.max(1, Number(attrs.level) || 1)) : 0
    let props = ''
    const centred = node.content?.length === 1 && node.content[0].type === 'image' && node.content[0].attrs?.wrap === 'center'
    const align = centred ? 'center' : attrs.textAlign
    if (align && align !== 'left') props += ` fo:text-align="${align === 'right' ? 'end' : align}"`
    const line = Number.parseFloat(String(attrs.lineHeight ?? ''))
    if (line > 0) props += ` fo:line-height="${Math.round(line * 100)}%"`
    const indent = (Number(attrs.indent) || 0) * INDENT_CM + extraIndent
    if (indent > 0 && !inList) props += ` fo:margin-left="${cm(indent)}"`
    if (this.breakBefore) props += ' fo:break-before="page"'
    this.breakBefore = false
    const parent = heading ? `Heading_20_${heading}` : this.inTable ? 'Table_20_Contents' : 'Standard'
    const name = props ? this.style('paragraph', 'P', `<style:paragraph-properties${props}/>`, parent) : parent
    const body = this.inline(node.content)
    return heading
      ? `<text:h text:style-name="${name}" text:outline-level="${heading}">${body}</text:h>`
      : `<text:p text:style-name="${name}">${body}</text:p>`
  }

  private list(node: JSONContent, extraIndent: number): string {
    const ordered = node.type === 'orderedList'
    const start = Number(node.attrs?.start ?? 1) || 1
    const items = (node.content ?? []).map((item, index) => {
      const body = (item.content ?? []).map(child => (child.type === 'bulletList' || child.type === 'orderedList'
        ? this.list(child, extraIndent)
        : child.type === 'paragraph' || child.type === 'heading' ? this.paragraph(child, 0, true) : this.block(child, extraIndent))).join('')
      return `<text:list-item${ordered && index === 0 && start !== 1 ? ` text:start-value="${start}"` : ''}>${body || '<text:p/>'}</text:list-item>`
    }).join('')
    return `<text:list text:style-name="${ordered ? 'L2' : 'L1'}">${items}</text:list>`
  }

  private table(node: JSONContent): string {
    const rows = node.content ?? []
    const borderless = Boolean(node.attrs?.[BORDERLESS])
    const widths: (number | null)[] = []
    for (const cell of rows[0]?.content ?? []) {
      const span = Number(cell.attrs?.colspan) || 1
      const set = cell.attrs?.colwidth as (number | null)[] | null | undefined
      for (let i = 0; i < span; i++) widths.push(set?.[i] ? set[i]! / PX_PER_CM : null)
    }
    const fixed = widths.reduce<number>((sum, width) => sum + (width ?? 0), 0)
    const open = widths.filter(width => width === null).length
    const grid = widths.map(width => width ?? Math.max(1, (this.textWidthCm - fixed) / Math.max(1, open)))
    const total = grid.reduce((sum, width) => sum + width, 0)
    const number = ++this.tables
    const tableStyle = this.style('table', 'Tablo', `<style:table-properties style:width="${cm(total)}" table:align="left"/>`)
    const cellStyle = this.style('table-cell', 'Hucre', `<style:table-cell-properties fo:padding="0.1cm" fo:border="${borderless ? 'none' : '0.5pt solid #000000'}"/>`)
    const columns = grid.map(width => `<table:table-column table:style-name="${this.style('table-column', 'Sutun', `<style:table-column-properties style:column-width="${cm(width)}"/>`)}"/>`).join('')
    // Spanned places are covered cells, as ODF wants every grid place written.
    const covered: number[] = grid.map(() => 0)
    const rowXml = (row: JSONContent) => {
      let xml = '<table:table-row>'
      const cells = [...(row.content ?? [])]
      let column = 0
      while (column < grid.length) {
        if (covered[column] > 0) {
          covered[column]--
          xml += '<table:covered-table-cell/>'
          column++
          continue
        }
        const cell = cells.shift()
        if (!cell) {
          xml += `<table:table-cell table:style-name="${cellStyle}" office:value-type="string"><text:p/></table:table-cell>`
          column++
          continue
        }
        const span = Math.min(grid.length - column, Number(cell.attrs?.colspan) || 1)
        const down = Number(cell.attrs?.rowspan) || 1
        for (let i = 0; i < span; i++) if (down > 1) covered[column + i] = down - 1
        this.inTable++
        const content = (cell.content ?? []).map(child => this.block(child)).join('') || '<text:p/>'
        this.inTable--
        xml += `<table:table-cell table:style-name="${cellStyle}" office:value-type="string"${span > 1 ? ` table:number-columns-spanned="${span}"` : ''}${down > 1 ? ` table:number-rows-spanned="${down}"` : ''}>${content}</table:table-cell>`
        for (let i = 1; i < span; i++) xml += '<table:covered-table-cell/>'
        if (down > 1) for (let i = 1; i < span; i++) covered[column + i] = down - 1
        column += span
      }
      return `${xml}</table:table-row>`
    }
    let headerCount = 0
    while (headerCount < rows.length - 1 && (rows[headerCount].content ?? []).some(cell => cell.type === 'tableHeader')) headerCount++
    const headerRows = rows.slice(0, headerCount)
    const header = headerRows.length ? `<table:table-header-rows>${headerRows.map(rowXml).join('')}</table:table-header-rows>` : ''
    const body = rows.slice(headerRows.length).map(rowXml).join('')
    return `<table:table table:name="Tablo${number}" table:style-name="${tableStyle}">${columns}${header}${body}</table:table>`
  }

  block(node: JSONContent, extraIndent = 0): string {
    switch (node.type) {
      case 'paragraph': case 'heading': return this.paragraph(node, extraIndent)
      case 'bulletList': case 'orderedList': return this.list(node, extraIndent)
      case 'table': return this.table(node)
      case 'pageBreak':
        this.breakBefore = true
        return ''
      case 'tableOfContents':
        return this.contents((node.attrs?.entries ?? []) as { level: number; text: string }[])
      case 'horizontalRule':
        return `<text:p text:style-name="${this.style('paragraph', 'P', '<style:paragraph-properties fo:border-bottom="0.5pt solid #000000" fo:padding="0.05cm"/>', 'Standard')}"/>`
      default: return (node.content ?? []).map(child => this.block(child, extraIndent)).join('')
    }
  }

  /** İçindekiler as LibreOffice's own index over the outline (Araçlar → Güncelle fills in the pages). */
  private contents(entries: { level: number; text: string }[]): string {
    const templates = [1, 2, 3].map(level => `<text:table-of-content-entry-template text:outline-level="${level}" text:style-name="Contents_20_${level}"><text:index-entry-link-start/><text:index-entry-chapter/><text:index-entry-text/><text:index-entry-tab-stop style:type="right" style:leader-char="."/><text:index-entry-page-number/><text:index-entry-link-end/></text:table-of-content-entry-template>`).join('')
    const lines = entries.map(entry => `<text:p text:style-name="Contents_20_${Math.min(3, entry.level)}">${textXml(entry.text)}</text:p>`).join('')
    return `<text:table-of-content text:name="İçindekiler1" text:protected="true"><text:table-of-content-source text:outline-level="3"><text:index-title-template text:style-name="Contents_20_Heading">İçindekiler</text:index-title-template>${templates}</text:table-of-content-source><text:index-body><text:index-title text:name="İçindekiler1_Head"><text:p text:style-name="Contents_20_Heading">İçindekiler</text:p></text:index-title>${lines}</text:index-body></text:table-of-content>`
  }

  /** A paragraph that only carries a page break left at the very end. */
  finish(): string {
    return this.breakBefore ? this.paragraph({ type: 'paragraph' }) : ''
  }
}

function listStyles(): string {
  const bullets = ['•', '◦', '▪']
  const level = (ordered: boolean, index: number) => {
    const position = `<style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${cm((index + 1) * INDENT_CM)}" fo:text-indent="-0.635cm" fo:margin-left="${cm((index + 1) * INDENT_CM)}"/></style:list-level-properties>`
    return ordered
      ? `<text:list-level-style-number text:level="${index + 1}" style:num-suffix="." style:num-format="1">${position}</text:list-level-style-number>`
      : `<text:list-level-style-bullet text:level="${index + 1}" text:bullet-char="${bullets[index % 3]}">${position}</text:list-level-style-bullet>`
  }
  return [false, true].map(ordered => `<text:list-style style:name="${ordered ? 'L2' : 'L1'}">${Array.from({ length: 10 }, (_, index) => level(ordered, index)).join('')}</text:list-style>`).join('')
}

function stylesXml(setup: PageSetup, fonts: string): string {
  const size = pageSize(setup)
  const { top, right, bottom, left } = setup.margins
  const mm = (value: number) => `${value}mm`
  const number = setup.pageNumbers === 'none' ? '' : setup.numberFormat === 'number-of-total'
    ? '<text:page-number text:select-page="current">1</text:page-number> / <text:page-count>1</text:page-count>'
    : `${setup.numberFormat === 'page-number' ? 'Sayfa ' : ''}<text:page-number text:select-page="current">1</text:page-number>`
  const line = (text: string, style: string) => (text ? `<text:p text:style-name="${style}">${textXml(text)}</text:p>` : '')
  const header = line(setup.header, 'Header') + (setup.pageNumbers === 'top-right' ? `<text:p text:style-name="HeaderRight">${number}</text:p>` : '')
  const footer = line(setup.footer, 'Footer') + (number && setup.pageNumbers !== 'top-right' ? `<text:p text:style-name="${setup.pageNumbers === 'bottom-right' ? 'FooterRight' : 'Footer'}">${number}</text:p>` : '')
  // Header and footer sit inside the margins, as the editor's page draws them: the page margin is
  // what is left above the header's lines and their spacing (ODF adds the header's height to it).
  const box = (lines: number) => lines * HEADER_LINE_MM + HEADER_SPACING_MM
  const headerLines = (header.match(/<text:p /g) ?? []).length
  const footerLines = (footer.match(/<text:p /g) ?? []).length
  const pageTop = headerLines ? Math.max(5, top - box(headerLines)) : top
  const pageBottom = footerLines ? Math.max(5, bottom - box(footerLines)) : bottom
  const headerStyle = headerLines ? `<style:header-style><style:header-footer-properties fo:min-height="0cm" fo:margin-bottom="${mm(HEADER_SPACING_MM)}"/></style:header-style>` : ''
  const footerStyle = footerLines ? `<style:footer-style><style:header-footer-properties fo:min-height="0cm" fo:margin-top="${mm(HEADER_SPACING_MM)}"/></style:footer-style>` : ''
  const headings = [1, 2, 3].map(level => `<style:style style:name="Heading_20_${level}" style:display-name="Heading ${level}" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Standard" style:default-outline-level="${level}" style:class="text"><style:paragraph-properties fo:margin-top="0.564cm" fo:margin-bottom="0.282cm" fo:line-height="125%" fo:keep-with-next="always"/><style:text-properties fo:font-size="${HEADING_SIZES[level]}pt" fo:font-weight="bold" style:font-weight-complex="bold"/></style:style>`).join('')
  return `${XML}<office:document-styles ${DECLARE} office:version="1.3"><office:font-face-decls>${fonts}</office:font-face-decls><office:styles>
<style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.282cm" fo:line-height="115%"/><style:text-properties style:font-name="Calibri" fo:font-size="12pt" fo:language="tr" fo:country="TR"/></style:default-style>
<style:style style:name="Standard" style:family="paragraph" style:class="text"/>
${headings}
<style:style style:name="Contents_20_Heading" style:display-name="Contents Heading" style:family="paragraph" style:parent-style-name="Standard" style:class="index"><style:paragraph-properties fo:margin-top="0.4cm" fo:margin-bottom="0.3cm"/><style:text-properties fo:font-size="16pt" fo:font-weight="bold"/></style:style>
${[1, 2, 3].map(level => `<style:style style:name="Contents_20_${level}" style:display-name="Contents ${level}" style:family="paragraph" style:parent-style-name="Standard" style:class="index"><style:paragraph-properties fo:margin-left="${(level - 1) * 0.5}cm" fo:margin-bottom="0.1cm"><style:tab-stops><style:tab-stop style:position="${17 - (level - 1) * 0.5}cm" style:type="right" style:leader-style="dotted" style:leader-text="."/></style:tab-stops></style:paragraph-properties></style:style>`).join('')}
<style:style style:name="Footnote" style:family="paragraph" style:parent-style-name="Standard" style:class="extra"><style:paragraph-properties fo:margin-left="0.6cm" fo:margin-bottom="0cm" fo:text-indent="-0.6cm" fo:line-height="100%"/><style:text-properties fo:font-size="10pt"/></style:style>
<style:style style:name="Table_20_Contents" style:display-name="Table Contents" style:family="paragraph" style:parent-style-name="Standard" style:class="extra"><style:paragraph-properties fo:margin-bottom="0cm" fo:line-height="100%"/></style:style>
<style:style style:name="Header" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="center" fo:margin-bottom="0cm"/><style:text-properties fo:font-size="10pt"/></style:style>
<style:style style:name="HeaderRight" style:family="paragraph" style:parent-style-name="Header"><style:paragraph-properties fo:text-align="end"/></style:style>
<style:style style:name="Footer" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="center" fo:margin-bottom="0cm"/><style:text-properties fo:font-size="10pt"/></style:style>
<style:style style:name="FooterRight" style:family="paragraph" style:parent-style-name="Footer"><style:paragraph-properties fo:text-align="end"/></style:style>
</office:styles><office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="${mm(size.width)}" fo:page-height="${mm(size.height)}" style:print-orientation="${setup.orientation}" fo:margin-top="${mm(Math.round(pageTop * 10) / 10)}" fo:margin-bottom="${mm(Math.round(pageBottom * 10) / 10)}" fo:margin-left="${mm(left)}" fo:margin-right="${mm(right)}"/>${headerStyle}${footerStyle}</style:page-layout></office:automatic-styles>
<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1">${header ? `<style:header>${header}</style:header>` : ''}${footer ? `<style:footer>${footer}</style:footer>` : ''}</style:master-page></office:master-styles></office:document-styles>`
}

async function mathsOf(document: JSONContent): Promise<Map<string, string>> {
  const maths = new Map<string, string>()
  const formulas = formulasIn(document)
  if (!formulas.length) return maths
  const { loadMath } = await import('../math/load')
  const kit = await loadMath()
  for (const latex of formulas) {
    const mathml = kit.toMathMl(latex)
    if (mathml) maths.set(latex, mathml.startsWith('<math') ? mathml : `<math>${mathml}</math>`)
  }
  return maths
}

async function writeOdt(document: JSONContent): Promise<Uint8Array> {
  const setup = normalizePageSetup(document.attrs?.page)
  const size = pageSize(setup)
  const writer = new Writer(await mathsOf(document), (size.width - setup.margins.left - setup.margins.right) / 10)
  const blocks = tidy(officeBlocks(document))
  writer.prepare(blocks, storedComments(document))
  const body = blocks.map(block => writer.block(block)).join('') + writer.finish()
  const tracked = writer.regions.length || document.attrs?.track
    ? `<text:tracked-changes text:track-changes="${document.attrs?.track ? 'true' : 'false'}">${writer.regions.join('')}</text:tracked-changes>`
    : ''
  const fonts = [...writer.fonts].map(font => `<style:font-face style:name="${escapeXml(font)}" svg:font-family="${escapeXml(/\s/.test(font) ? `'${font}'` : font)}"/>`).join('')
  const content = `${XML}<office:document-content ${DECLARE} office:version="1.3"><office:font-face-decls>${fonts}</office:font-face-decls><office:automatic-styles>${listStyles()}${writer.styles.join('')}</office:automatic-styles><office:body><office:text>${tracked}${body}</office:text></office:body></office:document-content>`
  const files: Zippable = {
    // The type first and not compressed, as ODF requires.
    mimetype: [strToU8(MIME), { level: 0 }],
    'content.xml': strToU8(content),
    'styles.xml': strToU8(stylesXml(setup, fonts)),
    'meta.xml': strToU8(`${XML}<office:document-meta ${DECLARE} office:version="1.3"><office:meta><meta:generator>awDOC</meta:generator></office:meta></office:document-meta>`),
    ...writer.files,
  }
  files['META-INF/manifest.xml'] = strToU8(`${XML}<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${MIME}"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>${writer.manifest.join('')}</manifest:manifest>`)
  return zipSync(files, { level: 6 })
}

/* ================= reading ================= */

const kids = (element: Element) => Array.from(element.children)
const get = (element: Element | undefined | null, ns: keyof typeof NS, name: string): string | null =>
  element ? element.getAttributeNS(NS[ns], name) ?? element.getAttribute(`${ns}:${name}`) : null

/** Millimetres of an ODF length ("2.5cm", "25mm", "1in", "72pt"). */
function millimetres(value: string | null): number | null {
  const match = value?.match(/^(-?[\d.]+)(cm|mm|in|pt|pc|px)?$/)
  if (!match) return null
  const number = Number(match[1])
  const unit = match[2] ?? 'cm'
  return number * ({ cm: 10, mm: 1, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96 } as Record<string, number>)[unit]
}

interface StyleInfo {
  parent: string | null
  text: Record<string, string>
  paragraph: Record<string, string>
  graphic: Record<string, string>
  column: Record<string, string>
  listStyle: string | null
}

function parseXml(text: string): Document {
  const parsed = new DOMParser().parseFromString(text, 'application/xml')
  if (parsed.getElementsByTagName('parsererror').length) throw new FormatError('LibreOffice belgesinin içi okunamadı.')
  return parsed
}

class Reader {
  /** Tracked changes by region id, comments open where the reading is, and the comments found. */
  private readonly regions = new Map<string, { kind: 'insertion' | 'deletion'; author: string; date: string; element: Element }>()
  private change: { type: 'insertion' | 'deletion'; author: string; date: string } | null = null
  private readonly commentNames = new Map<string, string>()
  private readonly openComments = new Set<string>()
  readonly comments: StoredComment[] = []
  tracking = false
  private readonly styles = new Map<string, StyleInfo>()
  /** List style name → which levels are numbered. */
  private readonly lists = new Map<string, boolean[]>()

  constructor(private readonly files: Record<string, Uint8Array>) {}

  text(path: string): string | null {
    const bytes = this.files[path]
    return bytes ? new TextDecoder('utf-8').decode(bytes) : null
  }

  collect(document: Document): void {
    for (const style of Array.from(document.getElementsByTagNameNS(NS.style, 'style'))) {
      const properties = (name: string) => {
        const element = kids(style).find(kid => kid.localName === name)
        const out: Record<string, string> = {}
        for (const attribute of Array.from(element?.attributes ?? [])) out[attribute.localName] = attribute.value
        return out
      }
      this.styles.set(get(style, 'style', 'name') ?? '', {
        parent: get(style, 'style', 'parent-style-name'),
        text: properties('text-properties'),
        paragraph: properties('paragraph-properties'),
        graphic: properties('graphic-properties'),
        column: properties('table-column-properties'),
        listStyle: get(style, 'style', 'list-style-name'),
      })
    }
    for (const list of Array.from(document.getElementsByTagNameNS(NS.text, 'list-style'))) {
      const levels: boolean[] = []
      for (const level of kids(list)) levels[(Number(get(level, 'text', 'level')) || 1) - 1] = level.localName === 'list-level-style-number' && (get(level, 'style', 'num-format') ?? '1') !== ''
      this.lists.set(get(list, 'style', 'name') ?? '', levels)
    }
  }

  /** The comment and change marks of what is being read now. */
  private reviewMarks(): Marks {
    const marks: Marks = [...this.openComments].map(id => ({ type: 'comment', attrs: { id } }))
    if (this.change) marks.push({ type: this.change.type, attrs: { author: this.change.author, date: this.change.date ? `${this.change.date.replace(/Z$/, '')}Z` : '' } })
    return marks
  }

  /** The tracked changes of the text (`text:tracked-changes`). */
  collectChanges(text: Element): void {
    const list = kids(text).find(kid => kid.localName === 'tracked-changes')
    if (!list) return
    this.tracking = get(list, 'text', 'track-changes') === 'true'
    for (const region of kids(list).filter(kid => kid.localName === 'changed-region')) {
      const change = kids(region)[0]
      if (!change || (change.localName !== 'insertion' && change.localName !== 'deletion')) continue
      const info = kids(change).find(kid => kid.localName === 'change-info')
      const id = get(region, 'text', 'id') ?? region.getAttribute('xml:id') ?? ''
      this.regions.set(id, {
        kind: change.localName,
        author: info ? kids(info).find(kid => kid.localName === 'creator')?.textContent ?? '' : '',
        date: info ? kids(info).find(kid => kid.localName === 'date')?.textContent ?? '' : '',
        element: change,
      })
    }
  }

  /** A style's properties of one kind, with its parents' under them. */
  private resolved(name: string | null, kind: 'text' | 'paragraph' | 'graphic' | 'column'): Record<string, string> {
    const chain: Record<string, string>[] = []
    let current = name
    for (let guard = 0; current && guard < 20; guard++) {
      const style = this.styles.get(current)
      if (!style) break
      chain.unshift(style[kind])
      current = style.parent
    }
    return Object.assign({}, ...chain)
  }

  private headingLevel(name: string | null): number {
    for (let current = name, guard = 0; current && guard < 20; guard++) {
      const match = current.match(/^Heading_20_(\d)$/)
      if (match) return Number(match[1])
      current = this.styles.get(current)?.parent ?? null
    }
    return 0
  }

  private marks(style: string | null, inherited: Marks): Marks {
    if (!style) return inherited
    const props = this.resolved(style, 'text')
    const marks: Marks = inherited.filter(mark => mark.type === 'link')
    const had = (type: string) => inherited.some(mark => mark.type === type)
    if ((props['font-weight'] ?? (had('bold') ? 'bold' : '')) === 'bold' || Number(props['font-weight']) >= 600) marks.push({ type: 'bold' })
    if ((props['font-style'] ?? (had('italic') ? 'italic' : '')) === 'italic') marks.push({ type: 'italic' })
    const underline = props['text-underline-style'] ?? (had('underline') ? 'solid' : 'none')
    if (underline !== 'none' && !marks.some(mark => mark.type === 'link')) marks.push({ type: 'underline' })
    if ((props['text-line-through-style'] ?? (had('strike') ? 'solid' : 'none')) !== 'none') marks.push({ type: 'strike' })
    const textStyle: Record<string, string> = { ...(inherited.find(mark => mark.type === 'textStyle')?.attrs ?? {}) }
    const font = props['font-name'] ?? props['font-family']
    if (font) textStyle.fontFamily = fontCss(font.replace(/^['"]|['"]$/g, ''))
    if (props['font-size']?.endsWith('pt')) textStyle.fontSize = props['font-size']
    const color = hexColor(props.color)
    if (color && !(marks.some(mark => mark.type === 'link') && color === '#0563c1') && color !== '#000000') textStyle.color = color
    if (Object.keys(textStyle).length) marks.push({ type: 'textStyle', attrs: textStyle })
    const background = hexColor(props['background-color'])
    const inheritedHighlight = inherited.find(mark => mark.type === 'highlight')
    if (background && background !== '#ffffff') marks.push({ type: 'highlight', attrs: { color: background } })
    else if (inheritedHighlight && props['background-color'] === undefined) marks.push(inheritedHighlight)
    return marks
  }

  private frame(element: Element): JSONContent | null {
    const image = kids(element).find(kid => kid.localName === 'image')
    const object = kids(element).find(kid => kid.localName === 'object')
    if (object) {
      const folder = (get(object, 'xlink', 'href') ?? '').replace(/^\.\//, '').replace(/\/$/, '')
      const xml = this.text(`${folder}/content.xml`)
      const math = xml ? parseXml(xml).getElementsByTagNameNS(MATHML_NS, 'math')[0] : undefined
      return math ? { type: 'formula', attrs: { latex: mathMlToLatex(math) } } : null
    }
    if (!image) return null
    const path = (get(image, 'xlink', 'href') ?? '').replace(/^\.\//, '')
    const bytes = this.files[path]
    const mime = imageMime(path)
    if (!bytes || !mime) return null
    const width = millimetres(get(element, 'svg', 'width'))
    const graphic = this.resolved(get(element, 'draw', 'style-name'), 'graphic')
    const floating = get(element, 'text', 'anchor-type') !== 'as-char' && graphic.wrap && graphic.wrap !== 'none' && graphic.wrap !== 'run-through'
    const position = graphic['horizontal-pos']
    const wrap = floating && (position === 'left' || position === 'right') ? position : floating && position === 'from-left' ? 'left' : 'inline'
    const alt = kids(element).find(kid => kid.localName === 'desc')?.textContent ?? null
    return { type: 'image', attrs: { src: bytesToDataUrl(bytes, mime), alt, width: width ? Math.round(width / 25.4 * 96) : null, wrap } }
  }

  private inline(element: Element, out: JSONContent[], marks: Marks): void {
    const push = (value: string) => {
      // «Ad» is a mail-merge field (awDOC writes its fields so).
      value.split(/(«[^«»\n]{1,60}»)/).forEach(piece => {
        if (!piece) return
        const field = piece.match(/^«([^«»\n]{1,60})»$/)
        const node: JSONContent = field ? { type: 'mergeField', attrs: { name: field[1] } } : { type: 'text', text: piece }
        const all = [...(field ? marks.filter(mark => mark.type !== 'link') : marks), ...this.reviewMarks()]
        out.push(all.length ? { ...node, marks: all } : node)
      })
    }
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === 3) {
        push((node.textContent ?? '').replace(/[\r\n\t ]+/g, ' '))
        continue
      }
      if (node.nodeType !== 1) continue
      const child = node as Element
      switch (child.localName) {
        case 's': push(' '.repeat(Number(get(child, 'text', 'c')) || 1)); break
        case 'tab': push('\t'); break
        case 'line-break': out.push({ type: 'hardBreak' }); break
        case 'span': this.inline(child, out, this.marks(get(child, 'text', 'style-name'), marks)); break
        case 'a': {
          const href = get(child, 'xlink', 'href') ?? ''
          this.inline(child, out, /^(https?:|mailto:)/i.test(href) ? [...marks, { type: 'link', attrs: { href } }] : marks)
          break
        }
        case 'frame': {
          const found = this.frame(child)
          if (found) out.push(this.reviewMarks().length ? { ...found, marks: this.reviewMarks() } : found)
          break
        }
        case 'change-start': {
          const region = this.regions.get(get(child, 'text', 'change-id') ?? '')
          if (region?.kind === 'insertion') this.change = { type: 'insertion', author: region.author, date: region.date }
          break
        }
        case 'change-end':
          this.change = null
          break
        case 'change': {
          // What was deleted is kept in its region: it comes back here, struck through.
          const region = this.regions.get(get(child, 'text', 'change-id') ?? '')
          if (region?.kind === 'deletion') {
            const outer = this.change
            this.change = { type: 'deletion', author: region.author, date: region.date }
            for (const paragraph of kids(region.element).filter(kid => kid.localName === 'p' || kid.localName === 'h')) this.inline(paragraph, out, marks)
            this.change = outer
          }
          break
        }
        case 'annotation': {
          const name = get(child, 'office', 'name')
          if (!name) break
          const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
          this.commentNames.set(name, id)
          this.openComments.add(id)
          const text = kids(child).filter(kid => kid.localName === 'p').map(paragraph => paragraph.textContent ?? '').join('\n').trim()
          const author = kids(child).find(kid => kid.localName === 'creator')?.textContent ?? ''
          const date = kids(child).find(kid => kid.localName === 'date')?.textContent ?? ''
          this.comments.push({ id, author, date: date ? `${date.replace(/Z$/, '')}Z` : new Date().toISOString(), text })
          break
        }
        case 'annotation-end': {
          const id = this.commentNames.get(get(child, 'office', 'name') ?? '')
          if (id) this.openComments.delete(id)
          break
        }
        case 'note': {
          const body = kids(child).find(kid => kid.localName === 'note-body')
          const text = (body?.textContent ?? '').replace(/\s+/g, ' ').trim()
          if (text) out.push({ type: 'footnote', attrs: { text } })
          break
        }
        case 'bookmark': case 'bookmark-start': case 'bookmark-end': case 'soft-page-break': case 'sequence-decls': case 'tracked-changes':
          break
        default: this.inline(child, out, marks)
      }
    }
  }

  private paragraph(element: Element, inList: boolean): JSONContent[] {
    const style = get(element, 'text', 'style-name')
    const props = this.resolved(style, 'paragraph')
    const level = element.localName === 'h' ? Number(get(element, 'text', 'outline-level')) || this.headingLevel(style) || 1 : this.headingLevel(style)
    const attrs: Record<string, unknown> = {}
    const align = props['text-align']
    if (align === 'center') attrs.textAlign = 'center'
    else if (align === 'end' || align === 'right') attrs.textAlign = 'right'
    else if (align === 'justify') attrs.textAlign = 'justify'
    const line = props['line-height']
    if (line?.endsWith('%')) {
      const lineHeight = lineHeightOf(Number.parseFloat(line) / 100)
      if (lineHeight) attrs.lineHeight = lineHeight
    }
    const margin = millimetres(props['margin-left'] ?? null)
    if (!inList && margin && margin > 0) attrs.indent = Math.min(8, Math.round(margin / (INDENT_CM * 10)))
    if (level) attrs.level = Math.min(3, level)
    const content: JSONContent[] = []
    this.inline(element, content, this.marks(style, []))
    // Spaces at a paragraph's ends are folded away, as LibreOffice shows them.
    const blocks: JSONContent[] = []
    if (props['break-before'] === 'page') blocks.push({ type: 'pageBreak' })
    blocks.push(content.length ? { type: level && !inList ? 'heading' : 'paragraph', attrs, content } : { type: level && !inList ? 'heading' : 'paragraph', attrs })
    if (blocks.at(-1)!.content?.length === 1 && blocks.at(-1)!.content![0].type === 'image' && attrs.textAlign === 'center' && blocks.at(-1)!.content![0].attrs!.wrap === 'inline') blocks.at(-1)!.content![0].attrs!.wrap = 'center'
    if (props['break-after'] === 'page') blocks.push({ type: 'pageBreak' })
    return blocks
  }

  private list(element: Element, style: string | null, depth: number): JSONContent {
    const own = get(element, 'text', 'style-name') ?? style
    const numbered = own ? this.lists.get(own)?.[Math.min(9, depth)] ?? false : false
    const items: JSONContent[] = []
    let start = 1
    for (const item of kids(element).filter(kid => kid.localName === 'list-item' || kid.localName === 'list-header')) {
      if (!items.length && get(item, 'text', 'start-value')) start = Number(get(item, 'text', 'start-value')) || 1
      const content: JSONContent[] = []
      for (const child of kids(item)) {
        if (child.localName === 'list') content.push(this.list(child, own, depth + 1))
        else if (child.localName === 'p' || child.localName === 'h') content.push(...this.paragraph(child, true).filter(block => block.type !== 'pageBreak'))
        else content.push(...this.blocks(child))
      }
      if (content[0]?.type !== 'paragraph') content.unshift({ type: 'paragraph' })
      items.push({ type: 'listItem', content })
    }
    if (!items.length) items.push({ type: 'listItem', content: [{ type: 'paragraph' }] })
    return numbered ? { type: 'orderedList', attrs: { start }, content: items } : { type: 'bulletList', content: items }
  }

  private table(element: Element): JSONContent {
    const widths: (number | null)[] = []
    const rows: Element[] = []
    const walk = (parent: Element, header: boolean) => {
      for (const child of kids(parent)) {
        if (child.localName === 'table-column') {
          const repeat = Number(get(child, 'table', 'number-columns-repeated')) || 1
          const width = millimetres(this.resolved(get(child, 'table', 'style-name'), 'column')['column-width'] ?? null)
          for (let i = 0; i < Math.min(repeat, 64); i++) widths.push(width ? Math.round(width / 25.4 * 96) : null)
        } else if (child.localName === 'table-row') {
          if (header) child.setAttribute('data-header', '1')
          rows.push(child)
        } else if (['table-columns', 'table-header-columns', 'table-rows', 'table-header-rows', 'table-row-group', 'table-column-group'].includes(child.localName)) {
          walk(child, header || child.localName === 'table-header-rows')
        }
      }
    }
    walk(element, false)
    const content = rows.map(row => {
      let column = 0
      const cells: JSONContent[] = []
      for (const cell of kids(row)) {
        if (cell.localName === 'covered-table-cell') {
          column++
          continue
        }
        if (cell.localName !== 'table-cell') continue
        const span = Number(get(cell, 'table', 'number-columns-spanned')) || 1
        const down = Number(get(cell, 'table', 'number-rows-spanned')) || 1
        const set = widths.slice(column, column + span)
        cells.push({
          type: row.getAttribute('data-header') ? 'tableHeader' : 'tableCell',
          attrs: { colspan: span, rowspan: down, colwidth: set.length === span && set.every(Boolean) ? set : null },
          content: tidy(this.blocks(cell)),
        })
        column += span
      }
      return { type: 'tableRow', content: cells.length ? cells : [{ type: 'tableCell', content: [{ type: 'paragraph' }] }] }
    })
    return { type: 'table', content: content.length ? content : [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }] }] }
  }

  blocks(container: Element): JSONContent[] {
    const out: JSONContent[] = []
    for (const node of kids(container)) {
      switch (node.localName) {
        case 'p': case 'h': out.push(...this.paragraph(node, false)); break
        case 'list': out.push(this.list(node, null, 0)); break
        case 'table': out.push(this.table(node)); break
        case 'table-of-content':
          out.push({ type: 'tableOfContents' })
          break
        case 'section': case 'text': case 'index-body': case 'illustration-index': case 'soft-page-break':
          out.push(...this.blocks(node))
          break
      }
    }
    // A page break only between paragraphs at the top: one at the start or doubled is dropped.
    return out.filter((block, index) => block.type !== 'pageBreak' || (index > 0 && out[index - 1].type !== 'pageBreak'))
  }

  pageSetup(styles: Document | null): PageSetup {
    if (!styles) return DEFAULT_PAGE_SETUP
    const master = styles.getElementsByTagNameNS(NS.style, 'master-page')[0]
    if (!master) return DEFAULT_PAGE_SETUP
    const layoutName = get(master, 'style', 'page-layout-name')
    const layout = Array.from(styles.getElementsByTagNameNS(NS.style, 'page-layout')).find(element => get(element, 'style', 'name') === layoutName)
    const props = layout ? kids(layout).find(kid => kid.localName === 'page-layout-properties') : undefined
    const mm = (name: string, fallback: number) => Math.round((millimetres(get(props, 'fo', name)) ?? fallback) * 10) / 10
    const width = mm('page-width', 210)
    const height = mm('page-height', 297)
    let header = ''
    let footer = ''
    let pageNumbers: PageNumberPlace = 'none'
    let numberFormat: PageNumberFormat = 'number'
    const area = (name: 'header' | 'footer') => {
      const element = kids(master).find(kid => kid.localName === name)
      if (!element) return ''
      const lines: string[] = []
      for (const paragraph of Array.from(element.getElementsByTagNameNS(NS.text, 'p'))) {
        const textOf = (paragraph.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (paragraph.getElementsByTagNameNS(NS.text, 'page-number').length) {
          const align = this.resolved(get(paragraph, 'text', 'style-name'), 'paragraph')['text-align']
          pageNumbers = name === 'header' ? 'top-right' : align === 'end' || align === 'right' ? 'bottom-right' : 'bottom-center'
          numberFormat = paragraph.getElementsByTagNameNS(NS.text, 'page-count').length ? 'number-of-total' : /^Sayfa/i.test(textOf) ? 'page-number' : 'number'
        } else if (textOf) {
          lines.push(textOf)
        }
      }
      return lines.join(' ')
    }
    header = area('header')
    footer = area('footer')
    // The header's box (its lines and spacing, or its least height) lies inside the top margin.
    const boxOf = (name: 'header' | 'footer') => {
      const area = kids(master).find(kid => kid.localName === name)
      if (!area) return 0
      const style = layout ? kids(layout).find(kid => kid.localName === `${name}-style`) : undefined
      const props = style ? kids(style).find(kid => kid.localName === 'header-footer-properties') : undefined
      const least = millimetres(get(props, 'fo', 'min-height')) ?? 0
      const spacing = millimetres(get(props, 'fo', name === 'header' ? 'margin-bottom' : 'margin-top')) ?? 0
      const lines = Array.from(area.getElementsByTagNameNS(NS.text, 'p')).filter(paragraph => (paragraph.textContent ?? '').trim()).length
      return get(props, 'style', 'dynamic-spacing') === 'true' ? Math.max(least, lines * HEADER_LINE_MM) : Math.max(least, lines * HEADER_LINE_MM + spacing)
    }
    return normalizePageSetup({
      orientation: get(props, 'style', 'print-orientation') === 'landscape' || width > height ? 'landscape' : 'portrait',
      margins: { top: Math.round((mm('margin-top', 25) + boxOf('header')) * 10) / 10, right: mm('margin-right', 25), bottom: Math.round((mm('margin-bottom', 25) + boxOf('footer')) * 10) / 10, left: mm('margin-left', 25) },
      header, footer, pageNumbers, numberFormat,
    })
  }
}

/** The editor's model of a LibreOffice text file's bytes. */
export function readOdt(bytes: Uint8Array): JSONContent {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new FormatError('Bu dosya bir LibreOffice belgesi değil ya da bozuk.')
  }
  const reader = new Reader(files)
  const content = reader.text('content.xml')
  if (!content) throw new FormatError('Bu dosya bir LibreOffice belgesi değil (content.xml yok).')
  const stylesText = reader.text('styles.xml')
  const styles = stylesText ? parseXml(stylesText) : null
  if (styles) reader.collect(styles)
  const document = parseXml(content)
  reader.collect(document)
  const text = document.getElementsByTagNameNS(NS.office, 'text')[0]
  if (!text) throw new FormatError('Bu LibreOffice dosyası bir yazı belgesi değil.')
  reader.collectChanges(text)
  const blocks = reader.blocks(text)
  while (blocks[0]?.type === 'pageBreak') blocks.shift()
  const used = new Set<string>()
  const walk = (node: JSONContent) => {
    node.marks?.forEach(mark => { if (mark.type === 'comment') used.add(String(mark.attrs?.id)) })
    node.content?.forEach(walk)
  }
  blocks.forEach(walk)
  const comments = reader.comments.filter(comment => used.has(comment.id))
  return { type: 'doc', attrs: { page: reader.pageSetup(styles), comments: comments.length ? comments : null, track: reader.tracking ? true : null }, content: tidy(blocks) }
}

export const odtFormat: DocumentFormat = {
  id: 'odt',
  description: 'LibreOffice belgesi',
  extensions: ['odt'],
  mime: MIME,
  keepsEverything: document => !hasTeacherBlocks(document),
  read: readOdt,
  write: writeOdt,
}
