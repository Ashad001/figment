# The offline harness

The harness is what makes this approach viable rather than merely possible. It runs the
plugin outside Figma and fails the build on anything that would look wrong inside it.

Three files in `assets/test/`:

| file | job |
|---|---|
| `mock-figma.cjs` | a fake `figma` global: nodes, components, variables, fonts, and the API's *validation* |
| `layout.cjs` | a small auto-layout engine that assigns widths the way Figma does and reports overflow |
| `run.cjs` | executes `code.js` against the mock, prints the tree, runs the checks |

```bash
./build.sh && node test/run.cjs
```

```
pages      : Design System | Screens
components : 41
screens    : 9
  - 01 home        @    0,    0   279 nodes
  - 02 settings    @ 1560,    0   245 nodes
text nodes : 351

OK — 9 screens, no runtime errors, no layout overflow.
```

## What the mock is actually for

Not fidelity — **validation**. The mock's value is that it throws where the real API throws,
in the same words, a thousand times faster. It currently guards:

- **enum values** — `counterAxisAlignItems` rejects `STRETCH`, `layoutSizing*` rejects
  `AUTO`, and so on, with the real error text
- **structural rules** — `FILL` only on a child of an auto-layout parent, `HUG` only on an
  auto-layout frame or a text child
- **font loading** — touching text with an unloaded font throws, as it does in Figma
- **missing assets** — a named error, `No avatar/mint-22. Sizes built: …`, rather than
  `undefined.createInstance`
- **plan limits** — `addMode` throws `Limited to 1 modes only` by default, so the degraded
  path is the one exercised; an env var flips it

It also mirrors small behaviours that are easy to forget, like a text node flipping to
`textAutoResize = 'HEIGHT'` the moment you make it `FILL`.

## What the layout engine checks

It is not a renderer. It assigns widths top-down — fixed, then fill, then grow-share — and
measures text against the width it actually received. It reports:

| finding | means |
|---|---|
| `text-too-wide` | the longest unbreakable word exceeds the space given |
| `too-wide` / `too-tall` | a fixed-size frame's content cannot fit it |
| `row-overflow` | fixed children plus gaps already exceed the row |
| `grower-overflow` | a `layoutGrow` child's content needs more than its share, so it will overlap |

The distinction that matters is between **what a node was given** and **what its content
cannot go below**. A grower's declared width is irrelevant — it gets a share — so the engine
tracks a separate `need` up the tree. Without that it reports the declared width and misses
exactly the overlaps you care about.

Character width is approximated (`chars × 0.53 × fontSize` for a typical UI sans). It is a
heuristic; tune the constant to the real typeface if labels come out consistently wrong. Being
slightly pessimistic is the right bias — a false alarm costs a minute, a missed overlap costs
a review cycle.

## Extending it

**Every escape is a harness bug.** When Figma shows something the harness called clean, fix
both:

1. the design bug in `src/`
2. the check in `test/` that would have caught it

Then prove the check works, on its own, before you trust it:

```bash
node -e "
const {figma}=require('./test/mock-figma.cjs');
const f=figma.createFrame();
try { f.counterAxisAlignItems='STRETCH'; console.log('NOT CAUGHT'); }
catch(e){ console.log('caught:', e.message); }"
```

A check you added but never saw fire is a check you do not have. This is also why the harness
is worth more over time than the screens are: the screens get redrawn, the accumulated
knowledge of how the API bites does not.

## What it cannot see

Be honest about the gap. The harness knows nothing about:

- colour, contrast, or whether a fill reads on its background
- whether a shadow, radius or gradient looks right
- absolute-positioned overlaps (it excludes them from the stack; that is deliberate)
- anything about *taste*

So the outer loop still exists — build in Figma, screenshot, review. The harness just makes
sure the outer loop is spent on judgement rather than on finding a twelve-pixel overflow.
