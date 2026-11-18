import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { validateSurfaceLayout, validateSurfaceManifest, type SurfaceContext, type SurfaceDrawProps } from '@companion-surface/base'
import { BUTTONS, encodeDisplay, encodeZone } from 'cloud9-button-board'
import { Cloud9Surface, type BoardDevice } from '../instance.js'
import { controlIdForButton, createSurfaceLayout, PINCODE_MAP, zoneForControlId } from '../layout.js'
import { textColourFor, wrapTileText } from '../text.js'

class FakeDevice implements BoardDevice {
	readonly writes: Buffer[] = []
	closed = false
	dataListener: ((data: Buffer) => void) | undefined
	errorListener: ((error: Error) => void) | undefined

	on(event: 'data' | 'error', listener: never): this {
		if (event === 'data') this.dataListener = listener
		else this.errorListener = listener
		return this
	}

	async write(data: number[] | Buffer): Promise<number> {
		const bytes = Buffer.from(data as Buffer)
		assert.equal(bytes.length, 65, 'writes are a report-ID byte plus a 64-byte report')
		assert.equal(bytes[0], 0, 'the board has no report IDs')
		this.writes.push(bytes.subarray(1))
		return bytes.length
	}

	async close(): Promise<void> {
		this.closed = true
	}
}

function fakeContext() {
	const events: string[] = []
	const context = {
		keyDownById: (id: string) => events.push(`down ${id}`),
		keyUpById: (id: string) => events.push(`up ${id}`),
		disconnect: (error: Error) => events.push(`disconnect ${error.message}`),
	} as unknown as SurfaceContext
	return { context, events }
}

function statusReport(mask: number): Buffer {
	const report = Buffer.alloc(64)
	report[0] = 0x88
	report.writeUInt32BE(mask, 4)
	return report
}

const drawProps = (props: Partial<SurfaceDrawProps>): SurfaceDrawProps => ({ controlId: '0/1', pressed: false, ...props })
const live = new AbortController().signal

test('the manifest and layout satisfy the real Companion validators', () => {
	const manifestUrl = new URL('../../../companion/manifest.json', import.meta.url)
	validateSurfaceManifest(JSON.parse(readFileSync(manifestUrl, 'utf8')), true)
	validateSurfaceLayout(createSurfaceLayout())
})

test('every button maps to a unique control on an 8x4 page', () => {
	const ids = BUTTONS.map(controlIdForButton)
	assert.equal(new Set(ids).size, 32)
	const layout = createSurfaceLayout()
	assert.deepEqual(Object.keys(layout.controls).sort(), [...ids].sort())
	for (const id of ids) {
		const { row, column } = layout.controls[id]
		assert.ok(row >= 0 && row < 4 && column >= 0 && column < 8, `${id} is on the page`)
	}
})

test('tile controls and zones agree in both directions', () => {
	for (const button of BUTTONS) {
		const zone = zoneForControlId(controlIdForButton(button))
		assert.equal(zone, button.group === 'grid' ? button.zone : null, button.name)
	}
	assert.equal(zoneForControlId('nonsense'), null)
	assert.equal(zoneForControlId('4/1'), null)
})

test('the side buttons request no drawing, and the tiles request text and colour', () => {
	const layout = createSurfaceLayout()
	assert.equal(layout.controls['0/0'].stylePreset, 'noDisplay')
	assert.equal(layout.controls['3/7'].stylePreset, 'noDisplay')
	assert.equal(layout.controls['0/1'].stylePreset, undefined)
	assert.deepEqual(layout.stylePresets.default, { text: true, colors: 'hex' })
})

test('the keypad only uses controls that have a tile', () => {
	const { type: _type, ...map } = PINCODE_MAP as unknown as Record<string, string>
	for (const [key, controlId] of Object.entries(map)) {
		assert.notEqual(zoneForControlId(controlId), null, `pincode ${key} is on ${controlId}`)
	}
	assert.equal(new Set(Object.values(map)).size, 11)
})

