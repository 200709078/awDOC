import type { JSONContent } from '@tiptap/core'
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { DEFAULT_PAGE_SETUP, normalizePageSetup, pageSize, type PageNumberFormat, type PageNumberPlace, type PageSetup } from '../editor/page-setup'
import { escapeXml, mathMlToOmml, ommlToLatex } from '../math/convert'
import { FormatError, type DocumentFormat } from './format'
import {
  BORDERLESS, bytesToDataUrl, changeOf, commentIdsOf, dataUrlBytes, lastCommentPieces, storedComments, type StoredComment, EMU_PER_PX, extensionOfMime, fontCss, fontName, formulasIn, hasTeacherBlocks, hexColor,
  imageMime, lineHeightOf, officeBlocks, pointsOf, shownSize, tidy, TWIPS_PER_MM, type Marks,
} from './office'

/**
 * Word documents (Office Open XML, `.docx`). Written by hand (no library): paragraphs and headings,
 * text styles, alignment, spacing, indents, lists, tables, pictures, links, page breaks, formulas
 * (Word's own maths, OMML) and the page (A4, margins, header, footer, page numbers). Read back the
 * same way; questions come back as the ordinary paragraphs they were saved as.
 */

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NAMESPACES = [
  `xmlns:w="${W}"`, `xmlns:r="${R}"`,
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
].join(' ')
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const HEADING_SIZES: Readonly<Record<number, number>> = { 1: 20, 2: 16, 3: 13 }
const INDENT_TWIPS = 720
const HIGHLIGHTS: Readonly<Record<string, string>> = {
  yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000', darkBlue: '#000080',
  darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000', darkGray: '#808080',
  lightGray: '#c0c0c0', black: '#000000', white: '#ffffff',
}

/* ================= writing ================= */

interface Part { readonly id: string; readonly type: string; readonly target: string; readonly external?: boolean }

class Writer {
  readonly rels: Part[] = []
  readonly media: Record<string, Uint8Array> = {}
  private pictures = 0
  private lists = 0
  /** num id → [abstract id, start] for numbering.xml. */
  readonly nums: [number, number][] = []

  /** Comments: their numbers in the file, where each one's range ends, which have started. */
  private readonly commentNumbers = new Map<string, number>()
  private lastPieces = new Map<string, number>()
  private readonly started = new Set<string>()
  private pieceIndex = 0
  private changes = 0
  /** The footnotes' texts, numbered from 1 in footnotes.xml. */
  readonly footnotes: string[] = []

  constructor(private readonly maths: ReadonlyMap<string, string>, private readonly textWidth: number) {}

  /** Before writing: which comments the blocks have and where each ends. */
  prepare(blocks: JSONContent[], comments: readonly StoredComment[]): void {
    this.lastPieces = lastCommentPieces(blocks)
    for (const comment of comments) if (this.lastPieces.has(comment.id)) this.commentNumbers.set(comment.id, this.commentNumbers.size)
  }

  /** The comments written, in their numbers' order. */
  get writtenComments(): string[] {
    return [...this.commentNumbers.keys()].filter(id => this.started.has(id))
  }

  commentNumber(id: string): number {
    return this.commentNumbers.get(id) ?? -1
  }

  private rel(type: string, target: string, external = false): string {
    const id = `rId${this.rels.length + 10}`
    this.rels.push({ id, type, target, external })
    return id
  }

  /* ---- runs ---- */

  private runProps(marks: Marks = []): string {
    const has = (type: string) => marks.find(mark => mark.type === type)
    const style = has('textStyle')?.attrs ?? {}
    let props = ''
    if (has('link')) props += '<w:rStyle w:val="Hyperlink"/>'
    const font = fontName(style.fontFamily) ?? (has('code') ? 'Courier New' : null)
    if (font) props += `<w:rFonts w:ascii="${escapeXml(font)}" w:hAnsi="${escapeXml(font)}" w:cs="${escapeXml(font)}"/>`
    if (has('bold')) props += '<w:b/><w:bCs/>'
    if (has('italic')) props += '<w:i/><w:iCs/>'
    if (has('strike')) props += '<w:strike/>'
    const color = hexColor(style.color)
    if (color) props += `<w:color w:val="${color.slice(1).toUpperCase()}"/>`
    const size = pointsOf(style.fontSize)
    if (size) props += `<w:sz w:val="${Math.round(size * 2)}"/><w:szCs w:val="${Math.round(size * 2)}"/>`
    if (has('underline')) props += '<w:u w:val="single"/>'
    const highlight = has('highlight')
    if (highlight) props += `<w:shd w:val="clear" w:color="auto" w:fill="${(hexColor(highlight.attrs?.color) ?? '#ffff00').slice(1).toUpperCase()}"/>`
    return props ? `<w:rPr>${props}</w:rPr>` : ''
  }

  private textRuns(value: string, marks?: Marks): string {
    const props = this.runProps(marks)
    const tag = marks?.some(mark => mark.type === 'deletion') ? 'w:delText' : 'w:t'
    return value.split('\t').map((piece, index) => `<w:r>${props}${index ? '<w:tab/>' : ''}${piece ? `<${tag} xml:space="preserve">${escapeXml(piece)}</${tag}>` : ''}</w:r>`).join('')
  }

  /** One inline piece with its comment ranges around it and its tracked change (w:ins / w:del). */
  private wrapPiece(node: JSONContent, xml: string): string {
    const index = this.pieceIndex++
    let before = ''
    let after = ''
    for (const id of commentIdsOf(node.marks)) {
      const number = this.commentNumbers.get(id)
      if (number === undefined) continue
      if (!this.started.has(id)) {
        this.started.add(id)
        before += `<w:commentRangeStart w:id="${number}"/>`
      }
      if (this.lastPieces.get(id) === index) after += `<w:commentRangeEnd w:id="${number}"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${number}"/></w:r>`
    }
    const change = changeOf(node.marks)
    if (change && xml) {
      const tag = change.kind === 'insertion' ? 'w:ins' : 'w:del'
      xml = `<${tag} w:id="${1000 + ++this.changes}" w:author="${escapeXml(change.author || 'Yazar')}" w:date="${escapeXml(change.date || new Date().toISOString().replace(/\.\d+Z$/, 'Z'))}">${xml}</${tag}>`
    }
    return before + xml + after
  }

