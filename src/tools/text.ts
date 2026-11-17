import { DEFAULT_SIZE, FONT_SIZES, FONTS, HEADING_SIZES, HIGHLIGHT_COLORS, TEXT_COLORS } from '../editor/fonts'
import { ICONS } from './icons'
import type { Tool, ToolContext, ToolGroup } from './tool'

const focused = ({ editor }: ToolContext) => editor.chain().focus()
const textStyle = ({ editor }: ToolContext) => editor.getAttributes('textStyle') as { color?: string; fontSize?: string; fontFamily?: string }

const mark = (id: 'bold' | 'italic' | 'underline' | 'strike', label: string, keys?: string): Tool => ({
  id,
  label,
  icon: ICONS[id],
  keys,
  iconOnly: true,
  isActive: ({ editor }) => editor.isActive(id),
  run: context => { focused(context).toggleMark(id).run() },
})

const markTools = [
  mark('bold', 'Kalın', 'Ctrl+B'),
  mark('italic', 'İtalik', 'Ctrl+I'),
  mark('underline', 'Altı Çizili', 'Ctrl+U'),
  mark('strike', 'Üstü Çizili'),
]

/** The size under the cursor in points: its own, or else the paragraph's or heading's. */
export function currentSize(context: ToolContext): number {
  const own = Number.parseFloat(textStyle(context).fontSize ?? '')
  if (Number.isFinite(own)) return own
  const level = context.editor.isActive('heading') ? Number(context.editor.getAttributes('heading').level) : 0
  return HEADING_SIZES[level] ?? DEFAULT_SIZE
}

const setSize = (context: ToolContext, size: number | undefined) => {
  if (size !== undefined) focused(context).setFontSize(`${size}pt`).run()
}

const sizeTools: Tool[] = [
  {
    id: 'shrinkText',
    label: 'Yazıyı Küçült',
    icon: ICONS.shrinkText,
    iconOnly: true,
    isAvailable: context => currentSize(context) > FONT_SIZES[0],
    run: context => setSize(context, [...FONT_SIZES].reverse().find(size => size < currentSize(context))),
  },
  {
    id: 'growText',
    label: 'Yazıyı Büyüt',
    icon: ICONS.growText,
    iconOnly: true,
    isAvailable: context => currentSize(context) < FONT_SIZES.at(-1)!,
    run: context => setSize(context, FONT_SIZES.find(size => size > currentSize(context))),
  },
]

let colorInput: HTMLInputElement | undefined

/** The system's colour picker, only through "Diğer renk…" (the family's rule: it is awkward on a board). */
const otherColorTool: Tool = {
  id: 'otherColor',
  label: 'Diğer renk…',
  icon: ICONS.palette,
  iconOnly: true,
  run: context => {
    colorInput ??= Object.assign(document.createElement('input'), { type: 'color', hidden: true })
    if (!colorInput.isConnected) document.body.append(colorInput)
    colorInput.value = textStyle(context).color ?? '#000000'
    colorInput.onchange = () => { focused(context).setColor(colorInput!.value).run() }
    colorInput.click()
  },
}

const colorTools: Tool[] = [
  {
    id: 'color-auto',
    label: 'Otomatik renk',
    icon: '',
    swatch: '',
    isActive: context => !textStyle(context).color,
    run: context => { focused(context).unsetColor().run() },
  },
  ...TEXT_COLORS.map(({ name, value }): Tool => ({
    id: `color-${value.slice(1)}`,
    label: `Yazı rengi: ${name}`,
    icon: '',
    swatch: value,
    isActive: context => textStyle(context).color?.toLowerCase() === value,
    run: context => { focused(context).setColor(value).run() },
  })),
  otherColorTool,
]

const highlightTools: Tool[] = [
  {
    id: 'highlight-none',
    label: 'Vurgu yok',
    icon: '',
    swatch: '',
    isActive: ({ editor }) => !editor.isActive('highlight'),
    run: context => { focused(context).unsetHighlight().run() },
  },
  ...HIGHLIGHT_COLORS.map(({ name, value }): Tool => ({
    id: `highlight-${value.slice(1)}`,
    label: `Vurgu: ${name}`,
    icon: '',
    swatch: value,
    isActive: ({ editor }) => editor.isActive('highlight', { color: value }),
    run: context => { focused(context).setHighlight({ color: value }).run() },
  })),
]

export const textGroup: ToolGroup = {
  kind: 'group',
  id: 'text',
  label: 'Yazı',
  icon: ICONS.text,
  staysOpen: true,
  tools: [...markTools, ...sizeTools, ...colorTools, ...highlightTools],
  sections: [
    { tools: markTools },
    { titleOf: context => `Boyut: ${currentSize(context)}`, tools: sizeTools },
    { title: 'Yazı rengi', tools: colorTools },
    { title: 'Vurgu', tools: highlightTools },
  ],
  // The line under the A takes the colour of the text under the cursor, as in Word.
  iconOf: context => ICONS.text.replace('<path d="M4 21h16"/>', `<path d="M4 21h16" stroke="${textStyle(context).color ?? 'currentColor'}" stroke-width="3"/>`),
  isMarked: context => markTools.some(tool => tool.isActive!(context)) || context.editor.isActive('highlight') || Boolean(textStyle(context).fontSize),
}

const fontTools: Tool[] = FONTS.map(({ name, css }, index): Tool => ({
  id: `font-${name.toLowerCase().replaceAll(' ', '-')}`,
  label: name,
  icon: ICONS.font,
  labelFont: css,
  isActive: context => (index === 0 ? !textStyle(context).fontFamily : textStyle(context).fontFamily === css),
  run: context => {
    if (index === 0) focused(context).unsetFontFamily().run()
    else focused(context).setFontFamily(css).run()
  },
}))

export const fontGroup: ToolGroup = {
  kind: 'group',
  id: 'font',
  label: 'Yazı Tipi',
  icon: ICONS.font,
  tools: fontTools,
  isMarked: context => Boolean(textStyle(context).fontFamily),
}
