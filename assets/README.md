# Figment — the plugin scaffold

Generates a design system, components, illustrations and screens into whatever Figma file you
run it in. Copy this folder into your repo (`tools/figma-plugin/` is a good home) and start
replacing the placeholders.

## Run it

```bash
./build.sh && node test/run.cjs     # the inner loop — seconds, no Figma
```

Then, in the **Figma desktop app** (a manifest plugin will not load in the browser):

1. Open the file you want to build into — any file you can edit; a fresh one is fine.
2. Plugins → Development → **Import plugin from manifest…** → pick `manifest.json`
3. Plugins → Development → **Figment → Build the screens**

Re-running replaces the screens in place and reuses the tokens and components, so it never
forks the design system or stacks duplicates.

## Layout

```
manifest.json          the plugin Figma loads
ui.html                progress log + the dump textarea
build.sh               concatenates src/*.js into code.js, then node --check
extract-assets.mjs     product icons + ./brands/* → src/02-assets.js
brands/                drop .svg or .png here; the filename becomes the key
src/
  01-foundation.js     tokens, fonts, layout vocabulary   ← start here
  02-assets.js         GENERATED — do not hand-edit
  03-components.js     pages, icon/brand/shape components, accessors
  04-screens.js        composition only
  05-main.js           ORDER, build, dump
test/
  mock-figma.cjs       a fake `figma` global that validates like the real one
  layout.cjs           auto-layout engine — reports overflow and overlap
  run.cjs              runs code.js against the mock and prints the tree
```

## Where to start

1. **`src/01-foundation.js` → `TOKENS`.** Replace the placeholder palette with the product's
   real values, read off the shipped components. Set `FONT` to the real typeface.
2. **`extract-assets.mjs` → `ICONS_DIR` and `ICONS`.** Point them at the product's icon
   source, run `node extract-assets.mjs`, then `./build.sh`.
3. **`src/04-screens.js`.** Delete the example and write the first real screen.
4. **`src/05-main.js` → `ORDER`.** One row per screen: name, builder, section label.

## The second command

**Dump this file's design system** prints the file's variable collections (with resolved
values per mode), text styles, paint styles and component names as JSON. Run it in *any*
file — including one you did not generate — press **Copy**, and you have a machine-readable
description of somebody else's design system to build against.

## Rules that keep this working

- **Never hand-edit a generated frame.** The next run deletes it.
- **`./build.sh && node test/run.cjs` is one habit.** Editing `src/` without rebuilding means
  the harness and Figma both ran the old code.
- **Every escape is a harness bug.** If Figma shows something the harness called clean, fix
  the design *and* add the check.
