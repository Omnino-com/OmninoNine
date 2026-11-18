import { LINE_COUNT, LINE_LENGTH } from 'cloud9-button-board'

/**
 * Fits text into a tile: 4 lines of 8 characters.
 * Existing line breaks are kept, words wrap where they can, and words too long for a
 * line are split. Anything past the fourth line is dropped.
 */
export function wrapTileText(text: string | undefined): string[] {
	const lines: string[] = []
	for (const paragraph of (text ?? '').split(/\r?\n/)) {
		let current = ''
		for (const word of paragraph.split(/\s+/).filter(Boolean)) {
			let rest = word
			if (current && current.length + 1 + rest.length <= LINE_LENGTH) {
				current = `${current} ${rest}`
				continue
			}
			if (current) lines.push(current)
			while (rest.length > LINE_LENGTH) {
				lines.push(rest.slice(0, LINE_LENGTH))
				rest = rest.slice(LINE_LENGTH)
			}
			current = rest
		}
		lines.push(current)
	}
	while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
	return lines.slice(0, LINE_COUNT)
}

/** Black or white, whichever reads better on a background (Rec.709 luma). */
export function textColourFor(background: { r: number; g: number; b: number }): string {
	const luma = 0.2126 * background.r + 0.7152 * background.g + 0.0722 * background.b
	return luma > 140 ? '#000000' : '#ffffff'
}