test('text wraps to 4 lines of 8 characters', () => {
	assert.deepEqual(wrapTileText('CUE 1'), ['CUE 1'])
	assert.deepEqual(wrapTileText('GO TO NEXT CUE'), ['GO TO', 'NEXT CUE'])
	assert.deepEqual(wrapTileText('line one\nline two'), ['line one', 'line two'])
	assert.deepEqual(wrapTileText('TOOLONGAWORD'), ['TOOLONGA', 'WORD'])
	assert.deepEqual(wrapTileText('a\nb\nc\nd\ne'), ['a', 'b', 'c', 'd'])
	assert.deepEqual(wrapTileText('A\n\nB'), ['A', '', 'B'], 'blank lines are kept');
	assert.deepEqual(wrapTileText(undefined), [''])
	assert.deepEqual(wrapTileText(''), [''])
	for (const line of wrapTileText('THE QUICK BROWN FOXES JUMPED OVER EVERYTHING')) assert.ok(line.length <= 8)
})

test('text colour contrasts with the background', () => {
	assert.equal(textColourFor({ r: 255, g: 255, b: 0 }), '#000000')
	assert.equal(textColourFor({ r: 255, g: 255, b: 255 }), '#000000')
	assert.equal(textColourFor({ r: 0, g: 0, b: 255 }), '#ffffff')
	assert.equal(textColourFor({ r: 0, g: 0, b: 0 }), '#ffffff')
})

test('button changes reach Companion as control ids, including chords', () => {
	const device = new FakeDevice()
	const { context, events } = fakeContext()
	new Cloud9Surface('s', device, context)

	const first = BUTTONS[0]
	const grid8 = BUTTONS.find((b) => b.name === 'Grid 8')!
	const lastRight = BUTTONS[31]
	const mask = (...buttons: typeof BUTTONS) => buttons.reduce((m, b) => (m | (1 << b.bit)) >>> 0, 0)

	device.dataListener!(statusReport(mask(first)))
	device.dataListener!(statusReport(mask(first, grid8, lastRight)))
	device.dataListener!(statusReport(mask(grid8)))
	device.dataListener!(statusReport(0))

	assert.deepEqual(events, ['down 0/0', 'down 1/2', 'down 3/7', 'up 0/0', 'up 3/7', 'up 1/2'])
})

test('identify replies are not mistaken for button presses', () => {
	const device = new FakeDevice()
	const { context, events } = fakeContext()
	new Cloud9Surface('s', device, context)
	const reply = statusReport(0x02020000)
	reply[0] = 0xa5
	device.dataListener!(reply)
	assert.deepEqual(events, [])
})

test('a device error disconnects the surface', () => {
	const device = new FakeDevice()
	const { context, events } = fakeContext()
	new Cloud9Surface('s', device, context)
	device.errorListener!(new Error('unplugged'))
	assert.deepEqual(events, ['disconnect unplugged'])
})

test('draw sends the tile for its zone, with contrasting text and a border', async () => {
	const device = new FakeDevice()
	const surface = new Cloud9Surface('s', device, fakeContext().context)
	await surface.ready()
	device.writes.length = 0

	await surface.draw(live, drawProps({ controlId: '1/2', text: 'GO', color: '#ffff00' }))

	const expected = encodeZone({ zone: 7, lines: ['GO'], text: '#000000', background: '#ffff00', border: '#ffffff' })
	assert.deepEqual(device.writes, [expected])
})

test('a pressed tile turns white', async () => {
	const device = new FakeDevice()
	const surface = new Cloud9Surface('s', device, fakeContext().context)
	await surface.ready()
	device.writes.length = 0

	await surface.draw(live, drawProps({ text: 'GO', color: '#0000ff', pressed: true }))

	assert.deepEqual(device.writes, [encodeZone({ zone: 0, lines: ['GO'], text: '#000000', background: '#ffffff', border: '#ffff00' })])
})

test('an empty black button erases its tile', async () => {
	const device = new FakeDevice()
	const surface = new Cloud9Surface('s', device, fakeContext().context)
	await surface.ready()
	device.writes.length = 0

	await surface.draw(live, drawProps({ text: '', color: '#000000' }))

	assert.deepEqual(device.writes, [encodeZone({ zone: 0, text: '#000000', background: '#000000', border: '#000000' })])
})

