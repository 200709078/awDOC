export interface TextCount {
  readonly words: number
  readonly characters: number
  readonly charactersWithoutSpaces: number
}

/** As Word counts: a word is a run without spaces that has a letter or a digit in it. */
export function countText(text: string): TextCount {
  const words = text.split(/\s+/u).filter(word => /[\p{L}\p{N}]/u.test(word)).length
  const letters = [...text.replace(/\n/g, '')]
  return {
    words,
    characters: letters.length,
    charactersWithoutSpaces: letters.filter(letter => !/\s/u.test(letter)).length,
  }
}