  private picture(attrs: Record<string, unknown>): string {
    const data = dataUrlBytes(attrs.src)
    if (!data) return ''
    const number = ++this.pictures
    const name = `resim${number}.${extensionOfMime(data.mime)}`
    this.media[`word/media/${name}`] = data.bytes
    const id = this.rel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', `media/${name}`)
    const { width, height } = shownSize(attrs, data.bytes)
    const cx = width * EMU_PER_PX
    const cy = height * EMU_PER_PX
    const alt = escapeXml(String(attrs.alt ?? ''))
    const graphic = `<wp:docPr id="${number}" name="Resim ${number}" descr="${alt}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${number}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>`
    const wrap = attrs.wrap
    if (wrap === 'left' || wrap === 'right') {
      return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="${number}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:align>${wrap}</wp:align></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapSquare wrapText="bothSides"/>${graphic}</wp:anchor></w:drawing></w:r>`
    }
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>${graphic}</wp:inline></w:drawing></w:r>`
  }

  private inline(nodes: JSONContent[] = []): string {
    return nodes.map(node => (node.type && node.type !== 'text' && !['hardBreak', 'image', 'formula', 'mergeField', 'footnote'].includes(node.type) ? this.inline(node.content) : this.wrapPiece(node, this.leaf(node)))).join('')
  }

  private leaf(node: JSONContent): string {
      switch (node.type) {
        case 'text': {
          const link = node.marks?.find(mark => mark.type === 'link')
          const runs = this.textRuns(node.text ?? '', node.marks)
          if (!link?.attrs?.href) return runs
          return `<w:hyperlink r:id="${this.rel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', String(link.attrs.href), true)}">${runs}</w:hyperlink>`
        }
        case 'hardBreak':
          return '<w:r><w:br/></w:r>'
        case 'image':
          return this.picture(node.attrs ?? {})
        case 'formula': {
          const latex = String(node.attrs?.latex ?? '')
          return this.maths.get(latex) ?? this.textRuns(latex, [{ type: 'italic' }])
        }
        case 'footnote': {
          this.footnotes.push(String(node.attrs?.text ?? ''))
          return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${this.footnotes.length}"/></w:r>`
        }
        case 'mergeField': {
          const name = String(node.attrs?.name ?? '')
          return `<w:fldSimple w:instr=" MERGEFIELD ${escapeXml(/\s/.test(name) ? `"${name}"` : name)} ">${this.textRuns(`«${name}»`, node.marks)}</w:fldSimple>`
        }
        default:
          return this.inline(node.content)
      }
  }

  /* ---- blocks ---- */

  private paragraph(node: JSONContent, extra: { numbering?: string; indent?: number; style?: string } = {}): string {
    const attrs = node.attrs ?? {}
    let props = ''
    const style = extra.style ?? (node.type === 'heading' ? `Heading${Math.min(3, Math.max(1, Number(attrs.level) || 1))}` : '')
    if (style) props += `<w:pStyle w:val="${style}"/>`
    if (extra.numbering) props += extra.numbering
    const line = Number.parseFloat(String(attrs.lineHeight ?? ''))
    if (line > 0) props += `<w:spacing w:line="${Math.round(line * 240)}" w:lineRule="auto"/>`
    const indent = (Number(attrs.indent) || 0) * INDENT_TWIPS + (extra.indent ?? 0)
    if (indent > 0 && !extra.numbering) props += `<w:ind w:left="${indent}"/>`
    const centred = node.content?.length === 1 && node.content[0].type === 'image' && node.content[0].attrs?.wrap === 'center'
    const align = centred ? 'center' : attrs.textAlign
    if (align && align !== 'left') props += `<w:jc w:val="${align === 'justify' ? 'both' : align}"/>`
    return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${this.inline(node.content)}</w:p>`
  }

  private list(node: JSONContent, level: number): string {
    const ordered = node.type === 'orderedList'
    const num = ++this.lists
    this.nums.push([ordered ? 1 : 0, Number(node.attrs?.start ?? 1) || 1])
    return (node.content ?? []).map(item => (item.content ?? []).map((child, index) => {
      if (child.type === 'bulletList' || child.type === 'orderedList') return this.list(child, Math.min(8, level + 1))
      if (index === 0 && (child.type === 'paragraph' || child.type === 'heading')) {
        return this.paragraph(child, { numbering: `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${num}"/></w:numPr>` })
      }
      return this.block(child, (level + 1) * INDENT_TWIPS)
    }).join('')).join('')
  }

  private table(node: JSONContent): string {
    const rows = node.content ?? []
    const borderless = Boolean(node.attrs?.[BORDERLESS])
    // Columns: the first row's cells with their set widths; the rest share what is left.
    const widths: (number | null)[] = []
    for (const cell of rows[0]?.content ?? []) {
      const span = Number(cell.attrs?.colspan) || 1
      const set = cell.attrs?.colwidth as (number | null)[] | null | undefined
      for (let i = 0; i < span; i++) widths.push(set?.[i] ? Math.round(set[i]! * 15) : null)
    }
    const fixed = widths.reduce<number>((sum, width) => sum + (width ?? 0), 0)
    const open = widths.filter(width => width === null).length
    const rest = open ? Math.max(600, Math.round((this.textWidth - fixed) / open)) : 0
    const grid = widths.map(width => width ?? rest)
    // Cells merged from the row above (rowspan) are written again in each row, as Word wants.
    const carried: { left: number; span: number }[] = grid.map(() => ({ left: 0, span: 1 }))
    const borders = borderless
      ? '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>'
      : ''
    let xml = `<w:tbl><w:tblPr>${borderless ? '' : '<w:tblStyle w:val="TableGrid"/>'}<w:tblW w:w="0" w:type="auto"/>${borders}<w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>${grid.map(width => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>`
    rows.forEach(row => {
      const header = (row.content ?? []).some(cell => cell.type === 'tableHeader')
      xml += `<w:tr>${header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}`
      const cells = [...(row.content ?? [])]
      let column = 0
      const width = (from: number, span: number) => grid.slice(from, from + span).reduce((sum, value) => sum + value, 0)
      while (column < grid.length) {
        if (carried[column].left > 0) {
          const { span } = carried[column]
          carried[column].left--
          xml += `<w:tc><w:tcPr><w:tcW w:w="${width(column, span)}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}<w:vMerge/></w:tcPr><w:p/></w:tc>`
          column += span
          continue
        }
        const cell = cells.shift()
        if (!cell) break
        const span = Math.min(grid.length - column, Number(cell.attrs?.colspan) || 1)
        const down = Number(cell.attrs?.rowspan) || 1
        if (down > 1) carried[column] = { left: down - 1, span }
        const content = (cell.content ?? []).map(child => this.block(child)).join('') || '<w:p/>'
        xml += `<w:tc><w:tcPr><w:tcW w:w="${width(column, span)}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${down > 1 ? '<w:vMerge w:val="restart"/>' : ''}</w:tcPr>${content.endsWith('</w:p>') || content.endsWith('<w:p/>') ? content : `${content}<w:p/>`}</w:tc>`
        column += span
      }
      xml += '</w:tr>'
    })
    return `${xml}</w:tbl>`
  }

  block(node: JSONContent, indent = 0): string {
    switch (node.type) {
      case 'paragraph': case 'heading':
        return this.paragraph(node, { indent })
      case 'bulletList': case 'orderedList':
        return this.list(node, 0)
      case 'table':
        return this.table(node)
      case 'pageBreak':
        return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
      case 'tableOfContents':
        return this.contents((node.attrs?.entries ?? []) as { level: number; text: string }[])
      case 'horizontalRule':
        return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr></w:pPr></w:p>'
      default:
        return (node.content ?? []).map(child => this.block(child, indent)).join('')
    }
  }

  /**
   * İçindekiler as Word's own: a TOC field over the headings (Heading 1–3), marked to be updated,
   * so Word fills in the page numbers when it opens the file (it asks first).
   */
  private contents(entries: { level: number; text: string }[]): string {
    const begin = '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>'
    const end = '<w:r><w:fldChar w:fldCharType="end"/></w:r>'
    const lines = entries.length ? entries : [{ level: 1, text: 'İçindekiler güncellenecek' }]
    const body = lines.map((entry, index) =>
      `<w:p><w:pPr><w:pStyle w:val="TOC${Math.min(3, entry.level)}"/></w:pPr>${index === 0 ? begin : ''}<w:r><w:t xml:space="preserve">${escapeXml(entry.text)}</w:t></w:r>${index === lines.length - 1 ? end : ''}</w:p>`).join('')
    return `<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/><w:docPartUnique/></w:docPartObj></w:sdtPr><w:sdtContent><w:p><w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr><w:r><w:t>İçindekiler</w:t></w:r></w:p>${body}</w:sdtContent></w:sdt>`
  }

  /** A header or footer part with the line and/or the page number. */
  pagePart(kind: 'header' | 'footer', line: string, number: { place: PageNumberPlace; format: PageNumberFormat } | null): string {
    const page = (format: PageNumberFormat) => {
      const field = (instruction: string) => `<w:fldSimple w:instr=" ${instruction} "><w:r><w:t>1</w:t></w:r></w:fldSimple>`
      if (format === 'number-of-total') return `${field('PAGE')}<w:r><w:t xml:space="preserve"> / </w:t></w:r>${field('NUMPAGES')}`
      if (format === 'page-number') return `<w:r><w:t xml:space="preserve">Sayfa </w:t></w:r>${field('PAGE')}`
      return field('PAGE')
    }
    let body = line ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>` : ''
    if (number) body += `<w:p><w:pPr><w:jc w:val="${number.place === 'bottom-center' ? 'center' : 'right'}"/></w:pPr>${page(number.format)}</w:p>`
    const tag = kind === 'header' ? 'w:hdr' : 'w:ftr'
    return `${XML}<${tag} ${NAMESPACES}>${body || '<w:p/>'}</${tag}>`
  }

  relsXml(): string {
    const fixed = [
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>',
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>',
    ]
    const own = this.rels.map(rel => `<Relationship Id="${rel.id}" Type="${rel.type}" Target="${escapeXml(rel.target)}"${rel.external ? ' TargetMode="External"' : ''}/>`)
    return `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${[...fixed, ...own].join('')}</Relationships>`
  }

  addRel(type: string, target: string): string {
    return this.rel(type, target)
  }
}

function numberingXml(nums: readonly [number, number][]): string {
  const bullets = ['•', '◦', '▪']
  const level = (abstract: number, index: number) => {
    const indent = `<w:pPr><w:ind w:left="${(index + 1) * INDENT_TWIPS}" w:hanging="360"/></w:pPr>`
    return abstract === 0
      ? `<w:lvl w:ilvl="${index}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${bullets[index % 3]}"/><w:lvlJc w:val="left"/>${indent}</w:lvl>`
      : `<w:lvl w:ilvl="${index}"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%${index + 1}."/><w:lvlJc w:val="left"/>${indent}</w:lvl>`
  }
  const abstracts = [0, 1].map(abstract => `<w:abstractNum w:abstractNumId="${abstract}"><w:multiLevelType w:val="hybridMultilevel"/>${Array.from({ length: 9 }, (_, index) => level(abstract, index)).join('')}</w:abstractNum>`).join('')
  const instances = nums.map(([abstract, start], index) =>
    `<w:num w:numId="${index + 1}"><w:abstractNumId w:val="${abstract}"/>${abstract === 1 ? Array.from({ length: 9 }, (_, lvl) => `<w:lvlOverride w:ilvl="${lvl}"><w:startOverride w:val="${lvl === 0 ? start : 1}"/></w:lvlOverride>`).join('') : ''}</w:num>`).join('')
  return `${XML}<w:numbering ${NAMESPACES}>${abstracts}${instances}</w:numbering>`
}

