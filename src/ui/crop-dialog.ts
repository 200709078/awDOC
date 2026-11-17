import type { Editor } from '@tiptap/core'
import { selectedImage } from '../editor/image'

/** The frame, in the shown picture's pixels. */
interface Frame {
  left: number
  top: number
  width: number
  height: number
}

const MIN_SIDE = 16
const JPEG_QUALITY = 0.9

function clampFrame(frame: Frame, width: number, height: number): Frame {
  const w = Math.min(Math.max(frame.width, MIN_SIDE), width)
  const h = Math.min(Math.max(frame.height, MIN_SIDE), height)
  return { left: Math.min(Math.max(frame.left, 0), width - w), top: Math.min(Math.max(frame.top, 0), height - h), width: w, height: h }
}

/** The frame moved or one of its sides dragged by (dx, dy). */
function dragFrame(start: Frame, handle: string, dx: number, dy: number, width: number, height: number): Frame {
  if (handle === 'move') return clampFrame({ ...start, left: start.left + dx, top: start.top + dy }, width, height)
  let { left, top } = start
  let right = start.left + start.width
  let bottom = start.top + start.height
  if (handle.includes('w')) left = Math.min(Math.max(0, left + dx), right - MIN_SIDE)
  if (handle.includes('e')) right = Math.max(Math.min(width, right + dx), left + MIN_SIDE)
  if (handle.includes('n')) top = Math.min(Math.max(0, top + dy), bottom - MIN_SIDE)
  if (handle.includes('s')) bottom = Math.max(Math.min(height, bottom + dy), top + MIN_SIDE)
  return { left, top, width: right - left, height: bottom - top }
}

/** The part of the picture inside the frame, as a new data address (PNG stays PNG, the rest JPEG). */
async function cropped(src: string, frame: Frame, shownWidth: number): Promise<{ src: string; ratio: number }> {
  const image = new Image()
  image.src = src
  await image.decode()
  const scale = image.naturalWidth / shownWidth
  const sx = Math.round(frame.left * scale)
  const sy = Math.round(frame.top * scale)
  const sw = Math.max(1, Math.round(frame.width * scale))
  const sh = Math.max(1, Math.round(frame.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const context = canvas.getContext('2d')!
  const png = src.startsWith('data:image/png') || src.startsWith('data:image/gif') || src.startsWith('data:image/webp')
  if (!png) {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, sw, sh)
  }
  context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh)
  return { src: png ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', JPEG_QUALITY), ratio: sw / image.naturalWidth }
}

/** Kırp: a frame over the selected picture; what is outside it goes. Ctrl+Z brings it back. */
export function showCropDialog(editor: Editor): void {
  const image = selectedImage(editor.state)
  if (!image) return
  const dialog = document.querySelector<HTMLDialogElement>('#cropDialog')!
  const picture = document.querySelector<HTMLImageElement>('#cropImage')!
  const box = document.querySelector<HTMLElement>('#cropBox')!
  let frame: Frame = { left: 0, top: 0, width: 0, height: 0 }
  // Measured while the window is open (closed, the picture has no size).
  let shown = { width: 0, height: 0 }
  const size = () => {
    if (picture.clientWidth) shown = { width: picture.clientWidth, height: picture.clientHeight }
    return shown
  }
  const draw = () => {
    box.style.left = `${frame.left}px`
    box.style.top = `${frame.top}px`
    box.style.width = `${frame.width}px`
    box.style.height = `${frame.height}px`
  }
  const whole = () => {
    const { width, height } = size()
    frame = { left: 0, top: 0, width, height }
    draw()
  }
  picture.onload = whole
  picture.src = image.src

  box.onpointerdown = event => {
    event.preventDefault()
    const handle = (event.target as HTMLElement).dataset.handle ?? 'move'
    const start = { ...frame }
    const { width, height } = size()
    box.setPointerCapture(event.pointerId)
    box.onpointermove = move => {
      frame = dragFrame(start, handle, move.clientX - event.clientX, move.clientY - event.clientY, width, height)
      draw()
    }
    box.onpointerup = () => {
      box.onpointermove = null
      box.onpointerup = null
    }
  }
  document.querySelector<HTMLButtonElement>('#cropReset')!.onclick = whole

  dialog.onclose = async () => {
    const whole = frame.left <= 0.5 && frame.top <= 0.5 && Math.abs(frame.width - shown.width) <= 0.5 && Math.abs(frame.height - shown.height) <= 0.5
    if (dialog.returnValue !== 'crop' || whole || !shown.width) {
      editor.commands.focus()
      return
    }
    const result = await cropped(image.src, frame, shown.width)
    const shownInDocument = image.width ?? (await naturalWidth(image.src))
    editor.chain().focus().setNodeSelection(image.pos).replaceSelectedImage(result.src, shownInDocument * result.ratio).run()
  }
  dialog.returnValue = ''
  dialog.showModal()
  if (picture.complete && picture.naturalWidth) whole()
}

async function naturalWidth(src: string): Promise<number> {
  const image = new Image()
  image.src = src
  await image.decode()
  return image.naturalWidth
}
