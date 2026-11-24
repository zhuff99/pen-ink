# Pen Ink

Draw, highlight and sketch on top of your notes in Obsidian with an Apple Pencil, a stylus or a mouse.
Your ink is saved next to the note, never inside it, so your Markdown stays exactly as you wrote it.

Built for the iPad first; it also works with Android and Windows pens and with a mouse on desktop.

## Features

- **Pens**: a ballpoint pen (solid, dashed or dotted) and a pressure-sensitive fountain pen, any color, 4 sizes, adjustable opacity.
- **Highlighter**: translucent ink that sits *behind* the text, so words stay crisp. Optional straight-line mode.
- **Shapes**: rectangle, ellipse, triangle, line and arrow. Press and drag; near-squares snap to squares and circles. Excalidraw-style options: fill, sloppiness (clean, sketchy, rough), sharp or round edges, line style and opacity.
- **Hold to straighten**: pause at the end of a line and it snaps straight.
- **Erasers**: whole-stroke or partial (cut just what you touch), with a pen-only or highlighter-only filter and an option to switch back to your last tool.
- **Select**: draw a loop around ink to move it, restyle it, change its color, duplicate it, bring it to the front, send it back or delete it.
- **Pinch to zoom** (up to 4x) while marking up, for small, neat details. Two fingers pan; on a Mac use a trackpad pinch or Ctrl/Cmd + scroll. Tap the zoom badge to go back to 100%. Ink is always saved at its real size.
- **Laser pointer**: a glowing dot with a fading trail for presenting. It's never saved.
- **Favorites**: save up to 6 pen/highlighter setups and switch with one tap.
- **Undo and redo**, plus a two-finger tap to undo.
- **A toolbar you can move**: drag it anywhere, and flip it between a column and a row.
- **Smoothing** for steadier lines (adjustable).

## How to use

1. Open a note and tap the **marker icon** in the note's header (or run the command **Toggle annotation mode**).
   The note switches to reading view and the toolbar appears.
2. Draw with the Pencil. One finger scrolls the page; two fingers pinch to zoom and pan.
3. Tap a tool again (or the **sliders** button) for its options: color, size and style.
4. Tap **Done** (✓) when you're finished.

Ink is attached to the paragraph you drew on, so it stays in place when you scroll or when other parts of the note change.
If you edit the text of a paragraph, its ink is hidden (not deleted) because it may no longer line up.

## Where your drawings are saved

Each note's ink is a small `.json` file in the **`Annotations`** folder of your vault, mirroring the note's path
(for example `Annotations/Projects/Plan.json` for `Projects/Plan.md`). You can change the folder in
**Settings → Pen Ink**. Renaming or moving a note moves its ink file with it.

**Obsidian Sync:** Sync only syncs `.json` files when **Settings → Sync → "Sync all other types"** is on,
and it has to be on for every device.

## Privacy

Pen Ink makes no network requests, collects no data and has no dependencies. It only reads and writes its own
`.json` files and its settings.

## Settings

- **Ink folder**: where drawings are saved.
- **Hold to straighten**: on or off.
- **Straight highlighter**: every highlight is a straight line.
- **Smoothing**: from 0 (exactly what you draw) to 80.
- **Eraser switches back**: return to your last pen after erasing.

## Installing manually

Copy `main.js`, `manifest.json` and `styles.css` from the latest release into
`<your vault>/.obsidian/plugins/pen-ink/`, then enable **Pen Ink** in **Settings → Community plugins**.

## Development

Plain JavaScript, no build step and no dependencies.

- `node test/load.test.js` checks that the plugin loads against a minimal mock of the Obsidian API.
- `test/harness.html` is a fake reading view for the browser. Serve the repo folder (for example
  `python3 -m http.server`) and open `test/harness.html?test=1` to run the full set of scripted checks
  (pointer input, placement, tools, undo, performance).

## License

[MIT](LICENSE)
