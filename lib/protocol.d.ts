export const VENDOR_ID: number
export const PRODUCT_ID: number
export const REPORT_SIZE: number
export const STATUS_REPORT: number
export const CMD_ZONE: number
export const CMD_DISPLAY: number
export const CMD_ZONE_TEXT: number
export const CMD_TICKER: number
export const CMD_IDENTIFY: number
export const ZONE_COUNT: number
export const LINE_COUNT: number
export const LINE_LENGTH: number

export type Colour = string | [number, number, number]

export interface Button {
	/** 1-32, in physical order: left column, left grid, right grid, right column */
	number: number
	/** Position in the 32-bit button mask */
	bit: number
	group: 'left' | 'grid' | 'right'
	/** 1-based position within the group */
	index: number
	/** 0-based LCD zone above a grid button */
	zone?: number
	name: string
}

export interface ButtonChange {
	button: Button
	pressed: boolean
}

export interface StatusReport {
	header: string
	mask: number
	buildDate: string
	unitId: string
	firmware: string
}

export interface ZoneOptions {
	zone: number
	lines?: string[]
	text?: Colour
	background?: Colour
	border?: Colour
	alternate?: { text?: Colour; background?: Colour; border?: Colour }
	flash?: number
}

export const BUTTONS: Button[]
export const BUTTON_BY_BIT: Map<number, Button>

export function parseStatusReport(data: ArrayLike<number>): StatusReport | null
export function pressedButtons(mask: number): Button[]
export function diffMasks(prev: number, next: number): ButtonChange[]
export function toRgb565(colour: Colour): number
export function encodeZone(options: ZoneOptions): Buffer
export function encodeZoneText(options: { zone: number; lines?: string[] }): Buffer
export function encodeTicker(text?: string): Buffer
export function encodeDisplay(options: { on?: boolean; brightness?: number; page?: number }): Buffer
export function encodeIdentify(): Buffer
