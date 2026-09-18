---
name: figment
description: >
  Figment builds and iterates on a Figma design system, component library, illustrations and
  complete screens straight from code, using a local Figma plugin plus an offline harness that catches
  layout bugs before Figma is ever opened. Use this whenever someone wants design generated
  into Figma from a codebase, a token file or a spec — "build these screens in Figma", "push
  our design system / tokens to Figma", "generate a component library in Figma", "make a
  Figma file for this app", "keep Figma in sync with the code" — and especially when the
  Figma MCP server is unavailable, rate-limited, or the seat cannot edit the file. Use it too
  when iterating on generated Figma output from screenshots and review notes, or whenever the
  design needs to be reproducible, diffable and versioned in git instead of hand-drawn.
---

# Generating Figma from code, with a plugin

Figma's MCP server is the right tool for reading a design and for one-off edits. It is the
wrong tool for *generating and then iterating on* a large design, for three reasons: it is
metered (a Starter plan allows twenty tool calls **per month**, for every seat type), each
call is a network round-trip, and nothing it produces is reproducible — rerun it and you get
a slightly different file.

A local plugin has none of those limits. It is the same Plugin API; only the transport
changes. And because the plugin is a file in the repo, the design becomes source code:
diffable, reviewable, regenerable, and correct by construction after the first time you fix
a bug.

**The trade you are making:** a plugin runs in the Figma desktop app, so there is a human in
the loop on every run (Plugins → Development → your plugin). You will not see the canvas.
That sounds fatal and is not — see *The loop* below.

## Quick start

`assets/` in this skill is a working plugin scaffold. Copy it into the target repo, then:

```bash
cp -r <skill>/assets <repo>/tools/figma-plugin
cd <repo>/tools/figma-plugin
./build.sh && node test/run.cjs        # should print: OK — 1 screen, no layout overflow
```

Then in the **Figma desktop app** (not the browser — a manifest plugin needs desktop):
Plugins → Development → Import plugin from manifest… → pick `manifest.json` →
Plugins → Development → *your plugin* → Build.

Now start replacing the placeholder tokens with the real ones. Read `references/design-system.md`
before you do.

## The loop

This is the part that decides whether the whole approach is pleasant or miserable.

```
   edit src/*.js  →  ./build.sh  →  node test/run.cjs     ← seconds, no Figma
                            ↓  clean
                     run the plugin in Figma              ← once per batch
                            ↓
                     screenshot → review → notes
                            ↓
                     back to the top
```

**The inner loop never opens Figma.** `test/run.cjs` executes the plugin against a mock
Plugin API and a small auto-layout engine, and fails the build on anything that would
overflow, clip or overlap. That is the whole reason this is viable: without it you are
round-tripping to a screenshot to discover a text node is twelve pixels too wide.

Treat a harness miss as a bug in the harness. Every time Figma shows something the harness
called clean — an overlap, a clipped label, an invalid enum — the fix is *two* commits: the
design fix, and the check that would have caught it. The harness in `assets/test/` already
carries the checks earned this way; `references/test-harness.md` explains how to add more.

**Never hand-edit the generated frames.** The plugin deletes and rebuilds them on every run.
If something is wrong on the canvas, it is wrong in `src/`.

## Build in this order

Each layer is consumed by the next, so building out of order means rework.

**1 · Tokens → Figma variables.** A `Design System` page and a variable collection. Every
fill, stroke and text colour in every later layer binds to a variable, never a literal. Do
this first and a mode switch reskins the entire file for free; skip it and you will be
find-and-replacing hex codes forever. → `references/design-system.md`

**2 · Assets → components.** Icons, logos and brand marks, imported once as components and
instanced everywhere. Pull the geometry from the codebase's own icon files rather than
redrawing it, so the Figma icon and the shipped icon cannot drift.
→ `references/assets.md`

**3 · Illustrations.** Avatars, blobs, empty-state art, gradient meshes, chart shapes. Draw
these procedurally from a small table of tones and shapes — a loop that emits a component
per (tone × size) is a few lines and gives you a consistent set no one has to redraw.
→ `references/assets.md`

**4 · Components.** The repeating pieces: button, pill, card, row, input, avatar stack,
nav item. Build them as real Figma components where they are genuinely reused across
screens, and as plain factory functions where they are not — a component for something used
once is a maintenance cost with no payoff.

**5 · Screens.** Composition only. By the time you are here a screen should read as a list
of calls, and a new screen should take minutes.

Keep each layer in its own numbered source file and concatenate them in `build.sh`. Function
declarations hoist across the concatenated file, so the layers can call each other freely and
the numbering is purely for humans.

## Working from a design reference

When there is a canvas, a screenshot or a running product to match:

- **Measure, do not eyeball.** Read computed styles from the running product or the exported
  frame and compare numbers. Padding, radius, line-height and weight are where generated
  design looks "almost right" and nobody can say why.
- **Where a reference and a design system disagree**, the system owns tokens, components,
  mechanics and accessibility; the reference owns per-surface pixels. Where the reference is
  silent — responsive behaviour, focus states, empty states — the system wins, because one
  artboard cannot be an authority on any of them.
- **Repetition beats annotation.** If a note says 20px and seven instances draw 18px, the
  drawing is the decision and the note is a summary.

## Iterating

Most review feedback on generated design is one of a handful of shapes. `references/iterating.md`
maps the common ones — overlap, "too wordy", wrong icon, stale build, drift from the product —
onto the fix and, more importantly, onto the harness check that prevents a repeat.

Two habits worth keeping from the start:

- **A screen builder takes parameters, it does not get copied.** The moment you need "the same
  screen but with the panel open", add an argument. Two copies drift within a day.
- **Position and name screens from one table.** A single `ORDER` array that maps name → builder
  → grid position means the canvas can be reordered without touching a builder, and the layer
  list sorts the way the product reads.

## Honesty about data

Generated screens are persuasive, which makes them dangerous. When the design calls for
something the backend cannot supply — a progress percentage, a metric from a service nobody
has connected, an approval that is not wired — render the honest state: indeterminate rather
than invented, a disabled control with a reason, an empty plot rather than a blurred one.
A stakeholder who signs off on a number that does not exist is worse off than one who can
see the gap.

## Reference files

| file | read it when |
|---|---|
| `references/design-system.md` | setting up tokens, variables, modes, type scale |
| `references/assets.md` | importing icons, brand marks, rasters; drawing illustrations |
| `references/plugin-api.md` | **before writing layout code** — the API traps, all of them |
| `references/test-harness.md` | extending the offline checks, or one missed something |
| `references/iterating.md` | acting on review feedback |

`references/plugin-api.md` is the one to read early. Almost every hour lost to this approach
is lost to four or five specific behaviours of the auto-layout API, and they are all in there.