test('an unchanged tile is not redrawn, but a blank resets that', async () => {
	const device = new FakeDevice()
	const surface = new Cloud9Surface('s', device, fakeContext().context)
	await surface.ready()
	device.writes.length = 0

	const props = drawProps({ text: 'GO', color: '#0000ff' })
	await surface.draw(live, props)
	await surface.draw(live, props)
	assert.equal(device.writes.length, 1)
	await surface.draw(live, drawProps({ text: 'STOP', color: '#0000ff' }))
	assert.equal(device.writes.length, 2)

	await surface.blank()
	device.writes.length = 0
	await surface.draw(live, props)
	assert.equal(device.writes.filter((w) => w[0] === 0x51).length, 1, 'redrawn after a blank')
})

test('side buttons draw nothing', async () => {
	const device = new FakeDevice()
	const surface = new Cloud9Surface('s', device, fakeContext().context)
	await surface.ready()
	device.writes.length = 0
	await surface.draw(live, drawProps({ controlId: '0/0', text: 'X', color: '#ff0000' }))
	assert.equal(device.writes.length, 0)
})

test('an aborted draw sends nothing', async () => {
	const device = new FakeDevice()
	const surface = new Cloud9Surface('s', device, fakeContext().context)
	await surface.ready()
	device.writes.length = 0
	const controller = new AbortController()
	controller.abort()
	await surface.draw(controller.signal, drawProps({ text: 'GO', color: '#0000ff' }))
	assert.equal(device.writes.length, 0)
})

test('the page number follows draws, and is only sent when it changes', async () => {
	const device = new FakeDevice()
	const surface = new Cloud9Surface('s', device, fakeContext().context)
	await surface.setBrightness(100)
	device.writes.length = 0

	await surface.draw(live, drawProps({ controlId: '0/0', pageNumber: 12 }))
	await surface.draw(live, drawProps({ controlId: '0/0', pageNumber: 12 }))
	assert.deepEqual(device.writes, [encodeDisplay({ on: true, brightness: 255, page: 12 })])
})

test('brightness scales to the raw range, and 0% turns the panels off', async () => {
	const device = new FakeDevice()
	const surface = new Cloud9Surface('s', device, fakeContext().context)
	await surface.setBrightness(100)
	await surface.setBrightness(50)
	await surface.setBrightness(0)
	assert.deepEqual(device.writes, [
		encodeDisplay({ on: true, brightness: 255, page: 0 }),
		encodeDisplay({ on: true, brightness: 128, page: 0 }),
		encodeDisplay({ on: false, brightness: 0, page: 0 }),
	])
})

test('blank clears every zone and the ticker, then turns the panels off', async () => {
	const device = new FakeDevice()
	const surface = new Cloud9Surface('s', device, fakeContext().context)
	await surface.blank()
	assert.equal(device.writes.filter((w) => w[0] === 0x51).length, 24)
	assert.equal(device.writes.filter((w) => w[0] === 0x54).length, 1)
	const last = device.writes[device.writes.length - 1]
	assert.equal(last[0], 0x53)
	assert.equal(last[1], 0, 'panels off')
})

test('a draw after a blank turns the panels back on', async () => {
	const device = new FakeDevice()
	const surface = new Cloud9Surface('s', device, fakeContext().context)
	await surface.blank()
	device.writes.length = 0
	await surface.draw(live, drawProps({ text: 'GO', color: '#0000ff' }))
	assert.equal(device.writes[0][0], 0x53)
	assert.equal(device.writes[0][1], 1, 'panels on')
	assert.equal(device.writes[1][0], 0x51)
})

test('close clears the board and closes the device', async () => {
	const device = new FakeDevice()
	const surface = new Cloud9Surface('s', device, fakeContext().context)
	await surface.close()
	assert.ok(device.closed)
	assert.equal(device.writes[device.writes.length - 1][1], 0, 'panels off')
})

test('a status message runs across the tiles', async () => {
	const device = new FakeDevice()
	const surface = new Cloud9Surface('s', device, fakeContext().context)
	await surface.showStatus(live, {} as never, 'Connecting to Companion')
	const first = device.writes.find((w) => w[0] === 0x51 && w[1] === 0)!
	assert.equal(first.subarray(4, 12).toString('latin1'), 'Connecti')
	assert.equal(first.subarray(13, 21).toString('latin1'), 'ng to Co')
})
