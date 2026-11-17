/**
 * The fonts offered, each with the free look-alikes Pardus and other Linux systems have (Carlito
 * for Calibri, Liberation for Arial / Times / Courier), so a document looks the same everywhere.
 * The first is the document's own font: choosing it removes the setting.
 */
export const FONTS = [
  { name: 'Calibri', css: 'Calibri, Carlito, "Liberation Sans", Arial, sans-serif' },
  { name: 'Arial', css: 'Arial, "Liberation Sans", Helvetica, sans-serif' },
  { name: 'Times New Roman', css: '"Times New Roman", "Liberation Serif", Times, serif' },
  { name: 'Verdana', css: 'Verdana, "DejaVu Sans", sans-serif' },
  { name: 'Georgia', css: 'Georgia, "DejaVu Serif", serif' },
  { name: 'Comic Sans MS', css: '"Comic Sans MS", "Comic Neue", cursive' },
  { name: 'Courier New', css: '"Courier New", "Liberation Mono", monospace' },
] as const

/** Word's list of sizes, in points; "Büyüt" and "Küçült" step through it. */
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72] as const

/** The size of text without a size of its own: the paragraph's, or the heading's (app.css). */
export const DEFAULT_SIZE = 12
export const HEADING_SIZES: Readonly<Record<number, number>> = { 1: 20, 2: 16, 3: 13 }

/** Word's standard colours, darker ones first. */
export const TEXT_COLORS = [
  { name: 'Siyah', value: '#000000' },
  { name: 'Gri', value: '#7f7f7f' },
  { name: 'Koyu kırmızı', value: '#c00000' },
  { name: 'Kırmızı', value: '#ff0000' },
  { name: 'Turuncu', value: '#ffc000' },
  { name: 'Yeşil', value: '#00b050' },
  { name: 'Mavi', value: '#0070c0' },
  { name: 'Lacivert', value: '#002060' },
  { name: 'Mor', value: '#7030a0' },
] as const

/** Light enough that black text stays easy to read on them, on screen and on paper. */
export const HIGHLIGHT_COLORS = [
  { name: 'Sarı', value: '#fff176' },
  { name: 'Yeşil', value: '#a5f3a5' },
  { name: 'Mavi', value: '#a5e8f6' },
  { name: 'Pembe', value: '#f9b4e4' },
  { name: 'Turuncu', value: '#ffd08a' },
] as const
