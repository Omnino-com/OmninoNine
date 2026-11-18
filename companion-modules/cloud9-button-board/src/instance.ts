import {
	type CardGenerator,
	type ModuleLogger,
	type SurfaceContext,
	type SurfaceDrawProps,
	type SurfaceInstance,
	createModuleLogger,
	parseColor,
} from '@companion-surface/base'
import {
	LINE_COUNT,
	LINE_LENGTH,
	ZONE_COUNT,
	diffMasks,
	encodeDisplay,
	encodeTicker,
	encodeZone,
	parseStatusReport,
} from 'cloud9-button-board'
import { controlIdForButton, zoneForControlId } from './layout.js'
import { textColourFor, wrapTileText } from './text.js'

/** The parts of node-hid's HIDAsync used here. */
export interface BoardDevice {
	on(event: 'data', listener: (data: Buffer) => void): unknown
	on(event: 'error', listener: (error: Error) => void): unknown
	write(data: number[] | Buffer): Promise<number>
	close(): Promise<void>
}

const BLACK = '#000000'
const WHITE = '#ffffff'
const PRESSED_BORDER = '#ffff00'
const DEFAULT_BRIGHTNESS_PERCENT = 50
const TICKER_CLEAR_MS = 1200

export class Cloud9Surface implements SurfaceInstance {
	readonly #logger: ModuleLogger
	readonly #device: BoardDevice
	readonly #surfaceId: string

	/** Last report sent per zone, so unchanged tiles aren't redrawn. */
	readonly #lastZone = new Map<number, string>()
	#mask = 0
	#brightnessPercent = DEFAULT_BRIGHTNESS_PERCENT
	#page = 0
	#displayOn = false
	#tickerTimer: NodeJS.Timeout | undefined
	#closed = false

	constructor(surfaceId: string, device: BoardDevice, context: SurfaceContext) {
		this.#logger = createModuleLogger(`Cloud9/${surfaceId}`)
		this.#surfaceId = surfaceId
		this.#device = device

		device.on('error', (error) => context.disconnect(error))
		device.on('data', (data) => {
			const status = parseStatusReport(data)
			if (!status) return
			for (const { button, pressed } of diffMasks(this.#mask, status.mask)) {
				const controlId = controlIdForButton(button)
				if (pressed) context.keyDownById(controlId)
				else context.keyUpById(controlId)
			}
			this.#mask = status.mask
		})
	}

	get surfaceId(): string {
		return this.#surfaceId
	}

	get productName(): string {
		return 'Cloud9 Button Board'
	}

	async init(): Promise<void> {
		await this.blank()
	}

	async close(): Promise<void> {
		this.#closed = true
		clearTimeout(this.#tickerTimer)
		await this.#clearAll().catch(() => null)
		await this.#device.close()
	}

	async ready(): Promise<void> {
		await this.#sendDisplay()
	}

	async setBrightness(percent: number): Promise<void> {
		this.#brightnessPercent = Math.min(100, Math.max(0, percent))
		await this.#sendDisplay()
	}

	async blank(): Promise<void> {
		await this.#clearAll()
	}

	async draw(signal: AbortSignal, drawProps: SurfaceDrawProps): Promise<void> {
		if (signal.aborted) return

		const page = drawProps.pageNumber
		const pageChanged = page !== undefined && page !== this.#page
		if (page !== undefined) this.#page = page
		if (pageChanged || !this.#displayOn) await this.#sendDisplay()

		const zone = zoneForControlId(drawProps.controlId)
		if (zone === null) return

		const colour = parseColor(drawProps.color)
		const lines = wrapTileText(drawProps.text)
		const background = `#${[colour.r, colour.g, colour.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
		const hasContent = background !== BLACK || lines.some((line) => line !== '')

		if (drawProps.pressed) {
			await this.#sendZone(encodeZone({ zone, lines, text: BLACK, background: WHITE, border: PRESSED_BORDER }))
		} else if (hasContent) {
			await this.#sendZone(encodeZone({ zone, lines, text: textColourFor(colour), background, border: WHITE }))
		} else {
			await this.#sendZone(encodeZone({ zone, text: BLACK, background: BLACK, border: BLACK }))
		}
	}

	async showStatus(signal: AbortSignal, _cardGenerator: CardGenerator, statusMessage: string): Promise<void> {
		if (signal.aborted) return
		await this.#sendDisplay()

		// One tile can't hold much, so the message runs across the top row.
		const chunks: string[] = []
		const message = statusMessage.replace(/\s+/g, ' ').trim()
		for (let i = 0; i < message.length; i += LINE_LENGTH) chunks.push(message.slice(i, i + LINE_LENGTH))

		for (let zone = 0; zone < ZONE_COUNT; zone += 1) {
			const lines = chunks.slice(zone * LINE_COUNT, (zone + 1) * LINE_COUNT)
			await this.#sendZone(encodeZone({ zone, lines, text: WHITE, background: BLACK, border: BLACK }))
		}
	}

	/** Scrolling text along the top of both panels. An empty string clears it. */
	async setTicker(text: string): Promise<void> {
		clearTimeout(this.#tickerTimer)
		await this.#write(encodeTicker(''))
		if (text === '') return
		// Changing a message mid-scroll loses its first few characters, so clear first.
		this.#tickerTimer = setTimeout(() => {
			if (this.#closed) return
			this.#write(encodeTicker(text)).catch((error) => this.#logger.error(`Ticker write failed: ${error}`))
		}, TICKER_CLEAR_MS)
	}

	async #clearAll(): Promise<void> {
		clearTimeout(this.#tickerTimer)
		await this.#write(encodeTicker(''))
		for (let zone = 0; zone < ZONE_COUNT; zone += 1) {
			await this.#sendZone(encodeZone({ zone, text: BLACK, background: BLACK, border: BLACK }))
		}
		// Off, because PAGE:nnn would otherwise stay lit on an otherwise blank board.
		this.#displayOn = false
		await this.#write(encodeDisplay({ on: false, brightness: this.#rawBrightness(), page: this.#pageByte() }))
	}

	async #sendDisplay(): Promise<void> {
		// The board's lowest backlight level is still readable, so 0% means off.
		this.#displayOn = this.#brightnessPercent > 0
		await this.#write(encodeDisplay({ on: this.#displayOn, brightness: this.#rawBrightness(), page: this.#pageByte() }))
	}

	async #sendZone(report: Buffer): Promise<void> {
		const zone = report[1]
		const key = report.toString('hex')
		if (this.#lastZone.get(zone) === key) return
		this.#lastZone.set(zone, key)
		await this.#write(report)
	}

	#rawBrightness(): number {
		return Math.round((this.#brightnessPercent / 100) * 255)
	}

	#pageByte(): number {
		return Math.min(255, Math.max(0, Math.trunc(this.#page)))
	}

	async #write(report: Buffer): Promise<void> {
		// Leading 0x00 is hidapi's "no report ID" marker; it isn't sent to the board.
		await this.#device.write(Buffer.concat([Buffer.from([0x00]), report]))
	}
}
