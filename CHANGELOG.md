# What's new in Pen Ink

Newest first. Updates arrive through **Settings → Community plugins → Check for updates**.

## 1.16.0

- **Draw with a finger.** No stylus needed: on phones one finger draws, and two fingers scroll and pinch to zoom. A
  two-finger tap still undoes. Tap the **hand** in the toolbar to scroll with one finger; tap a tool to draw again. Turn it on for tablets in **Settings → Pen Ink → Draw with finger**. A pen always
  draws, and once you use one, fingers go back to scrolling (so your palm can rest) until you tap Done.

## 1.15.0

- **Ink follows your edits.** Fix a typo or add a sentence to a paragraph and its ink stays on it. Before, any change
  to a paragraph's text hid its ink.
- **Bring back hidden ink.** Rewrite or delete a paragraph and Pen Ink tells you its ink is hidden, with a button to
  bring it back: it appears in the middle of the screen, selected, ready to drag into place or delete. For edits made
  outside Obsidian, run **Pen Ink: Bring back hidden ink** from the command palette. Undo puts it back into hiding.

## 1.14.1

- The eraser now reaches every part of a drawing. Ink that hung over a neighboring paragraph (like a circle around a
  word near a paragraph's edge, or ink drawn in blank space) could only be erased from the part over its own
  paragraph, so some drawings took a lot of scrubbing to remove.
- Safer saving: if a save fails (for example while a cloud drive has the file locked), Pen Ink retries, and the next
  save no longer loses the newest strokes.
- Two devices editing the same note can no longer get stuck re-saving the same ink back and forth.
- Renaming a note to a name that still had an old ink file keeps both drawings (the old file goes to the trash).
- Identical-paragraph fix from 1.14.0: the Properties block and lines inside other blocks no longer count, so ink on a
  horizontal rule or a short paragraph stays where it was drawn.
- A turned ellipse that's turned back to level no longer stays slightly tilted, and turned ellipses keep their
  outline and fill lined up on any screen width.
- With the laser pointer picked, a pen's side button now erases properly, and it no longer opens a right-click menu.
- Moving a note to a new window while marking up ends the session cleanly.
- Fixed an error at the start of drawing a sketchy shape with round edges.

## 1.14.0

**New**

- **Resize and rotate.** In Select, drag a corner to resize a drawing (it keeps its proportions and its lines thicken
  or thin with it), or turn it with the round knob under the selection. It settles on 0°, 45°, 90° and so on when
  you're close.
- **Copy, cut and paste ink**, within a note or into another one. Copy is in the selection menu; a Paste button
  appears in the toolbar while there's something to paste. On a Mac, Cmd/Ctrl + C, X and V work too.
- **Four new shapes:** diamond, pentagon, hexagon and star, with fill, sketchy lines and round corners like the rest.
- **Pen eraser end and side button.** With an S Pen, Surface or Wacom pen, the eraser end or a held side button
  erases without switching tools.
- **Export to PDF and printing keep your ink.** The toolbar and selection box stay off the page.

**Fixed**

- Saving now merges ink changed on another device instead of overwriting it, and never saves over an ink file that's
  still syncing.
- Ink that syncs in while a note is already open now shows up.
- Undo and redo only affect the note you're in.
- Two identical paragraphs (like two `---` lines) no longer share the same ink.
- Highlights no longer disappear when you export or print from the dark theme.
- Renaming a note right after drawing keeps its ink together.
- Updating or turning the plugin off and on no longer leaves open notes where new strokes don't stick.
- The selection's opacity slider can no longer change a drawing you've already deselected.

## 1.12.2

- You can start drawing anywhere on a note, including over the title and the Properties area at the top.
- Smoother sketchy rounded shapes.
- The selection's Style card moves beside the selection when there's no room above or below it.

## 1.12.1

First release in the community plugin directory.

- Fingers scroll and pinch to zoom reliably while marking up, including right after a zoom.

## Before the first release

- **Pinch to zoom** while marking up, up to 4×, with ink always saved at its real size.
- **Excalidraw-style shapes:** rectangle, ellipse, triangle, line and arrow, with fill, sloppiness, round edges and
  opacity, plus restyle, duplicate and layer order for selections.
- **Dashed and dotted lines, a laser pointer**, and support for pens beyond the Apple Pencil.
- **Select**: loop around ink to move, recolor or delete it.
- **Fountain pen, smoothing, hold to straighten, favorites** and a smarter eraser with a partial mode.
- **A movable toolbar** that docks as a column or a row.
- Long strokes stay fast, circles are truly round, and the ink folder is a setting.
