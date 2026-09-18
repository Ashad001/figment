# Layer 2 and 3 — assets and illustrations

## Icons: take them from the code

Redrawing icons in Figma guarantees the design and the product drift. Extract instead.

Write a small Node script that reads the product's icon source, normalises each SVG, and
writes a generated JS file the plugin concatenates. Keep it a script, not shell history — the
whole point is that anyone can re-run it when an icon changes.

```
extract-assets.mjs   reads  src/icons/<name>/index.tsx   → writes src/02-assets.js
                     reads  brands/*.svg  and  brands/*.png
```

What normalising means in practice:

- strip `className={…}` and any `{expression}` left over from JSX
- convert camelCase attributes to kebab: `strokeWidth` → `stroke-width`, `fillRule` →
  `fill-rule`, `clipPath` → `clip-path`, `stopColor` → `stop-color`
- replace non-standard values (`strokeWidth="currentStroke"`) with real ones
- copy `width`/`height` from the `viewBox` if missing, and add `xmlns`
- substitute `currentColor` for a real hex — Figma imports it as black otherwise

Import each normalised string once as a component, then instance it. Recolouring happens at
instance time by walking the paths and reassigning bound fills and strokes.

**Name traps are real.** Icon sets accumulate names that do not mean what they say — a
"clock" that is a history glyph, a "store" that is four circles, two different files both
exporting `ToolsIcon`, an `x` that is a close-cross and a `twitter` that is the X logo.
Compare path data before substituting one name for another; a reviewer will spot the wrong
glyph immediately and it reads as carelessness.

## Brand marks

Three sources, in order of preference:

1. **The product's own icon package**, if it already vendors the mark.
2. **An open icon set** (Simple Icons and similar) fetched into a `brands/` folder as SVG.
   These ship monochrome, so inject the brand's own hex into the root `fill` — a black
   Instagram mark looks broken.
3. **A favicon as raster**, for brands that have asked to be removed from the open sets.
   Base64 it into the generated assets file and build an `IMAGE` paint.

Drop-in beats hard-coding: let `brands/*.svg` and `brands/*.png` be picked up automatically by
filename, so adding a mark needs no code change.

**Never recolour a brand mark.** See `plugin-api.md` — a mark is usually more than one colour
and flattening it produces a blob. Provide two accessors: one that returns a neutral tile with
the mark inside for lists, and one that returns the bare artwork for when you are drawing your
own tile.

## Illustrations, procedurally

Avatars, empty-state art, decorative blobs and chart shapes do not need to be drawn by hand.
A table plus a loop gives a consistent set and costs almost nothing:

```js
const TONES  = [['mint', 'bloom', 'c8f07a', '5fd3b2'], ['sky', 'clover', '8fc0ff', '4c7ff0']];
const SIZES  = [20, 24, 32, 40, 64];

for (const [tone, shape, from, to] of TONES) {
  for (const size of SIZES) {
    // createStar with a high innerRadius → a soft petal blob
    // createPolygon, createEllipse, or a boolean op → other families
    // a GRADIENT_LINEAR fill from `from` to `to`
    // wrap in a component named `avatar/<tone>-<size>`
  }
}
```

Generate a component per (tone × size) rather than one that gets resized, because instances do
not scale their artwork. Name the missing case loudly — a lookup that fails should say
`No avatar/mint-22. Sizes built: 20, 24, 32, 40, 64`, not `undefined.createInstance`.

Gradient meshes, mock imagery and chart bars are the same idea: a small table of gradient
pairs and a function that returns a frame. It keeps placeholder art on-brand instead of
grey boxes, without anyone sourcing stock images.

## Keeping the generated file honest

`src/02-assets.js` is machine-written. Put a header on it saying so, and say which script
regenerates it. The next person to open it will otherwise hand-edit a file that is about to be
overwritten.
