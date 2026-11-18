# Cloud9 Button Board for Bitfocus Companion

This lets you use a **Cloud9 Technologies Button Board (model 0301)** as a control
surface in [Bitfocus Companion](https://bitfocus.io/companion). Its 32 buttons map
onto a Companion page, and the 24 LCD tiles show each button's text and colour.

It's installed as a **developer module**: you point Companion at the folder in this
zip, and Companion loads it from there.

## What you need

- **Bitfocus Companion 5.1 or newer.** Tested with 5.1.2 on macOS. Older versions
  may refuse to load it.
- The Button Board, connected by USB.
- Windows, macOS or Linux. Everything the module needs is already in the
  `node_modules` folder, so you don't need to install anything else.

## What's in this zip

```
README.md                      this file
companion-modules/             the folder you point Companion at
  cloud9-button-board/         the module
linux/
  50-cloud9-button-board.rules USB permissions, needed on Linux only
docs/PROTOCOL.md               how the board's USB protocol works, if you're curious
LICENSE
```

## Install

### 1. Put the files somewhere permanent

Unzip into a folder you'll keep, for example `Documents/Companion Modules`.
Companion loads the module from that folder every time it starts, so don't leave it
in Downloads or move it later.

### 2. Close anything else that uses the board

Only one program can use the board at a time. Quit any other software that talks to
it, such as NineEdit, before going further.

### 3. Turn on developer modules in Companion

1. Click the **Companion icon** in the menu bar (macOS) or system tray (Windows) and
   choose **Advanced Settings**.
2. Open the **Developer** section.
3. Turn on **Enable Developer Modules**.
4. Next to **Developer Modules Path**, click **Select** and choose the
   **`companion-modules`** folder from this zip.

   > Choose `companion-modules`, the folder that *contains* `cloud9-button-board`.
   > Don't choose `cloud9-button-board` itself, or Companion won't find the module.

5. Close the settings window. If the module doesn't show up in step 4 below, quit
   Companion (icon menu → **Quit**) and start it again.

### 4. Add the surface integration

1. Open the Companion web interface (icon menu → **Launch GUI**).
2. Go to **Surfaces → Surface Integrations**.
3. Click **Add Surface Integration** and find **Cloud9 Button Board**.
4. In the version list, choose **Dev version**, then add it.

### 5. Plug in the board

Plug in the board, or unplug it and plug it back in. It should appear under
**Surfaces → Configured Surfaces**. If Companion is set not to enable new surfaces
automatically, enable it from the Surfaces page. **Scan USB Devices** in the icon menu
makes Companion look again.

## How the board maps onto a Companion page

The board's 32 buttons fill a standard 8 × 4 Companion page:

| Companion column | Board buttons |
| --- | --- |
| 0 | Left column: Handset, Transfer, Hold, Release (top to bottom) |
| 1–6, rows 0–1 | Left panel: 12 buttons with LCD tiles |
| 1–6, rows 2–3 | Right panel: 12 buttons with LCD tiles |
| 7 | Right column buttons (top to bottom) |

- Each tile shows the button's text, wrapped to 4 lines of 8 characters, on the
  button's background colour. Text is black or white, whichever is easier to read.
- The tiles can't show images. Only plain ASCII characters are shown; anything else
  appears as `?`.
- A tile turns white while its button is held.
- The side buttons have no display.
- `PAGE:nnn` at the top right of the right panel shows the current Companion page.

## Troubleshooting

**Cloud9 Button Board isn't in the Add Surface Integration list**
Check that **Enable Developer Modules** is on and that the path is the
`companion-modules` folder (step 3). Then restart Companion.

**The integration shows "Incompatible module version"**
Your Companion is too old. Update to 5.1 or newer.

**The integration is running but the board doesn't appear**
- Make sure nothing else is using the board (step 2).
- Unplug the board and plug it back in, or use **Scan USB Devices** in the icon menu.
- On Linux, install the USB permissions rule (below).

**Two boards**
The board has no USB serial number, so Companion can't tell two boards apart
reliably. One board per computer is the safe setup.

## Linux (including Raspberry Pi)

This hasn't been tested on Linux yet. It should work, but you'll need to let
Companion access the board over USB:

```sh
sudo cp linux/50-cloud9-button-board.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules && sudo udevadm trigger
```

Then unplug the board and plug it back in.

If you run Companion without the launcher window (headless, or CompanionPi), add the
module folder when starting it:

```sh
--extra-module-path /path/to/companion-modules
```

## Updating

Replace the `cloud9-button-board` folder inside `companion-modules` with the one from
the new zip. Companion watches the folder and restarts the module by itself. If it
doesn't, restart Companion.

## Source

https://github.com/Omnino-com/OmninoNine
