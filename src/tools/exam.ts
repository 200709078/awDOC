import { currentQuestion, DEFAULT_CHOICES, totalPoints, type ChoicesLayout } from '../editor/question'
import { showPointsDialog } from '../ui/points-dialog'
import { answersShown, setAnswersShown } from '../ui/answers'
import { showExamDialog } from '../ui/exam-dialog'
import { showBookletDialog } from '../ui/booklet-dialog'
import { showBankAddDialog, showBankDialog } from '../ui/bank-dialog'
import { ICONS } from './icons'
import type { Tool, ToolContext, ToolGroup } from './tool'

const inQuestion = ({ editor }: ToolContext) => currentQuestion(editor.state) !== null

const hasChoices = ({ editor }: ToolContext) => {
  const question = currentQuestion(editor.state)
  return question?.lastChild?.type.name === 'choices'
}

const layoutOf = ({ editor }: ToolContext): ChoicesLayout | null => {
  const question = currentQuestion(editor.state)
  return question?.lastChild?.type.name === 'choices' ? question.lastChild.attrs.layout as ChoicesLayout : null
}

const multipleChoiceTool: Tool = {
  id: 'multipleChoice',
  label: 'Çoktan seçmeli soru',
  icon: ICONS.multipleChoice,
  run: ({ editor }) => { editor.chain().focus().insertQuestion(DEFAULT_CHOICES).run() },
}

const openQuestionTool: Tool = {
  id: 'openQuestion',
  label: 'Açık uçlu soru',
  icon: ICONS.openQuestion,
  run: ({ editor }) => { editor.chain().focus().insertQuestion(0).run() },
}

const addChoiceTool: Tool = {
  id: 'addChoice',
  label: 'Şık ekle',
  icon: ICONS.addChoice,
  isAvailable: ({ editor }) => editor.can().addChoice(),
  run: ({ editor }) => { editor.chain().focus().addChoice().run() },
}

const removeChoiceTool: Tool = {
  id: 'removeChoice',
  label: 'Şıkkı sil',
  icon: ICONS.removeChoice,
  isAvailable: ({ editor }) => editor.can().removeChoice(),
  run: ({ editor }) => { editor.chain().focus().removeChoice().run() },
}

const layoutTool = (layout: ChoicesLayout, id: string, label: string, icon: string): Tool => ({
  id,
  label,
  icon,
  isAvailable: hasChoices,
  isActive: context => layoutOf(context) === layout,
  run: ({ editor }) => { editor.chain().focus().setChoicesLayout(layout).run() },
})

const pointsTool: Tool = {
  id: 'points',
  label: 'Puan…',
  icon: ICONS.points,
  isAvailable: inQuestion,
  run: ({ editor }) => showPointsDialog(editor),
}

const moveUpTool: Tool = {
  id: 'moveQuestionUp',
  label: 'Soruyu yukarı taşı',
  icon: ICONS.moveUp,
  isAvailable: ({ editor }) => editor.can().moveQuestion(-1),
  run: ({ editor }) => { editor.chain().focus().moveQuestion(-1).run() },
}

const moveDownTool: Tool = {
  id: 'moveQuestionDown',
  label: 'Soruyu aşağı taşı',
  icon: ICONS.moveDown,
  isAvailable: ({ editor }) => editor.can().moveQuestion(1),
  run: ({ editor }) => { editor.chain().focus().moveQuestion(1).run() },
}

const deleteQuestionTool: Tool = {
  id: 'deleteQuestion',
  label: 'Soruyu sil',
  icon: ICONS.deleteQuestion,
  isAvailable: inQuestion,
  run: ({ editor }) => { editor.chain().focus().deleteQuestion().run() },
}

const correctChoiceTool: Tool = {
  id: 'correctChoice',
  label: 'Doğru şık',
  icon: ICONS.correctChoice,
  isAvailable: ({ editor }) => editor.can().toggleCorrectChoice(),
  isActive: ({ editor }) => editor.isActive('choice', { correct: true }),
  run: ({ editor }) => {
    // Marking an answer shows the answers: one sees what one marked.
    if (!answersShown()) setAnswersShown(true)
    editor.chain().focus().toggleCorrectChoice().run()
  },
}

