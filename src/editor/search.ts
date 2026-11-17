import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface SearchMatch {
  readonly from: number
  readonly to: number
}

interface SearchState {
  readonly query: string
  readonly matches: readonly SearchMatch[]
  /** The match shown as the current one; -1 when there is none. */
  readonly current: number
}

const searchKey = new PluginKey<SearchState>('search')
const EMPTY: SearchState = { query: '', matches: [], current: -1 }

/**
 * Lower case, with every form of the Turkish I as one letter (I, ı, İ, i), one character for one
 * character, so positions in the folded text are positions in the original. A letter whose lower
 * case is longer is kept as it is.
 */
export function foldForSearch(text: string): string {
  let folded = ''
  for (const letter of text) {
    if (letter === 'I' || letter === 'ı' || letter === 'İ') {
      folded += 'i'
      continue
    }
    const lower = letter.toLowerCase()
    folded += lower.length === letter.length ? lower : letter
  }
  return folded
}

/** Matches inside each paragraph; a line break counts as one character that no query matches. */
export function findMatches(document: ProseMirrorNode, query: string): SearchMatch[] {
  const needle = foldForSearch(query)
  const matches: SearchMatch[] = []
  if (!needle) return matches
  document.descendants((node, position) => {
    if (!node.isTextblock) return true
    let text = ''
    const positions: number[] = []
    node.forEach((child, offset) => {
      const start = position + 1 + offset
      const piece = child.isText ? child.text! : '\n'
      for (let index = 0; index < piece.length; index++) positions.push(start + index)
      text += piece
    })
    const haystack = foldForSearch(text)
    for (let index = haystack.indexOf(needle); index !== -1; index = haystack.indexOf(needle, index + needle.length)) {
      matches.push({ from: positions[index], to: positions[index + needle.length - 1] + 1 })
    }
    return false
  })
  return matches
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    search: {
      /** Marks every match; the current one is the first at or after the cursor. */
      setSearchQuery: (query: string) => ReturnType
      /** Selects the next (1), previous (-1) or current (0) match and scrolls it into view. */
      goToMatch: (direction: -1 | 0 | 1) => ReturnType
      replaceMatch: (replacement: string) => ReturnType
      replaceAllMatches: (replacement: string) => ReturnType
    }
  }
}

export function searchState(state: import('@tiptap/pm/state').EditorState): SearchState {
  return searchKey.getState(state) ?? EMPTY
}

function select(tr: Transaction, match: SearchMatch): void {
  tr.setSelection(TextSelection.create(tr.doc, match.from, match.to)).scrollIntoView()
}

/** Find and replace: the matches are decorations, so the document itself never changes for them. */
export const Search = Extension.create({
  name: 'search',

  addProseMirrorPlugins() {
    return [new Plugin<SearchState>({
      key: searchKey,
      state: {
        init: () => EMPTY,
        apply: (tr, value, _old, state) => {
          const meta = tr.getMeta(searchKey) as Partial<SearchState> | undefined
          const query = meta?.query ?? value.query
          if (meta?.query === undefined && !tr.docChanged) {
            return meta?.current === undefined ? value : { ...value, current: meta.current }
          }
          const matches = findMatches(state.doc, query)
          let current = meta?.current ?? value.current
          if (meta?.query !== undefined) current = matches.findIndex(match => match.from >= state.selection.from)
          if (current < 0 && matches.length > 0) current = 0
          return { query, matches, current: Math.min(current, matches.length - 1) }
        },
      },
      props: {
        decorations: state => {
          const { matches, current } = searchState(state)
          if (matches.length === 0) return DecorationSet.empty
          return DecorationSet.create(state.doc, matches.map((match, index) => Decoration.inline(match.from, match.to, {
            class: index === current ? 'search-match is-current' : 'search-match',
          })))
        },
      },
    })]
  },

  addCommands() {
    return {
      setSearchQuery: query => ({ tr }) => {
        tr.setMeta(searchKey, { query })
        return true
      },
      goToMatch: direction => ({ state, tr }) => {
        const { matches, current } = searchState(state)
        if (matches.length === 0) return false
        const next = (current + direction + matches.length) % matches.length
        tr.setMeta(searchKey, { current: next })
        select(tr, matches[next])
        return true
      },
      replaceMatch: replacement => ({ state, tr }) => {
        const { matches, current } = searchState(state)
        const match = matches[current]
        if (!match) return false
        tr.insertText(replacement, match.from, match.to)
        return true
      },
      replaceAllMatches: replacement => ({ state, tr }) => {
        const { matches } = searchState(state)
        if (matches.length === 0) return false
        // From the end, so the positions before stay where they were.
        for (const match of [...matches].reverse()) tr.insertText(replacement, match.from, match.to)
        return true
      },
    }
  },
})
