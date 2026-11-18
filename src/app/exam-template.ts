import type { JSONContent } from '@tiptap/core'
import type { PageSetup } from '../editor/page-setup'

/** What the exam header says; kept on the device for the next exam. */
export interface ExamDetails {
  year: string
  school: string
  grade: string
  subject: string
  exam: string
  teacher: string
}

const KEY = 'awDOC.sinavBilgileri'

/** The school year a date falls in: from September on, this year and the next. */
export function schoolYear(date = new Date()): string {
  const year = date.getFullYear()
  return date.getMonth() >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

export function storedExamDetails(): ExamDetails {
  const empty: ExamDetails = { year: schoolYear(), school: '', grade: '', subject: '', exam: '', teacher: '' }
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<ExamDetails>
    // The year is always this school year's: last year's exam is not this one.
    return { ...empty, ...Object.fromEntries(Object.entries(stored).filter(([, value]) => typeof value === 'string')), year: schoolYear() }
  } catch {
    return empty
  }
}

export function storeExamDetails(details: ExamDetails): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(details))
  } catch {
    // Only not remembered.
  }
}

const upper = (text: string) => text.trim().toLocaleUpperCase('tr-TR')
const text = (value: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'text', text: value, ...(marks ? { marks } : {}) })
const bold = [{ type: 'bold' }]

function paragraph(content: JSONContent[] = [], align?: string): JSONContent {
  return { type: 'paragraph', ...(align ? { attrs: { textAlign: align } } : {}), ...(content.length ? { content } : {}) }
}

function cell(label: string): JSONContent {
  return { type: 'tableCell', content: [paragraph([text(label, bold)])] }
}

/**
 * The header of an exam paper, as Turkish schools write it: the year and the school, then the
 * class, the subject and the exam, in capitals; under it the student's name, number, class and
 * mark to fill in. Ordinary paragraphs and a table: everything can be changed afterwards.
 */
export function examHeader(details: ExamDetails): JSONContent[] {
  const first = [details.year && `${upper(details.year)} EĞİTİM-ÖĞRETİM YILI`, upper(details.school)].filter(Boolean).join(' ')
  const subject = details.subject && `${upper(details.subject)} DERSİ`
  const exam = details.exam && `${upper(details.exam)} SINAVI`
  const second = [upper(details.grade), subject, exam].filter(Boolean).join(' ')
  const lines = [first, second].filter(Boolean)
  return [
    ...lines.map(line => paragraph([text(line, bold)], 'center')),
    {
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell('Adı Soyadı:'), cell('Numarası:')] },
        { type: 'tableRow', content: [cell('Sınıfı:'), cell('Puanı:')] },
      ],
    },
  ]
}

/** A whole new exam paper: the header, a line for directions, a first question and the wishes at the end. */
export function examPaper(details: ExamDetails, twoColumns = false): JSONContent {
  const signature = details.teacher.trim()
    ? [paragraph([text(details.teacher.trim())], 'right'), ...(details.subject.trim() ? [paragraph([text(`${details.subject.trim()} Öğretmeni`)], 'right')] : [])]
    : []
  const page: Partial<PageSetup> = {
    margins: { top: 15, right: 15, bottom: 15, left: 15 },
    pageNumbers: 'bottom-center',
    numberFormat: 'number-of-total',
  }
  return {
    type: 'doc',
    attrs: { page },
    content: [
      ...examHeader(details),
      paragraph([text('Açıklama: ', bold), text('Süre 40 dakikadır. Her sorunun puanı yanında yazılıdır.')]),
      // The questions in two columns: the title, the student table and the directions span the page.
      ...(twoColumns ? [{ type: 'columnsStart' }] : []),
      {
        type: 'question',
        content: [paragraph(), { type: 'choices', content: Array.from({ length: 5 }, () => ({ type: 'choice' })) }],
      },
      paragraph(),
      paragraph([text('Başarılar dilerim.')], 'right'),
      ...signature,
    ],
  }
}
