const KEY = 'awDOC.cevaplariGoster'

/**
 * Whether the right choices show (a green ring on their letter). Only on screen, never printed;
 * it can be turned off so a class watching the board does not see them. Kept on this device.
 */
export function answersShown(): boolean {
  return document.querySelector('#editorHost')?.classList.contains('show-answers') ?? false
}

export function setAnswersShown(shown: boolean): void {
  document.querySelector('#editorHost')?.classList.toggle('show-answers', shown)
  try {
    localStorage.setItem(KEY, shown ? 'evet' : 'hayir')
  } catch {
    // The choice still holds for this visit.
  }
}

/** At start: shown unless turned off here before. */
export function restoreAnswersShown(): void {
  let shown = true
  try {
    shown = localStorage.getItem(KEY) !== 'hayir'
  } catch {
    // Shown.
  }
  document.querySelector('#editorHost')?.classList.toggle('show-answers', shown)
}
