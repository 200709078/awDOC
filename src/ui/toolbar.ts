import { isGroup, type Tool, type ToolbarItem, type ToolContext, type ToolGroup, type ToolSection } from '../tools/tool'
import { readPendingSelection } from '../editor/editor'

/**
 * Such as `ctrl+s`, `ctrl+shift+s`, `f11`, `alt+=`. Shift counts only with Ctrl or a named key:
 * `=` is Shift+0 on a Turkish keyboard, and Alt+= must be the same shortcut there.
 */
export function shortcutOf(event: KeyboardEvent): string {
  const ctrl = event.ctrlKey || event.metaKey
  const alt = event.altKey && !ctrl
  const shift = event.shiftKey && (ctrl || event.key.length > 1)
  return `${ctrl ? 'ctrl+' : ''}${alt ? 'alt+' : ''}${shift ? 'shift+' : ''}${event.key.toLowerCase()}`
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
    if (tool.iconOnly || tool.swatch !== undefined) element.classList.add('toolbar__button--icon')
    if (tool.swatch !== undefined) {
      // An empty swatch is "no colour": the square is crossed out.
      element.querySelector('.toolbar__icon')!.outerHTML = `<span class="toolbar__swatch${tool.swatch ? '' : ' toolbar__swatch--none'}" style="background:${tool.swatch || 'transparent'}" aria-hidden="true"></span>`
    }
    if (tool.labelFont) element.querySelector<HTMLElement>('.toolbar__label')!.style.fontFamily = tool.labelFont
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
    header.setAttribute('aria-controls', panel.id)
    const sections: readonly ToolSection[] = group.sections ?? [{ tools: group.tools }]
    const tools: Control[] = []
    const titles: (() => void)[] = []
    for (const section of sections) {
      const part = document.createElement('div')
      part.className = 'toolbar__section'
      if (section.tools.every(tool => tool.iconOnly || tool.swatch !== undefined)) part.classList.add('toolbar__section--icons')
      if (section.title || section.titleOf) {
        const title = document.createElement('div')
        title.className = 'toolbar__section-title'
        title.textContent = section.title ?? ''
        if (section.titleOf) titles.push(() => { title.textContent = section.titleOf!(context) })
        part.append(title)
      }
      const items = document.createElement('div')
      items.className = 'toolbar__section-items'
      for (const tool of section.tools) {
        const control = toolControl(tool, group)
        tools.push(control)
        items.append(control.element)
      }
      part.append(items)
      panel.append(part)
    }
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
        for (const title of titles) title()
        const icon = group.iconOf?.(context) ?? group.icon
        const current = header.querySelector('.toolbar__icon')!
        if (current.innerHTML !== icon) current.innerHTML = icon
        header.classList.toggle('is-marked', group.isMarked?.(context) ?? false)
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

  const shown = supported.filter(item => isGroup(item) || item.inToolbar !== false)
  const controls = shown.map(item => (isGroup(item) ? groupControl(item) : toolControl(item)))
  const inRow = controls.filter((_, index) => { const item = shown[index]; return isGroup(item) || !item.inMenu })
  const menuOnly = controls.filter((_, index) => { const item = shown[index]; return !isGroup(item) && item.inMenu })
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
  context.searchBar.onChange(update)
  context.pageView.onChange(update)
  context.welcome.onChange(update)
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
    // A shortcut pressed right after Shift+Home must already see that selection.
    readPendingSelection(context.editor.view)
    tool.run(context)
  }, true)
  return { close, update }
}
