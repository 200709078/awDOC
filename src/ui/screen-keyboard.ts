import { showToast } from './messages'

/** Typing fields: the document itself and the dialogs' text boxes; a tick box needs no keys. */
const TEXT_FIELD = 'input:not([type="file"], [type="checkbox"], [type="radio"]), textarea, [contenteditable="true"]'

const isTextField = (target: EventTarget | null) => target instanceof Element && target.matches(TEXT_FIELD)

/** Keeps the system's on-screen keyboard open while a text field has the focus (smart boards only). */
export function connectScreenKeyboard(keyboard: DesktopScreenKeyboard): void {
  let requestId: string | null = null
  document.addEventListener('focusin', ({ target }) => {
    if (!isTextField(target)) return
    requestId ??= crypto.randomUUID()
    void keyboard.show(requestId).catch(() => 'unavailable' as const).then(result => {
      if (result === 'unavailable') showToast('Ekran klavyesi açılamadı. ETA Klavye veya Onboard kurulu olmalı.')
    })
  })
  document.addEventListener('focusout', ({ target, relatedTarget }) => {
    // The keyboard's window takes the focus for a moment; the field is still the one in use.
    if (!requestId || !isTextField(target) || isTextField(relatedTarget) || !document.hasFocus()) return
    keyboard.hide(requestId)
    requestId = null
  })
}
