# Figment — the plugin scaffold

Generates a design system, components, illustrations and screens into whatever Figma file you
run it in. Copy this folder into your repo (`tools/figma-plugin/` is a good home) and start
replacing the placeholders.

## Run it

```bash
./build.sh && node test/run.cjs     # the inner loop — seconds, no Figma
```

`build.sh` also registers this project with the one Figment plugin in `~/.figment` (set
`FIGMENT_HOME` to move it, `FIGMENT_PROJECT` to rename the project — needed when one repo holds
two scaffolds). Then, in the **Figma
desktop app** (a manifest plugin will not load in the browser):

1. **Once, ever:** Plugins → Development → **Import plugin from manifest…** →
   `~/.figment/plugin/manifest.json` (Cmd+Shift+. shows hidden folders). Every project you
   build afterwards appears in this same plugin.
2. Open this project's Figma file — one file per project; a fresh one is fine.
3. Plugins → Development → **Figment → Build**, pick the project, press **Build**. The first
   build labels the file with the project.

From then on, opening the plugin in that file — or pressing **Rebuild** in the right sidebar
with nothing selected — rebuilds it straight away. Building a different project into a
labelled file stops and asks first. To drop a project from the plugin, delete its file in
`~/.figment/projects/` and build any project.

Re-running replaces the screens in place and reuses the tokens and components, so it never
forks the design system or stacks duplicates.

## Layout

```
build.sh               concatenates src/*.js into code.js, checks it, runs register.mjs
register.mjs           registers code.js in ~/.figment and regenerates the one plugin
plugin/                copied to ~/.figment/plugin — what Figma imports, once
  manifest.json
  ui.html              project picker, file label, progress log, dump output
  runner.js            the shared entry point: panel, label check, dump
extract-assets.mjs     product icons + ./brands/* → src/02-assets.js
brands/                drop .svg or .png here; the filename becomes the key
src/
  01-foundation.js     tokens, fonts, layout vocabulary   ← start here
  02-assets.js         GENERATED — do not hand-edit
  03-components.js     pages, icon/brand/shape components, accessors
  04-screens.js        composition only
  05-main.js           ORDER and build()
test/
  mock-figma.cjs       a fake `figma` global that validates like the real one
  layout.cjs           auto-layout engine — reports overflow and overlap
  run.cjs              runs code.js against the mock and prints the tree
  runner.cjs           checks the file label, the wrong-project warning and the registry
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

## Upgrading an existing copy

A copy made before the shared plugin has its own `manifest.json`, which Figma imports once per
project. To move it onto the shared plugin:

1. Copy `build.sh`, `register.mjs`, `plugin/` and `test/runner.cjs` in from the skill's
   `assets/`. Don't copy the rest of `test/` over yours — it may hold checks this project
   added. Port two edits from the skill's copies instead: `test/run.cjs` calls `build()` itself
   and forbids `figma.showUI`; `test/mock-figma.cjs` gains `getPluginData`, `setPluginData`,
   `setRelaunchData` and `figma.ui.resize`.
2. Delete the copy's own `manifest.json` and `ui.html`.
3. In `src/05-main.js`, delete `figma.showUI(…)`, the `figma.ui.onmessage` handler, `dump()`
   and the last three lines (`COMMANDS` and `run`). `src/01`–`04` stay as they are.
4. `./build.sh && node test/run.cjs`, then in Figma remove the old "Figment" entries
   (Plugins → Development → Manage plugins in development) and import
   `~/.figment/plugin/manifest.json` once.

Files built before the upgrade carry no project label, so the first build in each asks once
before labelling it.
