import { showAbout } from '../ui/about'
import { ICONS } from './icons'
import type { Tool } from './tool'

export const fullscreenTool: Tool = {
  id: 'fullscreen',
  label: 'Tam Ekran',
  icon: ICONS.fullscreen,
  shortcuts: ['f11'],
  isActive: ({ platform }) => platform.isFullscreen,
  run: ({ platform }) => platform.toggleFullscreen(),
}

/** The interface only; the page stays white, as it will be on paper. */
export const themeTool: Tool = {
  id: 'theme',
  label: 'Koyu Tema',
  icon: ICONS.theme,
  isActive: ({ theme }) => theme.isDark,
  run: ({ theme }) => theme.toggle(),
}

/**
 * Hakkında: the family's small window (name, version, mADEMatik Solutions, downloads, licence,
 * privacy, contact). It always sits at the end of the ☰ menu (the user's choice, 2026-11-10).
 */
export const aboutTool: Tool = {
  id: 'about',
  label: 'Hakkında',
  icon: ICONS.about,
  inMenu: true,
  run: ({ platform }) => showAbout(platform),
}
