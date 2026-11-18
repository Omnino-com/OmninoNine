## Cloud9 Button Board

Uses a Cloud9 Technologies Button Board (model 0301) as a control surface.

**Layout on a Companion page (8 x 4):**

| Column | What it is |
| ------ | ---------- |
| 0 | Left column buttons (Handset, Transfer, Hold, Release), top to bottom |
| 1-6, rows 0-1 | Left panel, 12 buttons with LCD tiles |
| 1-6, rows 2-3 | Right panel, 12 buttons with LCD tiles |
| 7 | Right column buttons, top to bottom |

**What each tile shows:** the button's text, wrapped to 4 lines of 8 characters, on the
button's background colour. The tiles can't show images. Text is black or white,
whichever reads best on the background, and only plain ASCII characters are shown. Any
other character appears as `?`.

**Other notes:**

- A tile turns white while its button is held.
- The side buttons have no display.
- `PAGE:nnn` at the top right of the right panel shows the current Companion page.
- Only one program can use the board at a time, so close anything else using it first.
