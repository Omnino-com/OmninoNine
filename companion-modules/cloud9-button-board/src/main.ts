import type { DiscoveredSurfaceInfo, HIDDevice, OpenSurfaceResult, SurfaceContext, SurfacePlugin } from '@companion-surface/base'
import { PRODUCT_ID, VENDOR_ID } from 'cloud9-button-board'
import HID from 'node-hid'
import { Cloud9Surface } from './instance.js'
import { PINCODE_MAP, createSurfaceLayout } from './layout.js'

const VENDOR_USAGE_PAGE = 0xff00

export interface Cloud9Info {
	path: string
}

const Cloud9Plugin: SurfacePlugin<Cloud9Info> = {
	init: async (): Promise<void> => {
		// Nothing to do
	},
	destroy: async (): Promise<void> => {
		// Nothing to do
	},

	checkSupportsHidDevice: (device: HIDDevice): DiscoveredSurfaceInfo<Cloud9Info> | null => {
		if (device.vendorId !== VENDOR_ID || device.productId !== PRODUCT_ID) return null
		if (device.usagePage !== undefined && device.usagePage !== VENDOR_USAGE_PAGE) return null

		// The board has no USB serial number, and its reported unit ID may not be unique.
		return {
			surfaceId: `cloud9:${device.serialNumber || 'board'}`,
			surfaceIdIsNotUnique: !device.serialNumber,
			description: 'Cloud9 Button Board',
			pluginInfo: { path: device.path },
		}
	},

	openSurface: async (surfaceId: string, pluginInfo: Cloud9Info, context: SurfaceContext): Promise<OpenSurfaceResult> => {
		const device = await HID.HIDAsync.open(pluginInfo.path)

		return {
			surface: new Cloud9Surface(surfaceId, device, context),
			registerProps: {
				brightness: true,
				surfaceLayout: createSurfaceLayout(),
				pincodeMap: PINCODE_MAP,
				configFields: null,
				location: null,
			},
		}
	},
}

export default Cloud9Plugin