const STYLES_XML = `${XML}<w:styles xmlns:w="${W}">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="tr-TR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${[1, 2, 3].map(level => `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="160" w:line="300" w:lineRule="auto"/><w:outlineLvl w:val="${level - 1}"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="${HEADING_SIZES[level] * 2}"/><w:szCs w:val="${HEADING_SIZES[level] * 2}"/></w:rPr></w:style>`).join('\n')}
<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Heading1"/><w:next w:val="Normal"/><w:pPr><w:outlineLvl w:val="9"/></w:pPr></w:style>
${[1, 2, 3].map(level => `<w:style w:type="paragraph" w:styleId="TOC${level}"><w:name w:val="toc ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9350"/></w:tabs><w:spacing w:after="100"/><w:ind w:left="${(level - 1) * 220}"/></w:pPr></w:style>`).join('\n')}
<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr></w:style>
</w:styles>`

/** settings.xml, its elements in the schema's order (Word is strict about it). */
function settingsXml(track: boolean, footnotes: boolean): string {
  return `${XML}<w:settings xmlns:w="${W}">${track ? '<w:trackRevisions/>' : ''}<w:defaultTabStop w:val="708"/><w:updateFields w:val="true"/>${footnotes ? '<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>' : ''}<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`
}

async function mathsOf(document: JSONContent): Promise<Map<string, string>> {
  const maths = new Map<string, string>()
  const formulas = formulasIn(document)
  if (!formulas.length) return maths
  const { loadMath } = await import('../math/load')
  const kit = await loadMath()
  for (const latex of formulas) {
    const omml = mathMlToOmml(kit.toMathMl(latex))
    if (omml) maths.set(latex, omml)
  }
  return maths
}

