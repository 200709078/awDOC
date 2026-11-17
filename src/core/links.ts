const ALLOWED = new Set(['http:', 'https:', 'mailto:'])

/**
 * The address a link may have, from what the user typed: "madematik.com" becomes https://,
 * an e-mail address becomes mailto:. Null for anything else (javascript:, file:, …), which a
 * document must never be able to open.
 */
export function normalizeLink(typed: string): string | null {
  const text = typed.trim()
  if (!text || /\s/.test(text)) return null
  let candidate = text
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    candidate = /^[^/@]+@[^/@]+\.[^/@]+$/.test(text) ? `mailto:${text}` : `https://${text}`
  }
  try {
    const url = new URL(candidate)
    if (!ALLOWED.has(url.protocol)) return null
    if (url.protocol !== 'mailto:' && !url.hostname.includes('.') && url.hostname !== 'localhost') return null
    return url.href
  } catch {
    return null
  }
}
