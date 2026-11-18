/** The name comments and tracked changes are signed with; asked once, kept on this device. */
const AUTHOR_KEY = 'awDOC.yazar'

export function authorName(): string {
  try {
    return localStorage.getItem(AUTHOR_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function setAuthorName(name: string): void {
  try {
    localStorage.setItem(AUTHOR_KEY, name.trim())
  } catch {
    // Only not remembered.
  }
}
