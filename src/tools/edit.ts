import { HEADING_LEVELS } from '../editor/editor'
import { DEFAULT_LINE_HEIGHT, LINE_HEIGHTS } from '../editor/paragraph-format'
import { ICONS } from './icons'
import type { Tool, ToolContext, ToolGroup } from './tool'

const focused = ({ editor }: ToolContext) => editor.chain().focus()

export const undoTool: Tool = {
  id: 'undo',
  label: 'Geri Al',
  icon: ICONS.undo,
  keys: 'Ctrl+Z',
  isAvailable: ({ editor }) => editor.can().undo(),
  run: context => { focused(context).undo().run() },
}

export const redoTool: Tool = {
  id: 'redo',
  label: 'Yinele',
  icon: ICONS.redo,
  keys: 'Ctrl+Y',
  isAvailable: ({ editor }) => editor.can().redo(),
  run: context => { focused(context).redo().run() },
}

const normalTool: Tool = {
  id: 'paragraph',
  label: 'Normal metin',
  icon: ICONS.paragraph,
  keys: 'Ctrl+Alt+0',
  isActive: ({ editor }) => editor.isActive('paragraph'),
  run: context => { focused(context).setParagraph().run() },
}

const headingTools: Tool[] = HEADING_LEVELS.map(level => ({
  id: `heading${level}`,
  label: `Başlık ${level}`,
  icon: ICONS[`heading${level}`],
  keys: `Ctrl+Alt+${level}`,
  isActive: ({ editor }) => editor.isActive('heading', { level }),
  run: context => { focused(context).setHeading({ level }).run() },
}))

export const paragraphGroup: ToolGroup = {
  kind: 'group',
  id: 'paragraph',
  label: 'Paragraf',
  icon: ICONS.paragraph,
  tools: [normalTool, ...headingTools],
  iconOf: context => headingTools.find(tool => tool.isActive!(context))?.icon ?? ICONS.paragraph,
}

const listTools: Tool[] = [
  {
    id: 'bulletList',
    label: 'Madde işaretli liste',
    icon: ICONS.bulletList,
    keys: 'Ctrl+Shift+8',
    isActive: ({ editor }) => editor.isActive('bulletList'),
    run: context => { focused(context).toggleBulletList().run() },
  },
  {
    id: 'orderedList',
    label: 'Numaralı liste',
    icon: ICONS.orderedList,
    keys: 'Ctrl+Shift+7',
    isActive: ({ editor }) => editor.isActive('orderedList'),
    run: context => { focused(context).toggleOrderedList().run() },
  },
]

export const listGroup: ToolGroup = {
  kind: 'group',
  id: 'list',
  label: 'Liste',
  icon: ICONS.bulletList,
  tools: listTools,
  isMarked: context => listTools.some(tool => tool.isActive!(context)),
  iconOf: context => listTools.find(tool => tool.isActive!(context))?.icon ?? ICONS.bulletList,
}

const ALIGNMENTS = [
  { value: 'left', label: 'Sola Hizala', icon: ICONS.alignLeft, keys: 'Ctrl+Shift+L' },
  { value: 'center', label: 'Ortala', icon: ICONS.alignCenter, keys: 'Ctrl+Shift+E' },
  { value: 'right', label: 'Sağa Hizala', icon: ICONS.alignRight, keys: 'Ctrl+Shift+R' },
  { value: 'justify', label: 'İki Yana Yasla', icon: ICONS.alignJustify, keys: 'Ctrl+Shift+J' },
] as const

const alignTools: Tool[] = ALIGNMENTS.map(({ value, label, icon, keys }) => ({
  id: `align-${value}`,
  label,
  icon,
  keys,
  iconOnly: true,
  isActive: ({ editor }) => editor.isActive({ textAlign: value }),
  run: context => { focused(context).setTextAlign(value).run() },
}))

const blockAttributes = ({ editor }: ToolContext): { lineHeight?: string | null; indent?: number } =>
  editor.getAttributes(editor.isActive('heading') ? 'heading' : 'paragraph')

const indentTools: Tool[] = [
  {
    id: 'outdent',
    label: 'Girintiyi Azalt',
    icon: ICONS.outdent,
    keys: 'Shift+Tab',
    iconOnly: true,
    isAvailable: context => context.editor.isActive('listItem') || Number(blockAttributes(context).indent ?? 0) > 0,
    run: context => { focused(context).outdent().run() },
  },
  {
    id: 'indent',
    label: 'Girintiyi Artır',
    icon: ICONS.indent,
    keys: 'Tab',
    iconOnly: true,
    isAvailable: context => context.editor.can().indent(),
    run: context => { focused(context).indent().run() },
  },
]

const lineHeightTools: Tool[] = LINE_HEIGHTS.map(value => ({
  id: `lineHeight-${value.replace('.', '_')}`,
  label: value === DEFAULT_LINE_HEIGHT ? `${value.replace('.', ',')} (varsayılan)` : Number(value).toFixed(value.length > 3 ? 2 : 1).replace('.', ','),
  icon: ICONS.lineHeight,
  isActive: context => (blockAttributes(context).lineHeight ?? DEFAULT_LINE_HEIGHT) === value,
  run: context => {
    if (value === DEFAULT_LINE_HEIGHT) focused(context).unsetLineHeight().run()
    else focused(context).setLineHeight(value).run()
  },
}))

/** How the paragraph lies: alignment, indent, line spacing (Word keeps these side by side too). */
export const alignGroup: ToolGroup = {
  kind: 'group',
  id: 'align',
  label: 'Hizalama',
  icon: ICONS.alignLeft,
  tools: [...alignTools, ...indentTools, ...lineHeightTools],
  sections: [
    { tools: alignTools },
    { title: 'Girinti', tools: indentTools },
    { title: 'Satır aralığı', tools: lineHeightTools },
  ],
  iconOf: context => alignTools.find(tool => tool.isActive!(context))?.icon ?? ICONS.alignLeft,
  isMarked: context => Number(blockAttributes(context).indent ?? 0) > 0 || Boolean(blockAttributes(context).lineHeight),
}
