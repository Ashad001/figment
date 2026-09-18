# Figment

**Design Figma files from code. Without opening Figma.**

Figment is an agent skill for generating and iterating on real Figma design — a design
system, a component library, illustrations and complete screens — straight from a codebase.
It drives a local Figma plugin, and ships an offline layout engine that catches overflow,
clipping and overlap before the canvas is ever opened.

So the agent designs blind, and is still right.

## Why

Figma's MCP server is the right tool for reading a design and for one-off edits. It is the
wrong tool for *generating and then iterating on* a large one: it is metered (twenty tool
calls a month on a Starter plan, for every seat type), every call is a network round-trip,
and nothing it produces is reproducible.

A local plugin has none of those limits. Same Plugin API, different transport. And because
the plugin lives in the repo, the design becomes source code — diffable, reviewable,
regenerable, and correct by construction once a bug is fixed.

The catch is that a plugin runs in the Figma desktop app, so you cannot see the canvas. That
is what the harness is for: it executes the plugin against a mock Plugin API and a small
auto-layout engine, and fails the build on anything that would overflow, clip or overlap.

```
   edit src/*.js  →  ./build.sh  →  node test/run.cjs     ← seconds, no Figma
                            ↓  clean
                     run the plugin in Figma              ← once per batch
                            ↓
                     screenshot → review → notes
```

## Install

```bash
git clone https://github.com/Ashad001/figment.git
cp -r figment ~/.claude/skills/figment
```

It then triggers on its own for requests like "build these screens in Figma", "push our
design system to Figma", "generate a component library", or "keep Figma in sync with the
code" — and can always be invoked by name.

## What is in here

```
SKILL.md                  the skill: the loop, the build order, the rules
references/
  design-system.md        tokens as variables, modes, type scale, component vs function
  assets.md               icons from code, brand marks, procedural illustrations
  plugin-api.md           the API traps — read this early, it is where the hours go
  test-harness.md         what the offline checks cover, and how to add one
  iterating.md            review feedback → fix → the check that prevents a repeat
assets/                   a working plugin scaffold: copy it into the target repo
```

`assets/` runs as-is:

```bash
cd assets && ./build.sh && node test/run.cjs
# OK — 2 screen(s), no runtime errors, no layout overflow.
```

## Build order

Each layer is consumed by the next, so out of order means rework.

1. **Tokens → Figma variables.** Every later fill binds to a variable, never a literal. A
   mode switch then reskins the whole file for free.
2. **Assets → components.** Icons pulled from the product's own source, so Figma and the
   shipped UI cannot drift. Brand marks from an open icon set, raster where vector is gone.
3. **Illustrations.** Avatars, blobs, empty-state art — drawn procedurally from a table of
   tones and shapes rather than sourced.
4. **Components.** Real Figma components where a human needs a handle on them; plain factory
   functions everywhere else.
5. **Screens.** Composition only.

## What the harness catches

| finding | means |
|---|---|
| `text-too-wide` | the longest unbreakable word exceeds the space given |
| `too-wide` / `too-tall` | a fixed-size frame's content cannot fit it |
| `row-overflow` | fixed children plus gaps already exceed the row |
| `grower-overflow` | a `layoutGrow` child needs more than its share, so it will overlap |

Plus the API's own validation, mirrored in the mock: invalid enums, `FILL` on a node with no
auto-layout parent, text touched before its font loaded, a missing asset named properly
rather than `undefined.createInstance`, and `addMode` throwing on a Starter plan so the
degraded path is the one exercised.

## Licence

MIT
