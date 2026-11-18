import type { SurfacePincodeMap, SurfaceSchemaLayoutDefinition } from '@companion-surface/base'
import { BUTTONS, type Button } from 'cloud9-button-board'

// The board's 32 buttons fill a default 8x4 Companion page exactly:
//
//   column 0        left column, top to bottom
//   columns 1-6     tiles: left panel on rows 0-1, right panel on rows 2-3
//   column 7        right column, top to bottom
//
// That puts the right panel below the left one rather than beside it, in exchange
// for needing no changes to Companion's grid size.
const TILES_PER_ROW = 6
const FIRST_TILE_COLUMN = 1
const RIGHT_COLUMN = 7

export function controlIdForButton(button: Button): string {
	if (button.group === 'left') return `${button.index - 1}/0`
	if (button.group === 'right') return `${button.index - 1}/${RIGHT_COLUMN}`
	const zone = button.zone as number
	return `${Math.floor(zone / TILES_PER_ROW)}/${(zone % TILES_PER_ROW) + FIRST_TILE_COLUMN}`
}

/** The LCD zone for a control, or null for a side button or unknown control. */
export function zoneForControlId(controlId: string): number | null {
	const match = /^(\d+)\/(\d+)$/.exec(controlId)
	if (!match) return null
	const row = Number(match[1])
	const column = Number(match[2])
	if (row > 3 || column < FIRST_TILE_COLUMN || column >= RIGHT_COLUMN) return null
	return row * TILES_PER_ROW + (column - FIRST_TILE_COLUMN)
}

export function createSurfaceLayout(): SurfaceSchemaLayoutDefinition {
	const controls: SurfaceSchemaLayoutDefinition['controls'] = {}
	for (const button of BUTTONS) {
		const controlId = controlIdForButton(button)
		const [row, column] = controlId.split('/').map(Number)
		controls[controlId] = button.group === 'grid' ? { row, column } : { row, column, stylePreset: 'noDisplay' }
	}
	return {
		stylePresets: {
			default: { text: true, colors: 'hex' },
			noDisplay: {},
		},
		controls,
	}
}

// Digits sit in a keypad block on the tiles, which can show text.
export const PINCODE_MAP: SurfacePincodeMap = {
	type: 'single-page',
	pincode: '0/5',
	1: '0/1',
	2: '0/2',
	3: '0/3',
	4: '1/1',
	5: '1/2',
	6: '1/3',
	7: '2/1',
	8: '2/2',
	9: '2/3',
	0: '3/2',
}
