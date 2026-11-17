import { isGroup, type Tool, type ToolbarItem, type ToolContext, type ToolGroup } from '../tools/tool'

/** Such as `ctrl+s`, `ctrl+shift+s`, `f11`. */
export function shortcutOf(event: KeyboardEvent): string {
  const ctrl = event.ctrlKey || event.metaKey
  const shift = event.shiftKey && (ctrl || event.key.length > 1)
  return `${ctrl ? 'ctrl+' : ''}${shift ? 'shift+' : ''}${event.key.toLowerCase()}`
}

const MENU_LABEL = 'Menüyü Aç'
const MENU_ICON = '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>'
/** While the menu is open its button shows a cross, which closes it (the family's rule, 2026-11-10). */
const CLOSE_LABEL = 'Menüyü Kapat'
const CLOSE_ICON = '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>'
const CARET_ICON = '<path d="M7 10l5 5 5-5"/>'
/** Space left under the open menu, so its shadow and rounded end stay on screen. */
const MENU_SCREEN_MARGIN_PX = 8

const svg = (icon: string, className = '') => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
  + ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${className ? ` class="${className}"` : ''}>${icon}</svg>`

function button(id: string, label: string, icon: string, hint = label): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.id = id
  element.className = 'toolbar__button'
  element.title = hint
  element.setAttribute('aria-label', label)
  element.innerHTML = `${svg(icon, 'toolbar__icon')}<span class="toolbar__label">${label}</span>`
  // The editor keeps the focus and its selection; the tool then works on what is selected.
  element.addEventListener('mousedown', event => event.preventDefault())
  return element
}

const hintOf = (tool: Tool) => (tool.keys ? `${tool.label} (${tool.keys})` : tool.label)

interface Control {
  readonly element: HTMLElement
  update(): void
}

interface GroupControl extends Control {
  readonly group: ToolGroup
  readonly isOpen: boolean
  setOpen(open: boolean): void
}

/**
 * Builds the toolbar and the app's shortcuts from the tool list. The row never scrolls: by width,
 * not by device, the items that do not fit move from the last one back into the ☰ menu. They stay
 * the same elements, so their states and IDs need no second copy; the styles show them with their
 * names there, and a group opens in place instead of as a window.
 */
export function mountToolbar(root: HTMLElement, items: readonly ToolbarItem[], context: ToolContext): { close(): boolean; update(): void } {
  const supported = items.filter(item => isGroup(item) || (item.isSupported?.(context) ?? true))
  const groups: GroupControl[] = []
  let menuOpen = false

  const toggle = button('toolbarMenuButton', MENU_LABEL, MENU_ICON)
  const menu = document.createElement('div')
  menu.id = 'toolbarMenu'
  menu.className = 'toolbar__menu'
  toggle.setAttribute('aria-controls', menu.id)
  const status = document.createElement('div')
  status.id = 'documentStatus'
  status.className = 'toolbar__status'
  status.setAttribute('aria-live', 'polite')

  const closeGroups = () => {
    for (const group of groups) group.setOpen(false)
  }
  const setMenuOpen = (open: boolean) => {
    menuOpen = open
    menu.hidden = !open
    toggle.setAttribute('aria-expanded', String(open))
    const label = open ? CLOSE_LABEL : MENU_LABEL
    toggle.title = label
    toggle.setAttribute('aria-label', label)
    toggle.querySelector('.toolbar__icon')!.innerHTML = open ? CLOSE_ICON : MENU_ICON
    if (open) menu.style.maxHeight = `${window.innerHeight - root.getBoundingClientRect().bottom - MENU_SCREEN_MARGIN_PX}px`
    else closeGroups()
  }
  /** After a choice: the group closes, and the menu too when the group was in it. */
  const chosen = (group?: ToolGroup) => {
    if (group?.staysOpen) return
    closeGroups()
    if (menuOpen) setMenuOpen(false)
  }

  const toolControl = (tool: Tool, group?: ToolGroup): Control => {
    const element = button(`tool-${tool.id}`, tool.label, tool.icon, hintOf(tool))
    if (tool.iconOnly) element.classList.add('toolbar__button--icon')
    element.addEventListener('click', () => {
      tool.run(context)
      chosen(group)
      update()
    })
    return {
      element,
      update: () => {
        element.disabled = !(tool.isAvailable?.(context) ?? true)
        if (tool.isActive) element.setAttribute('aria-pressed', String(tool.isActive(context)))
        if (tool.isMarked) element.classList.toggle('is-marked', tool.isMarked(context))
      },
    }
  }

  const groupControl = (group: ToolGroup): GroupControl => {
    const wrapper = document.createElement('div')
    wrapper.className = 'toolbar__group'
    const header = button(`group-${group.id}`, group.label, group.icon)
    header.classList.add('toolbar__group-button')
    header.insertAdjacentHTML('beforeend', svg(CARET_ICON, 'toolbar__caret'))
    header.setAttribute('aria-haspopup', 'true')
    header.setAttribute('aria-expanded', 'false')
    const panel = document.createElement('div')
    panel.id = `group-${group.id}-panel`
    panel.className = 'toolbar__panel'
    panel.setAttribute('role', 'group')
    panel.setAttribute('aria-label', group.label)
    panel.hidden = true
    if (group.tools.every(tool => tool.iconOnly)) panel.classList.add('toolbar__panel--icons')
    header.setAttribute('aria-controls', panel.id)
    const tools = group.tools.map(tool => toolControl(tool, group))
    panel.append(...tools.map(tool => tool.element))
    wrapper.append(header, panel)

    let open = false
    const control: GroupControl = {
      group,
      element: wrapper,
      get isOpen() {
        return open
      },
      setOpen: value => {
        open = value
        panel.hidden = !value
        header.setAttribute('aria-expanded', String(value))
        panel.classList.remove('is-right')
        // A window that would leave the screen on the right opens towards the left.
        if (value && !menu.contains(wrapper) && panel.getBoundingClientRect().right > window.innerWidth) panel.classList.add('is-right')
      },
      update: () => {
        for (const tool of tools) tool.update()
        const icon = group.iconOf?.(context) ?? group.icon
        const current = header.querySelector('.toolbar__icon')!
        if (current.innerHTML !== icon) current.innerHTML = icon
        header.classList.toggle('is-marked', Boolean(group.marksActive && group.tools.some(tool => tool.isActive?.(context))))
      },
    }
    header.addEventListener('click', () => {
      const wasOpen = open
      closeGroups()
      control.setOpen(!wasOpen)
    })
    groups.push(control)
    return control
  }

  const controls = supported.map(item => (isGroup(item) ? groupControl(item) : toolControl(item)))
  const inRow = controls.filter((_, index) => { const item = supported[index]; return isGroup(item) || !item.inMenu })
  const menuOnly = controls.filter((_, index) => { const item = supported[index]; return !isGroup(item) && item.inMenu })
  root.append(...inRow.map(control => control.element), status, toggle, menu)

  // Items that always live in the menu (Hakkında) sit at its end and keep the button shown.
  const fit = () => {
    setMenuOpen(false)
    toggle.hidden = menuOnly.length === 0
    status.before(...inRow.map(control => control.element))
    menu.append(...menuOnly.map(control => control.element))
    if (root.scrollWidth <= root.clientWidth) return
    toggle.hidden = false
    for (let index = inRow.length - 1; index >= 0 && root.scrollWidth > root.clientWidth; index--) {
      menu.prepend(inRow[index].element)
    }
  }

  toggle.addEventListener('click', () => setMenuOpen(!menuOpen))
  // In the capture phase, since the editor may stop a press on the document.
  document.addEventListener('pointerdown', event => {
    if (root.contains(event.target as Node)) return
    closeGroups()
    setMenuOpen(false)
  }, true)

  const close = (): boolean => {
    const group = groups.find(item => item.isOpen)
    if (group && !menuOpen) {
      group.setOpen(false)
      return true
    }
    if (menuOpen) {
      setMenuOpen(false)
      return true
    }
    return false
  }

  const update = () => {
    for (const control of controls) control.update()
    const { name, isDirty } = context.session
    status.textContent = name
    status.title = isDirty ? `${name}: kaydedilmemiş değişiklikler var` : name
    status.classList.toggle('is-dirty', isDirty)
  }

  context.editor.on('transaction', update)
  context.session.onChange(update)
  context.theme.onChange(update)
  context.platform.onFullscreenChange(update)
  new ResizeObserver(fit).observe(root)
  update()
  fit()

  // In the capture phase, ahead of the editor: Ctrl+Shift+S saves here instead of striking through.
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (close()) event.preventDefault()
      return
    }
    if (document.querySelector('dialog[open]')) return
    const shortcut = shortcutOf(event)
    const tool = supported.find((item): item is Tool => !isGroup(item) && Boolean(item.shortcuts?.includes(shortcut)))
    if (!tool || !(tool.isAvailable?.(context) ?? true)) return
    event.preventDefault()
    event.stopPropagation()
    tool.run(context)
  }, true)
  return { close, update }
}
