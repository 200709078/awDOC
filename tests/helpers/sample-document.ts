import { makePng } from './make-png';

/**
 * A document with something of everything Word and LibreOffice files must carry: headings, text
 * styles, alignment, spacing, indents, nested lists, a table with merged cells, a picture, a link,
 * a formula, a page break, the page (landscape, margins, header, footer, numbers) and two questions.
 */
export function sampleDocument(): Record<string, unknown> {
  const png = `data:image/png;base64,${makePng(40, 20, [30, 90, 200]).toString('base64')}`;
  const text = (value: string, marks?: unknown[]) => (marks ? { type: 'text', text: value, marks } : { type: 'text', text: value });
  return {
    type: 'doc',
    attrs: {
      page: {
        orientation: 'landscape',
        margins: { top: 20, right: 15, bottom: 20, left: 15 },
        header: 'Fen Lisesi',
        footer: 'Başarılar',
        pageNumbers: 'bottom-right',
        numberFormat: 'number-of-total',
      },
      comments: [{ id: 'yorum1', author: 'Ayşe Öğretmen', date: '2026-11-18T09:00:00Z', text: 'Bu cümleyi kontrol et.' }],
    },
    content: [
      { type: 'heading', attrs: { level: 1, textAlign: 'center' }, content: [text('Birinci Başlık')] },
      { type: 'heading', attrs: { level: 2 }, content: [text('İkinci başlık')] },
      {
        type: 'paragraph',
        attrs: { lineHeight: '1.5', indent: 1, textAlign: 'justify' },
        content: [
          text('Kalın', [{ type: 'bold' }]), text(' ve '), text('eğik', [{ type: 'italic' }]), text(', '),
          text('altı çizili', [{ type: 'underline' }]), text(', '), text('üstü çizili', [{ type: 'strike' }]), text(', '),
          text('kırmızı Arial 16', [{ type: 'textStyle', attrs: { color: '#c00000', fontSize: '16pt', fontFamily: 'Arial, "Liberation Sans", Helvetica, sans-serif' } }]),
          text(', '), text('vurgulu', [{ type: 'highlight', attrs: { color: '#fff176' } }]),
          text('  iki boşluk\tsekme '),
          text('bağlantı', [{ type: 'link', attrs: { href: 'https://madematik.com/' } }]),
          { type: 'hardBreak' },
          text('formül: '), { type: 'formula', attrs: { latex: '\\frac{a+1}{2}+x^{2}+\\sqrt{b}' } },
        ],
      },
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [text('madde bir')] }, {
            type: 'orderedList', attrs: { start: 1 }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('alt numara')] }] }],
          }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [text('madde iki')] }] },
        ],
      },
      { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('üçten başlar')] }] }] },
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: [
            { type: 'tableHeader', attrs: { colspan: 2, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [text('Başlık iki sütun')] }] },
            { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [text('Üç')] }] },
          ] },
          { type: 'tableRow', content: [
            { type: 'tableCell', attrs: { colspan: 1, rowspan: 2, colwidth: null }, content: [{ type: 'paragraph', content: [text('İki satır')] }] },
            { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [text('b1')] }] },
            { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [text('c1')] }] },
          ] },
          { type: 'tableRow', content: [
            { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [text('b2')] }] },
            { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [text('c2')] }] },
          ] },
        ],
      },
      { type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'image', attrs: { src: png, alt: 'mavi', width: 120, wrap: 'center' } }] },
      { type: 'paragraph', content: [{ type: 'image', attrs: { src: png, alt: null, width: 80, wrap: 'right' } }, text('Yanında yazı olan resim.'), { type: 'footnote', attrs: { text: 'Kaynak: ders kitabı, s. 12.' } }] },
      { type: 'pageBreak' },
      {
        type: 'question', attrs: { points: 10 }, content: [
          { type: 'paragraph', content: [text('Birinci soru?')] },
          { type: 'choices', attrs: { layout: 'list' }, content: [
            { type: 'choice', attrs: { correct: false }, content: [text('bir')] },
            { type: 'choice', attrs: { correct: true }, content: [text('iki')] },
          ] },
        ],
      },
      {
        type: 'question', attrs: { points: null }, content: [
          { type: 'paragraph', content: [text('İkinci soru?')] },
          { type: 'choices', attrs: { layout: 'row' }, content: [
            { type: 'choice', attrs: { correct: false }, content: [text('x')] },
            { type: 'choice', attrs: { correct: false }, content: [text('y')] },
          ] },
        ],
      },
      { type: 'paragraph', content: [
        text('Yorumlu ', [{ type: 'comment', attrs: { id: 'yorum1' } }]), text('cümle', [{ type: 'comment', attrs: { id: 'yorum1' } }]),
        text(' eklenen', [{ type: 'insertion', attrs: { author: 'Ali', date: '2026-11-18T10:00:00Z' } }]),
        text(' silinen', [{ type: 'deletion', attrs: { author: 'Ali', date: '2026-11-18T10:00:00Z' } }]),
      ] },
      { type: 'paragraph', content: [text('Son paragraf.')] },
    ],
  };
}
