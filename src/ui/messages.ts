const TOAST_MS = 5000
let toastTimer: ReturnType<typeof setTimeout> | undefined

/** Where the browser has popovers, the message shows above an open dialog too. */
export function showToast(message: string): void {
  const toast = document.querySelector<HTMLElement>('#toast')!
  toast.textContent = message
  toast.hidden = false
  if (typeof toast.showPopover === 'function') {
    // Shown again so that it comes above a dialog opened since.
    if (toast.matches(':popover-open')) toast.hidePopover()
    toast.showPopover()
  }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.hidden = true
    if (typeof toast.hidePopover === 'function' && toast.matches(':popover-open')) toast.hidePopover()
  }, TOAST_MS)
}

function answer(dialog: HTMLDialogElement): Promise<string> {
  dialog.returnValue = ''
  dialog.showModal()
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true })
  })
}

export type UnsavedAnswer = 'save' | 'discard' | 'cancel'

/** Asked before the open document gives way to another; Esc and the back button cancel. */
export async function askUnsavedChanges(name: string): Promise<UnsavedAnswer> {
  document.querySelector('#unsavedMessage')!.textContent = `"${name}" içinde kaydedilmemiş değişiklikler var.`
  const value = await answer(document.querySelector<HTMLDialogElement>('#unsavedDialog')!)
  return value === 'save' || value === 'discard' ? value : 'cancel'
}