const showAnswersTool: Tool = {
  id: 'showAnswers',
  label: 'Doğru cevapları göster',
  icon: ICONS.showAnswers,
  isActive: () => answersShown(),
  run: ({ editor }) => {
    setAnswersShown(!answersShown())
    // The toolbar redraws on a transaction.
    editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false))
  },
}

const answerKeyTool: Tool = {
  id: 'answerKey',
  label: 'Cevap anahtarı',
  icon: ICONS.answerKey,
  run: ({ editor }) => { editor.chain().focus().insertAnswerKey().run() },
}

const examPaperTool: Tool = {
  id: 'examPaper',
  label: 'Sınav kâğıdı…',
  icon: ICONS.examPaper,
  run: ({ editor, session }) => showExamDialog(editor, session),
}

const questionRowTool: Tool = {
  id: 'questionRow',
  label: 'Yan yana iki soru',
  icon: ICONS.questionRow,
  run: ({ editor }) => { editor.chain().focus().insertQuestionRow().run() },
}

const pairTool: Tool = {
  id: 'pairQuestions',
  label: 'Sonraki soruyla yan yana',
  icon: ICONS.pairQuestions,
  isAvailable: ({ editor }) => editor.can().pairWithNextQuestion(),
  run: ({ editor }) => { editor.chain().focus().pairWithNextQuestion().run() },
}

const unpairTool: Tool = {
  id: 'unpairQuestions',
  label: 'Yan yana olmaktan çıkar',
  icon: ICONS.unpairQuestions,
  isAvailable: ({ editor }) => editor.can().unpairQuestions(),
  run: ({ editor }) => { editor.chain().focus().unpairQuestions().run() },
}

const bookletTool: Tool = {
  id: 'booklet',
  label: 'B kitapçığı…',
  icon: ICONS.booklet,
  run: ({ editor, session }) => showBookletDialog(editor, session),
}

const bankAddTool: Tool = {
  id: 'bankAdd',
  label: 'Bankaya ekle…',
  icon: ICONS.bankAdd,
  run: ({ editor, session }) => { void showBankAddDialog(editor, session) },
}

const bankTool: Tool = {
  id: 'bank',
  label: 'Soru bankası…',
  icon: ICONS.bank,
  run: ({ editor, session }) => { void showBankDialog(editor, session) },
}

const bankTools = [bankTool, bankAddTool]

const insertTools = [examPaperTool, multipleChoiceTool, openQuestionTool, questionRowTool]
const answerTools = [correctChoiceTool, showAnswersTool, answerKeyTool, bookletTool]
const choiceTools = [
  addChoiceTool,
  removeChoiceTool,
  layoutTool('list', 'choicesList', 'Şıklar alt alta', ICONS.choicesList),
  layoutTool('row', 'choicesRow', 'Şıklar yan yana', ICONS.choicesRow),
  layoutTool('grid', 'choicesGrid', 'Şıklar iki sütun', ICONS.choicesGrid),
]
const questionTools = [pointsTool, pairTool, unpairTool, moveUpTool, moveDownTool, deleteQuestionTool]

/** Sınav ▾: questions and their choices. A plain document never needs to open it. */
export const examGroup: ToolGroup = {
  kind: 'group',
  id: 'exam',
  label: 'Sınav',
  icon: ICONS.exam,
  tools: [...insertTools, ...bankTools, ...choiceTools, ...answerTools, ...questionTools],
  isMarked: inQuestion,
  sections: [
    { title: 'Soru ekle', tools: insertTools },
    { title: 'Soru bankası', tools: bankTools },
    { title: 'Şıklar', tools: choiceTools },
    { title: 'Cevaplar', tools: answerTools },
    {
      titleOf: ({ editor }) => {
        const total = totalPoints(editor.state.doc)
        return total > 0 ? `Soru (toplam ${String(total).replace('.', ',')} puan)` : 'Soru'
      },
      tools: questionTools,
    },
  ],
}
