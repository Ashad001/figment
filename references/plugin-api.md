# The Plugin API, and the traps in it

Read this before writing layout code. Nearly all the time lost to generating Figma from a
plugin is lost to a handful of auto-layout behaviours that are individually reasonable and
collectively surprising.

## Contents

- [What a real plugin does not have](#what-a-real-plugin-does-not-have)
- [Auto-layout traps](#auto-layout-traps)
- [Text](#text)
- [Colour and fills](#colour-and-fills)
- [SVG and instances](#svg-and-instances)
- [Variables and modes](#variables-and-modes)
- [Structure and idempotence](#structure-and-idempotence)

## What a real plugin does not have

If you have worked through the Figma MCP server, some conveniences you remember are **MCP
additions, not Plugin API**. In a plugin these do not exist:

| you may reach for | it is not there | use instead |
|---|---|---|
| `figma.createAutoLayout(dir, props)` | MCP only | `createFrame()` then set `layoutMode` |
| `node.set({ … })` | MCP only | assign properties one at a time |
| `node.query('FRAME > TEXT')` | MCP only | `findAll` / `findOne` with a predicate |
| `await node.screenshot()` | MCP only | you cannot see the canvas; that is what the harness is for |
| `figma.notify()` | throws in some hosts | post to your plugin UI instead |

Write a tiny `AL(dir, props)` helper on top of `createFrame` in your foundation file and use
it everywhere — it is the single most-used function in the whole pipeline.

## Auto-layout traps

**`resize()` pins both axes to FIXED.** This is the big one. Calling `resize(w, h)` on an
auto-layout frame sets `primaryAxisSizingMode` *and* `counterAxisSizingMode` to `FIXED`,
whatever they were. A hugging button that you resize becomes a fixed-width button, and its
label clips the first time the copy gets longer.

```js
// wrong — the button stops hugging and clips
const b = AL('HORIZONTAL'); b.resize(80, 34);

// right — take the height as a parameter, hand the width back to the content
const b = AL('HORIZONTAL');
b.counterAxisSizingMode = 'FIXED';
b.resize(80, h);
b.primaryAxisSizingMode = 'AUTO';     // width hugs again
```

**Changing `layoutMode` after sizing swaps which axis is which.** "Primary" means horizontal
in a `HORIZONTAL` frame and vertical in a `VERTICAL` one. Build a vertical card that hugs its
height, then flip it to horizontal, and the height-hug silently becomes a width-hug — the card
collapses to its seed height. Make two factory functions rather than mutating `layoutMode`.

**`STRETCH` is a child property, not a parent one.** `counterAxisAlignItems` takes
`MIN | MAX | CENTER | BASELINE` and throws on `STRETCH`. Equal-height siblings come from
setting `layoutAlign = 'STRETCH'` on each **child**.

**`layoutSizing*` and `*AxisSizingMode` are different enums.** Children take
`FIXED | HUG | FILL`; the frame itself takes `FIXED | AUTO`. And `FILL` is only legal once
the node is already inside an auto-layout parent — append first, then set it.

**Absolute positioning inside auto-layout** is `layoutPositioning = 'ABSOLUTE'`, then `x`/`y`.
Without it, a logo you meant to pin to a corner joins the stack.

**Centre by layout, not by arithmetic.** A frame with `primaryAxisAlignItems` and
`counterAxisAlignItems` both `CENTER` centres its content forever. A hand-computed `y` is
correct exactly once — the next copy change leaves the block floating in the top third.

**A grower cannot shrink below its content.** Three siblings with `layoutGrow = 1` each get a
third of the width, and any one of them whose content needs more simply overlaps its
neighbour. Figma does not clamp it and the canvas does not complain. Check it in the harness.

## Text

`createText()` produces `textAutoResize = 'WIDTH_AND_HEIGHT'` — the node grows sideways
forever and never wraps. A paragraph needs `'HEIGHT'` **and** a width. Take the width from
the parent rather than guessing it:

```js
function paraIn(parent, chars, …) {
  const t = T(chars, …);
  t.textAutoResize = 'HEIGHT';
  parent.appendChild(t);            // FILL is only legal once parented
  t.layoutSizingHorizontal = 'FILL';
  return t;
}
```

A guessed width is the single most common source of overflow: a 124px line inside a 100px
card pushes the card, then the column, then the grid.

**Fonts must be loaded before any text is touched**, and that includes appending a text node
or binding a variable on one: `await figma.loadFontAsync({ family, style })` for every
family/style pair, up front.

## Colour and fills

**New frames default to white.** `createFrame()` comes with an opaque white fill, so a frame
meant to be a transparent layout container paints a white box over whatever is behind it, and
white text on it vanishes. Clear it in your `AL` helper: `f.fills = []`.

**Bind, do not literal.** Every colour goes through one helper:

```js
function F(name) {
  return figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', VAR[name]
  );
}
```

`setBoundVariableForPaint` **returns a new paint** — it does not mutate. Capture the result.
Note that the literal colour stays black: that matters for effects, where a failed binding
renders a hard black shadow, so pass the token's real value as the literal too.

Colour channels are 0–1, not 0–255. `fills` and `strokes` are read-only arrays — clone,
modify, reassign.

## SVG and instances

`figma.createNodeFromSvg(string)` is how artwork gets in. Three things to fix in the string
first:

1. **`currentColor` imports as black.** Substitute a real hex before Figma sees it.
2. **Non-standard attributes throw** — `strokeWidth="currentStroke"` and friends. If you are
   lifting markup out of JSX components, convert `strokeWidth` → `stroke-width`, `fillRule`
   → `fill-rule`, strip `className={…}`, and drop any `{expression}`.
3. **A missing `width`/`height`** leaves the node at the viewBox default. Copy them from the
   viewBox.

**Instances do not scale their artwork.** Resizing an instance resizes the frame and leaves
the paths where they were. Set `constraints = { horizontal: 'SCALE', vertical: 'SCALE' }` on
the artwork inside the component, once, at component-creation time.

**Never recolour a multi-colour brand mark.** A logo is often a coloured path plus a *white*
path, or a square with a shape knocked out of it. Flattening it to one colour turns the mark
into a solid blob. Recolour single-colour UI glyphs; leave brand artwork alone. If you need a
heuristic for "is this monochrome", count named colours too, not just `#hex`.

Raster is fine when vector is not available: base64 → `figma.createImage(bytes)` → an
`IMAGE` paint. Write the base64 decoder carefully — masking to 24 bits matters, and a decoder
that is subtly wrong produces artwork that is subtly wrong.

## Variables and modes

`collection.addMode()` throws **`Limited to 1 modes only`** on a Starter plan — multiple modes
per collection is a paid feature. Wrap it in try/catch, write your primary mode to the
collection's existing mode, and treat the single-mode case as correct rather than degraded.

Set `variable.scopes` explicitly when you create one. The default is every scope, which
pollutes every property picker in the file: `['FRAME_FILL', 'SHAPE_FILL']` for surfaces,
`['TEXT_FILL']` for text, `['STROKE_COLOR']` for borders, `['EFFECT_COLOR']` for shadows.

## Structure and idempotence

A generator that stacks duplicates on every run is unusable. Make the build reentrant:

- **Look up before creating.** Pages, components and variables are found by name and reused;
  only what is missing is created.
- **Delete the screens, keep the system.** Clear generated frames by a name pattern at the
  start of the run, then rebuild. Tokens and components survive, so instances stay linked and
  nobody loses their overrides.
- **Match old naming patterns when you rename.** A clear-regex that only knows the current
  scheme orphans everything from the previous one.
- **Rename pages in place** rather than creating a new one, or the old page lingers with a
  stale build on it.

`figma.createPage()` exists only in Design files — it throws in FigJam and Slides.