async function writeDocx(document: JSONContent): Promise<Uint8Array> {
  const setup = normalizePageSetup(document.attrs?.page)
  const size = pageSize(setup)
  const twips = (mm: number) => Math.round(mm * TWIPS_PER_MM)
  const writer = new Writer(await mathsOf(document), twips(size.width - setup.margins.left - setup.margins.right))
  const blocks = tidy(officeBlocks(document))
  const comments = storedComments(document)
  writer.prepare(blocks, comments)
  const body = blocks.map(block => writer.block(block)).join('')

  const files: Zippable = {}
  const contentTypes = [
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Default Extension="png" ContentType="image/png"/>', '<Default Extension="jpeg" ContentType="image/jpeg"/>',
    '<Default Extension="gif" ContentType="image/gif"/>', '<Default Extension="webp" ContentType="image/webp"/>',
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>',
    '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
  ]
  // Header and footer: the line, and the page number where it was put.
  let references = ''
  const number = setup.pageNumbers === 'none' ? null : { place: setup.pageNumbers, format: setup.numberFormat }
  const parts: [kind: 'header' | 'footer', line: string, withNumber: boolean][] = [
    ['header', setup.header, number?.place === 'top-right'],
    ['footer', setup.footer, Boolean(number && number.place !== 'top-right')],
  ]
  for (const [kind, line, withNumber] of parts) {
    if (!line && !withNumber) continue
    files[`word/${kind}1.xml`] = strToU8(writer.pagePart(kind, line, withNumber ? number : null))
    const id = writer.addRel(`http://schemas.openxmlformats.org/officeDocument/2006/relationships/${kind}`, `${kind}1.xml`)
    references += `<w:${kind}Reference w:type="default" r:id="${id}"/>`
    contentTypes.push(`<Override PartName="/word/${kind}1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}+xml"/>`)
  }
  const landscape = setup.orientation === 'landscape'
  const { top, right, bottom, left } = setup.margins
  const section = `<w:sectPr>${references}<w:pgSz w:w="${twips(size.width)}" w:h="${twips(size.height)}"${landscape ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${twips(top)}" w:right="${twips(right)}" w:bottom="${twips(bottom)}" w:left="${twips(left)}" w:header="${twips(Math.min(12.5, top / 2))}" w:footer="${twips(Math.min(12.5, bottom / 2))}" w:gutter="0"/></w:sectPr>`

  files['_rels/.rels'] = strToU8(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`)
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  files['docProps/core.xml'] = strToU8(`${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`)
  files['docProps/app.xml'] = strToU8(`${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>awDOC</Application></Properties>`)
  files['word/document.xml'] = strToU8(`${XML}<w:document ${NAMESPACES}><w:body>${body}${section}</w:body></w:document>`)
  files['word/styles.xml'] = strToU8(STYLES_XML)
  files['word/numbering.xml'] = strToU8(numberingXml(writer.nums))
  files['word/settings.xml'] = strToU8(settingsXml(Boolean(document.attrs?.track), writer.footnotes.length > 0))
  if (writer.footnotes.length) {
    const separator = (type: string, id: number, mark: string) => `<w:footnote w:type="${type}" w:id="${id}"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:${mark}/></w:r></w:p></w:footnote>`
    const notes = writer.footnotes.map((text, index) => `<w:footnote w:id="${index + 1}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> ${escapeXml(text)}</w:t></w:r></w:p></w:footnote>`).join('')
    files['word/footnotes.xml'] = strToU8(`${XML}<w:footnotes ${NAMESPACES}>${separator('separator', -1, 'separator')}${separator('continuationSeparator', 0, 'continuationSeparator')}${notes}</w:footnotes>`)
    writer.addRel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes', 'footnotes.xml')
    contentTypes.push('<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>')
  }
  const written = writer.writtenComments
  if (written.length) {
    const byId = new Map(comments.map(comment => [comment.id, comment]))
    const xml = written.map(id => {
      const comment = byId.get(id)!
      const paragraphs = comment.text.split('\n').map(line => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`).join('')
      const initials = (comment.author || 'Y').split(/\s+/).map(word => word[0] ?? '').join('').slice(0, 3)
      return `<w:comment w:id="${writer.commentNumber(id)}" w:author="${escapeXml(comment.author || 'Yazar')}" w:date="${escapeXml(comment.date.replace(/\.\d+Z$/, 'Z'))}" w:initials="${escapeXml(initials)}">${paragraphs}</w:comment>`
    }).join('')
    files['word/comments.xml'] = strToU8(`${XML}<w:comments ${NAMESPACES}>${xml}</w:comments>`)
    writer.addRel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments', 'comments.xml')
    contentTypes.push('<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>')
  }
  files['word/_rels/document.xml.rels'] = strToU8(writer.relsXml())
  files['[Content_Types].xml'] = strToU8(`${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${contentTypes.join('')}</Types>`)
  for (const [path, bytes] of Object.entries(writer.media)) files[path] = [bytes, { level: 0 }]
  return zipSync(files, { level: 6 })
}

/* ================= reading ================= */

const attr = (element: Element | undefined | null, name: string): string | null =>
  element ? element.getAttributeNS(W, name) ?? element.getAttribute(`w:${name}`) : null
const kids = (element: Element) => Array.from(element.children)
const first = (element: Element | undefined | null, name: string) => (element ? kids(element).find(kid => kid.localName === name) : undefined)
const on = (element: Element | undefined) => Boolean(element) && !['0', 'false', 'off'].includes(attr(element!, 'val') ?? 'true')

function parseXml(text: string): Document {
  const parsed = new DOMParser().parseFromString(text, 'application/xml')
  if (parsed.getElementsByTagName('parsererror').length) throw new FormatError('Word belgesinin içi okunamadı.')
  return parsed
}

interface ListKind { ordered: boolean; start: number }

/** The column of a MERGEFIELD instruction (` MERGEFIELD "Ad Soyad" \\* MERGEFORMAT `); null for other fields. */
function mergeFieldName(instruction: string): string | null {
  const match = instruction.match(/^\s*MERGEFIELD\s+(?:"([^"]+)"|(\S+))/i)
  return match ? (match[1] ?? match[2]).trim() : null
}

const newCommentId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

const withMarks = (node: JSONContent, marks: Marks): JSONContent => (marks.length ? { ...node, marks: marks.filter(mark => mark.type !== 'link') } : node)

/**
 * What a markup-compatibility block (`mc:AlternateContent`, LibreOffice and Word wrap drawings in
 * it) holds: its first choice, else its fallback; anything else is itself.
 */
function alternative(element: Element): Element[] {
  if (element.localName !== 'AlternateContent') return [element]
  const pick = kids(element).find(kid => kid.localName === 'Choice') ?? kids(element).find(kid => kid.localName === 'Fallback')
  return pick ? kids(pick) : []
}

class Reader {
  /** Comments: the file's numbers to awDOC's ids, those open where the reading is, their entries. */
  private readonly commentIds = new Map<string, string>()
  private readonly openComments = new Set<string>()
  readonly comments: StoredComment[] = []
  /** The tracked change being read (inside w:ins / w:del). */
  private change: { type: 'insertion' | 'deletion'; author: string; date: string } | null = null
  tracking = false
  private readonly footnoteTexts = new Map<string, string>()
  private readonly rels = new Map<string, { target: string; external: boolean }>()
  private readonly styles = new Map<string, { name: string; heading: number | null }>()
  private readonly numbering = new Map<string, ListKind[]>()

  constructor(private readonly files: Record<string, Uint8Array>) {}

  text(path: string): string | null {
    const bytes = this.files[path]
    return bytes ? new TextDecoder('utf-8').decode(bytes) : null
  }

  load(): Element {
    const main = this.text('word/document.xml')
    if (!main) throw new FormatError('Bu dosya bir Word belgesi değil (word/document.xml yok).')
    const rels = this.text('word/_rels/document.xml.rels')
    if (rels) {
      for (const rel of Array.from(parseXml(rels).getElementsByTagName('Relationship'))) {
        this.rels.set(rel.getAttribute('Id') ?? '', { target: rel.getAttribute('Target') ?? '', external: rel.getAttribute('TargetMode') === 'External' })
      }
    }
    const styles = this.text('word/styles.xml')
    if (styles) {
      for (const style of Array.from(parseXml(styles).getElementsByTagNameNS(W, 'style'))) {
        const name = attr(first(style, 'name'), 'val') ?? ''
        const outline = attr(first(first(style, 'pPr'), 'outlineLvl'), 'val')
        const match = name.match(/^heading\s*(\d)$/i) ?? (attr(style, 'styleId') ?? '').match(/^(?:Heading|Başlık|Baslik)(\d)$/i)
        const heading = match ? Number(match[1]) : name.toLowerCase() === 'title' ? 1 : outline !== null && Number(outline) < 3 ? Number(outline) + 1 : null
        this.styles.set(attr(style, 'styleId') ?? '', { name, heading })
      }
    }
    const numbering = this.text('word/numbering.xml')
    if (numbering) {
      const doc = parseXml(numbering)
      const abstracts = new Map<string, ListKind[]>()
      for (const abstract of Array.from(doc.getElementsByTagNameNS(W, 'abstractNum'))) {
        const levels: ListKind[] = []
        for (const lvl of kids(abstract).filter(kid => kid.localName === 'lvl')) {
          levels[Number(attr(lvl, 'ilvl')) || 0] = { ordered: attr(first(lvl, 'numFmt'), 'val') !== 'bullet', start: Number(attr(first(lvl, 'start'), 'val') ?? 1) || 1 }
        }
        abstracts.set(attr(abstract, 'abstractNumId') ?? '', levels)
      }
      for (const num of Array.from(doc.getElementsByTagNameNS(W, 'num'))) {
        const levels = [...(abstracts.get(attr(first(num, 'abstractNumId'), 'val') ?? '') ?? [])]
        for (const override of kids(num).filter(kid => kid.localName === 'lvlOverride')) {
          const index = Number(attr(override, 'ilvl')) || 0
          const start = attr(first(override, 'startOverride'), 'val')
          if (start && levels[index]) levels[index] = { ...levels[index], start: Number(start) || 1 }
        }
        this.numbering.set(attr(num, 'numId') ?? '', levels)
      }
    }
    const commentsXml = this.text('word/comments.xml')
    if (commentsXml) {
      for (const comment of Array.from(parseXml(commentsXml).getElementsByTagNameNS(W, 'comment'))) {
        const id = newCommentId()
        this.commentIds.set(attr(comment, 'id') ?? '', id)
        const text = Array.from(comment.getElementsByTagNameNS(W, 'p')).map(paragraph => Array.from(paragraph.getElementsByTagNameNS(W, 't')).map(t => t.textContent ?? '').join('')).join('\n').trim()
        this.comments.push({ id, author: attr(comment, 'author') ?? '', date: attr(comment, 'date') ?? new Date().toISOString(), text })
      }
    }
    const footnotesXml = this.text('word/footnotes.xml')
    if (footnotesXml) {
      for (const note of Array.from(parseXml(footnotesXml).getElementsByTagNameNS(W, 'footnote'))) {
        if (attr(note, 'type')) continue
        this.footnoteTexts.set(attr(note, 'id') ?? '', Array.from(note.getElementsByTagNameNS(W, 't')).map(t => t.textContent ?? '').join('').replace(/\s+/g, ' ').trim())
      }
    }
    const settings = this.text('word/settings.xml')
    if (settings) this.tracking = parseXml(settings).getElementsByTagNameNS(W, 'trackRevisions').length > 0
    const body = parseXml(main).getElementsByTagNameNS(W, 'body')[0]
    if (!body) throw new FormatError('Word belgesinde gövde yok.')
    return body
  }

  /* ---- runs ---- */

  private marks(props: Element | undefined, link: string | null): Marks {
    const marks: Marks = []
    if (props) {
      if (on(first(props, 'b'))) marks.push({ type: 'bold' })
      if (on(first(props, 'i'))) marks.push({ type: 'italic' })
      const underline = attr(first(props, 'u'), 'val')
      if (underline && underline !== 'none') marks.push({ type: 'underline' })
      if (on(first(props, 'strike')) || on(first(props, 'dstrike'))) marks.push({ type: 'strike' })
      const style: Record<string, string> = {}
      const font = first(props, 'rFonts')
      const family = attr(font, 'ascii') ?? attr(font, 'hAnsi')
      if (family) style.fontFamily = fontCss(family)
      const size = Number(attr(first(props, 'sz'), 'val'))
      if (size > 0) style.fontSize = `${size / 2}pt`
      const color = attr(first(props, 'color'), 'val')
      if (color && /^[0-9a-f]{6}$/i.test(color) && !(link && color.toUpperCase() === '0563C1')) style.color = `#${color.toLowerCase()}`
      if (Object.keys(style).length) marks.push({ type: 'textStyle', attrs: style })
      const highlight = attr(first(props, 'highlight'), 'val')
      const fill = attr(first(props, 'shd'), 'fill')
      const back = highlight && HIGHLIGHTS[highlight] ? HIGHLIGHTS[highlight] : fill && /^[0-9a-f]{6}$/i.test(fill) && fill.toLowerCase() !== 'ffffff' ? `#${fill.toLowerCase()}` : null
      if (back) marks.push({ type: 'highlight', attrs: { color: back } })
    }
    if (link) marks.push({ type: 'link', attrs: { href: link } })
    for (const id of this.openComments) marks.push({ type: 'comment', attrs: { id } })
    if (this.change) marks.push({ type: this.change.type, attrs: { author: this.change.author, date: this.change.date } })
    return marks
  }

  private image(element: Element): JSONContent | null {
    const blip = element.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip')[0]
    const id = blip?.getAttributeNS(R, 'embed') ?? blip?.getAttribute('r:embed')
      ?? element.getElementsByTagNameNS('urn:schemas-microsoft-com:vml', 'imagedata')[0]?.getAttributeNS(R, 'id') ?? null
    const rel = id ? this.rels.get(id) : undefined
    if (!rel || rel.external) return null
    const path = `word/${rel.target.replace(/^\/?word\//, '').replace(/^\//, '')}`
    const bytes = this.files[path]
    const mime = imageMime(path)
    if (!bytes || !mime) return null
    const extent = kids(element).find(kid => kid.localName === 'inline' || kid.localName === 'anchor')
    const size = extent && first(extent, 'extent')
    const width = size ? Math.round(Number(size.getAttribute('cx')) / EMU_PER_PX) : null
    const align = extent?.localName === 'anchor' ? extent.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'align')[0]?.textContent : null
    const wrap = align === 'left' || align === 'right' ? align : 'inline'
    const alt = extent ? first(extent, 'docPr')?.getAttribute('descr') ?? '' : ''
    return { type: 'image', attrs: { src: bytesToDataUrl(bytes, mime), alt: alt || null, width: width && width > 0 ? width : null, wrap } }
  }

  /** A complex field being read (`w:fldChar`): its instruction, and whether its shown result is skipped. */
  private field: { instruction: string; skipping: boolean; marks: Marks } | null = null

  /** Inline content of a paragraph; a page break inside it splits the paragraph (`'page'`). */
  private inline(element: Element, out: (JSONContent | 'page')[], link: string | null = null): void {
    for (const node of kids(element)) {
      switch (node.localName) {
        case 'r': {
          const marks = this.marks(first(node, 'rPr'), link)
          const fieldChar = first(node, 'fldChar')
          if (fieldChar) {
            const kind = attr(fieldChar, 'fldCharType')
            if (kind === 'begin') this.field = { instruction: '', skipping: false, marks }
            else if (kind === 'separate' && this.field) this.field.skipping = Boolean(mergeFieldName(this.field.instruction))
            else if (kind === 'end' && this.field) {
              const name = mergeFieldName(this.field.instruction)
              if (name) out.push(withMarks({ type: 'mergeField', attrs: { name } }, this.field.marks))
              this.field = null
            }
            break
          }
          if (this.field) {
            const instruction = first(node, 'instrText')
            if (instruction) this.field.instruction += instruction.textContent ?? ''
            if (instruction || this.field.skipping) break
          }
          for (const part of kids(node).flatMap(alternative)) {
            const push = (value: string) => out.push(marks.length ? { type: 'text', text: value, marks } : { type: 'text', text: value })
            switch (part.localName) {
              case 't': if (part.textContent) push(part.textContent); break
              case 'delText': if (part.textContent && this.change?.type === 'deletion') push(part.textContent); break
              case 'tab': push('\t'); break
              case 'noBreakHyphen': push('-'); break
              case 'br': out.push(attr(part, 'type') === 'page' ? 'page' : { type: 'hardBreak' }); break
              case 'cr': out.push({ type: 'hardBreak' }); break
              case 'footnoteReference': case 'endnoteReference': {
                const text = this.footnoteTexts.get(attr(part, 'id') ?? '')
                if (text) out.push({ type: 'footnote', attrs: { text } })
                break
              }
              case 'drawing': case 'pict': case 'object': {
                const image = this.image(part)
                if (image) out.push(image)
                break
              }
            }
          }
          break
        }
        case 'hyperlink': {
          const target = this.rels.get(node.getAttributeNS(R, 'id') ?? node.getAttribute('r:id') ?? '')
          this.inline(node, out, target?.external && /^(https?:|mailto:)/i.test(target.target) ? target.target : link)
          break
        }
        case 'oMath':
          out.push({ type: 'formula', attrs: { latex: ommlToLatex(node) } })
          break
        case 'oMathPara':
          for (const math of kids(node).filter(kid => kid.localName === 'oMath')) out.push({ type: 'formula', attrs: { latex: ommlToLatex(math) } })
          break
        case 'AlternateContent':
          for (const choice of alternative(node)) this.inline(choice, out, link)
          break
        case 'fldSimple': {
          const name = mergeFieldName(attr(node, 'instr') ?? '')
          if (name) out.push(withMarks({ type: 'mergeField', attrs: { name } }, this.marks(first(first(node, 'r'), 'rPr'), link)))
          else this.inline(node, out, link)
          break
        }
        case 'commentRangeStart': {
          const id = this.commentIds.get(attr(node, 'id') ?? '')
          if (id) this.openComments.add(id)
          break
        }
        case 'commentRangeEnd': {
          const id = this.commentIds.get(attr(node, 'id') ?? '')
          if (id) this.openComments.delete(id)
          break
        }
        case 'ins': case 'del': {
          const outer = this.change
          this.change = { type: node.localName === 'ins' ? 'insertion' : 'deletion', author: attr(node, 'author') ?? '', date: attr(node, 'date') ?? '' }
          this.inline(node, out, link)
          this.change = outer
          break
        }
        case 'pPr': case 'moveFrom': case 'proofErr': case 'bookmarkStart': case 'bookmarkEnd':
          break
        default:
          // ins, smartTag, fldSimple, sdt/sdtContent, customXml…: what they hold.
          this.inline(node, out, link)
      }
    }
  }

  /** One paragraph: its blocks (several when page breaks split it) and, for a list item, its list. */
  private paragraph(element: Element): { blocks: JSONContent[]; list: { id: string; level: number } | null } {
    const props = first(element, 'pPr')
    const attrs: Record<string, unknown> = {}
    const styleId = attr(first(props, 'pStyle'), 'val')
    const heading = styleId ? this.styles.get(styleId)?.heading ?? null : null
    const jc = attr(first(props, 'jc'), 'val')
    const align = jc === 'both' || jc === 'distribute' ? 'justify' : jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : null
    if (align) attrs.textAlign = align
    const spacing = first(props, 'spacing')
    if (spacing && (attr(spacing, 'lineRule') ?? 'auto') === 'auto' && attr(spacing, 'line')) {
      const lineHeight = lineHeightOf(Number(attr(spacing, 'line')) / 240)
      if (lineHeight) attrs.lineHeight = lineHeight
    }
    const numPr = first(props, 'numPr')
    const numId = attr(first(numPr, 'numId'), 'val')
    const list = numId && numId !== '0' ? { id: numId, level: Number(attr(first(numPr, 'ilvl'), 'val')) || 0 } : null
    const indent = first(props, 'ind')
    const left = Number(attr(indent, 'left') ?? attr(indent, 'start')) || 0
    if (!list && left > 0) attrs.indent = Math.min(8, Math.round(left / INDENT_TWIPS))
    const type = heading ? 'heading' : 'paragraph'
    if (heading) attrs.level = Math.min(3, heading)

    const pieces: (JSONContent | 'page')[] = []
    if (on(first(props, 'pageBreakBefore'))) pieces.push('page')
    this.inline(element, pieces)
    const blocks: JSONContent[] = []
    let current: JSONContent[] = []
    const flush = (always: boolean) => {
      if (current.length || always) blocks.push(current.length ? { type, attrs: { ...attrs }, content: current } : { type, attrs: { ...attrs } })
      current = []
    }
    let broke = false
    for (const piece of pieces) {
      if (piece === 'page') {
        flush(false)
        blocks.push({ type: 'pageBreak' })
        broke = true
      } else {
        current.push(piece)
      }
    }
    flush(!broke)
    // A centred paragraph holding only a picture: the picture is centred.
    for (const block of blocks) {
      if (block.attrs?.textAlign === 'center' && block.content?.length === 1 && block.content[0].type === 'image' && block.content[0].attrs?.wrap === 'inline') block.content[0].attrs.wrap = 'center'
    }
    return { blocks, list }
  }

  private table(element: Element): JSONContent {
    const grid = kids(first(element, 'tblGrid') ?? element).filter(kid => kid.localName === 'gridCol').map(col => Math.round(Number(attr(col, 'w')) / 15) || null)
    const rows: JSONContent[] = []
    /** The cell that began a vertical merge in each grid column. */
    const opened: (JSONContent | null)[] = []
    for (const tr of kids(element).filter(kid => kid.localName === 'tr')) {
      const header = Boolean(first(first(tr, 'trPr'), 'tblHeader'))
      const cells: JSONContent[] = []
      let column = Number(attr(first(first(tr, 'trPr'), 'gridBefore'), 'val')) || 0
      for (const tc of kids(tr).filter(kid => kid.localName === 'tc' || kid.localName === 'sdt')) {
        const cellElement = tc.localName === 'sdt' ? first(first(tc, 'sdtContent'), 'tc') : tc
        if (!cellElement) continue
        const props = first(cellElement, 'tcPr')
        const span = Number(attr(first(props, 'gridSpan'), 'val')) || 1
        const merge = first(props, 'vMerge')
        if (merge && attr(merge, 'val') !== 'restart' && opened[column]) {
          const origin = opened[column]!
          origin.attrs!.rowspan = Number(origin.attrs!.rowspan) + 1
          column += span
          continue
        }
        const widths = grid.slice(column, column + span)
        const cell: JSONContent = {
          type: header ? 'tableHeader' : 'tableCell',
          attrs: { colspan: span, rowspan: 1, colwidth: widths.length === span && widths.every(Boolean) ? widths : null },
          content: tidy(this.blocks(cellElement)),
        }
        for (let i = 0; i < span; i++) opened[column + i] = merge ? cell : null
        cells.push(cell)
        column += span
      }
      if (cells.length) rows.push({ type: 'tableRow', content: cells })
    }
    return { type: 'table', content: rows }
  }

  /** The blocks of a body, a cell or a header: lists gathered from their numbered paragraphs. */
  blocks(container: Element): JSONContent[] {
    const out: JSONContent[] = []
    /** Open lists, outermost first: the list node and its kind. */
    let stack: { id: string; node: JSONContent }[] = []
    const closeLists = () => { stack = [] }
    const addToList = (list: { id: string; level: number }, blocks: JSONContent[]) => {
      const kinds = this.numbering.get(list.id) ?? []
      const level = Math.min(list.level, stack.length)
      if (stack.length && stack[0].id !== list.id && level === 0) closeLists()
      stack = stack.slice(0, level + 1)
      if (stack.length === level + 1 && stack[level].id !== list.id) stack = stack.slice(0, level)
      if (stack.length <= level) {
        const kind = kinds[list.level] ?? { ordered: false, start: 1 }
        const node: JSONContent = kind.ordered ? { type: 'orderedList', attrs: { start: kind.start }, content: [] } : { type: 'bulletList', content: [] }
        if (level === 0) out.push(node)
        else {
          const parentItems = stack[level - 1].node.content!
          if (!parentItems.length) parentItems.push({ type: 'listItem', content: [{ type: 'paragraph' }] })
          parentItems.at(-1)!.content!.push(node)
        }
        stack.push({ id: list.id, node })
      }
      const [head, ...rest] = blocks
      const paragraph = head && (head.type === 'paragraph' || head.type === 'heading') ? { ...head, type: 'paragraph', attrs: { ...head.attrs, level: undefined } } : { type: 'paragraph' }
      stack[stack.length - 1].node.content!.push({ type: 'listItem', content: [paragraph] })
      out.push(...rest)
      if (rest.length) closeLists()
    }
    const visit = (element: Element) => {
      for (const node of kids(element)) {
        switch (node.localName) {
          case 'p': {
            const { blocks, list } = this.paragraph(node)
            if (list) addToList(list, blocks)
            else {
              closeLists()
              out.push(...blocks)
            }
            break
          }
          case 'tbl':
            closeLists()
            out.push(this.table(node))
            break
          case 'sdt': {
            const gallery = attr(first(first(first(node, 'sdtPr'), 'docPartObj'), 'docPartGallery'), 'val')
            if (gallery && /table of contents/i.test(gallery)) {
              closeLists()
              out.push({ type: 'tableOfContents' })
            } else {
              visit(node)
            }
            break
          }
          case 'sdtContent': case 'customXml': case 'ins': case 'smartTag':
            visit(node)
            break
        }
      }
    }
    visit(container)
    return out
  }

  pageSetup(body: Element): PageSetup {
    const section = kids(body).filter(kid => kid.localName === 'sectPr').at(-1)
    if (!section) return DEFAULT_PAGE_SETUP
    const size = first(section, 'pgSz')
    const margins = first(section, 'pgMar')
    const mm = (name: string, fallback: number) => {
      const value = Number(attr(margins, name))
      return Number.isFinite(value) && value > 0 ? Math.round(value / TWIPS_PER_MM * 10) / 10 : fallback
    }
    const width = Number(attr(size, 'w')) || 11906
    const height = Number(attr(size, 'h')) || 16838
    let header = ''
    let footer = ''
    let pageNumbers: PageNumberPlace = 'none'
    let numberFormat: PageNumberFormat = 'number'
    for (const reference of kids(section).filter(kid => (kid.localName === 'headerReference' || kid.localName === 'footerReference') && (attr(kid, 'type') ?? 'default') === 'default')) {
      const rel = this.rels.get(reference.getAttributeNS(R, 'id') ?? reference.getAttribute('r:id') ?? '')
      const xml = rel && this.text(`word/${rel.target.replace(/^\//, '')}`)
      if (!xml) continue
      const isHeader = reference.localName === 'headerReference'
      const lines: string[] = []
      for (const paragraph of Array.from(parseXml(xml).getElementsByTagNameNS(W, 'p'))) {
        const instructions = [...Array.from(paragraph.getElementsByTagNameNS(W, 'fldSimple')).map(field => attr(field, 'instr') ?? ''), ...Array.from(paragraph.getElementsByTagNameNS(W, 'instrText')).map(field => field.textContent ?? '')].join(' ')
        const textOf = Array.from(paragraph.getElementsByTagNameNS(W, 't')).map(t => t.textContent ?? '').join('').replace(/\s+/g, ' ').trim()
        if (/\bPAGE\b/.test(instructions)) {
          const jc = attr(first(first(paragraph, 'pPr'), 'jc'), 'val')
          pageNumbers = isHeader ? 'top-right' : jc === 'right' || jc === 'end' ? 'bottom-right' : 'bottom-center'
          numberFormat = /NUMPAGES/.test(instructions) ? 'number-of-total' : /^Sayfa/i.test(textOf) ? 'page-number' : 'number'
        } else if (textOf) {
          lines.push(textOf)
        }
      }
      if (isHeader) header = lines.join(' ')
      else footer = lines.join(' ')
    }
    return normalizePageSetup({
      orientation: width > height ? 'landscape' : 'portrait',
      margins: { top: mm('top', 25), right: mm('right', 25), bottom: mm('bottom', 25), left: mm('left', 25) },
      header, footer, pageNumbers, numberFormat,
    })
  }
}

/** The editor's model of a Word file's bytes. */
export function readDocx(bytes: Uint8Array): JSONContent {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new FormatError('Bu dosya bir Word belgesi değil ya da bozuk.')
  }
  const reader = new Reader(files)
  const body = reader.load()
  const blocks = tidy(reader.blocks(body))
  // Only the comments whose text came along (a comment on a deleted part has nothing to show).
  const used = new Set<string>()
  const walk = (node: JSONContent) => {
    node.marks?.forEach(mark => { if (mark.type === 'comment') used.add(String(mark.attrs?.id)) })
    node.content?.forEach(walk)
  }
  blocks.forEach(walk)
  const comments = reader.comments.filter(comment => used.has(comment.id))
  return { type: 'doc', attrs: { page: reader.pageSetup(body), comments: comments.length ? comments : null, track: reader.tracking ? true : null }, content: blocks }
}

export const docxFormat: DocumentFormat = {
  id: 'docx',
  description: 'Word belgesi',
  extensions: ['docx'],
  mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  keepsEverything: document => !hasTeacherBlocks(document),
  read: readDocx,
  write: writeDocx,
}
