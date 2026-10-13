# One Plugin for Every Project — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** You import the Figment plugin into Figma once, pick a project from a dropdown, and
each Figma file is labelled with its project so another project can't build over it.

**Architecture:**
- `build.sh` runs a new `register.mjs`, which copies the project's `code.js` into
  `~/.figment/projects/` and regenerates one bundle in `~/.figment/plugin/`. In that bundle
  every project is wrapped in its own function, followed by a shared `runner.js`.
- `runner.js` owns the panel, the file label (plugin data on `figma.root`), the wrong-project
  warning, the Rebuild button and `dump`.
- A project's bundle no longer starts itself; it only defines `build()`.

**Tech Stack:** plain JavaScript (Figma Plugin API sandbox), Node stdlib only (≥ 18; local is
v26), bash, HTML/CSS.

**Spec:** `docs/superpowers/specs/2026-10-09-one-plugin-design.md`

## Global Constraints

- **Git:** never run `git commit`, `git push`, `git add`, `git mv`, `git stash` or anything
  else that writes to git. The user commits after reviewing. Move files with plain `mv`. Each
  task ends by listing its changed files, one line each.
- **Never write to the real `~/.figment`:**
  - Every command that runs `build.sh` or `register.mjs` sets
    `FIGMENT_HOME` to a scratch folder. The steps below call that path `$FH`, so run
    `export FH="$(mktemp -d)"` first.
  - `test/runner.cjs` makes its own temporary folder.
- **No new dependencies.** Use the Node stdlib only.
- **Files not to edit:** `assets/src/01-foundation.js`, `02-assets.js`, `03-components.js`,
  `04-screens.js`, `assets/extract-assets.mjs`, `assets/test/layout.cjs`.
- **Plugin main-thread code** (`assets/src/*.js`, `assets/plugin/runner.js`):
  - follow the existing style: `function () {}` callbacks, `const`/`let`, no arrow functions
  - no `setTimeout` and no `fetch`; the Figma sandbox has neither
- **Arrow functions:** `assets/test/*.cjs` and `assets/plugin/ui.html` may use them, like the
  current files do.
- **Minimal diffs:** no reformatting or reordering of lines you aren't changing.
- **Names:**
  - pages stay `Design System` and `Screens`; the variable collection stays `Theme`
  - the file label is plugin data key `project` on `figma.root`
  - relaunch data is `{ build: <project name> }`
- **Figma theme CSS variables** (checked against Figma's docs 2026-10-09):
  - `--figma-color-bg`, `--figma-color-bg-secondary`
  - `--figma-color-text`, `--figma-color-text-secondary`
  - `--figma-color-border`
  - `--figma-color-bg-brand`, `--figma-color-text-onbrand`
  - `--figma-color-bg-warning-tertiary`, `--figma-color-text-warning`

  Every `var()` carries a fallback.

## Review Focus

These five cases are the most likely to hurt someone and nothing else in the spec tests
them. Each one gets a test in Task 2:

1. **Clicking Build again during a build** (or a slow double click): the second request is
   ignored instead of starting a second build alongside the first.
2. **A file labelled with a project this machine doesn't have** (renamed or deleted): it
   doesn't build on open. The newest project is preselected, and building it shows the
   warning.
3. **A project name with spaces or symbols** (`My App!`): the file is `projects/My-App-.js`,
   and the dropdown shows `My App!`.
4. **A stray `.js` file without the header in `projects/`:** it's skipped with a message, and
   registration and the plugin keep working.
5. **A project bundle whose last line is a `//` comment with no newline:** the wrapper's
   `return { build }` still runs, instead of being commented out.

## File map

All paths are under `assets/`.

| File | Responsibility | Task |
|---|---|---|
| `src/05-main.js` | `ORDER` + `build()`; nothing runs on load | 1 |
| `test/run.cjs` | per-project layout harness; now calls `build()` itself | 1 |
| `test/mock-figma.cjs` | + `getPluginData` / `setPluginData` / `setRelaunchData` on nodes, + `figma.ui.resize` | 2 |
| `test/runner.cjs` | **new**: label, warning, auto-build, dump, busy and registry checks | 2 |
| `plugin/manifest.json` | **moved** from `manifest.json`; menu "Build"; `relaunchButtons` | 2 |
| `plugin/runner.js` | **new**: the shared entry point | 2 |
| `register.mjs` | **new**: registry + bundle generator | 2 |
| `build.sh` | + `node register.mjs` | 2 |
| `plugin/ui.html` | **moved** from `ui.html` in Task 2; rewritten in Task 3 | 2, 3 |
| `README.md`, `../SKILL.md`, `../README.md` | install-once instructions | 4 |

---

### Task 1: The project bundle stops starting itself

**Files:**
- Modify: `assets/test/run.cjs:13-26`
- Modify: `assets/src/05-main.js:1-13` and `:81-109`

**Interfaces:**
- **Produces:** `code.js` defines top-level `async function build()` and
  `function say(text)`. Nothing runs at load, and nothing calls `figma.showUI`. Task 2's
  `register.mjs` relies on a top-level `build` existing.

- [ ] **Step 1: Write the failing test.** In `assets/test/run.cjs`, replace lines 13-26:

```js
const code = fs.readFileSync(path.join(__dirname, '..', 'code.js'), 'utf8');
const ctx = vm.createContext({ figma, __html__: '<html></html>', console, process, setTimeout, Promise });

let failed = null;
try {
  vm.runInContext(code, ctx, { filename: 'code.js' });
} catch (e) {
  failed = e;
}

// The plugin's entry point is async, so give the microtask queue a turn before inspecting.
setTimeout(() => {
  if (failed) { console.error('\nTHREW SYNCHRONOUSLY:\n', failed.stack); process.exit(1); }
```

with:

```js
const code = fs.readFileSync(path.join(__dirname, '..', 'code.js'), 'utf8');
const ctx = vm.createContext({ figma, __html__: '<html></html>', console, process, setTimeout, Promise });
// The panel belongs to plugin/runner.js; a project bundle that opened its own would replace it.
figma.showUI = function () { throw new Error('code.js called figma.showUI — only plugin/runner.js may'); };

let failed = null;
try {
  vm.runInContext(code, ctx, { filename: 'code.js' });
  // code.js only defines things now. In Figma the runner calls build(), so the harness does here.
  ctx.build().catch((e) => { failed = e; });
} catch (e) {
  failed = e;
}

// build() is async, so give the microtask queue a turn before inspecting.
setTimeout(() => {
  if (failed) { console.error('\nTHREW:\n', failed.stack); process.exit(1); }
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `cd assets && ./build.sh && node test/run.cjs`
(`build.sh` doesn't register anything yet in this task.)
Expected: exit 1, printing `THREW:` and `code.js called figma.showUI — only plugin/runner.js may`.

- [ ] **Step 3: Make 05-main.js define things only.**
  - Replace lines 1-13 of `assets/src/05-main.js`:

```js
// Entry point.
//
// Two commands:
//   build — regenerate the design system and every screen in whatever file this runs in
//   dump  — read THIS file's design system out as JSON, for porting or for review

figma.showUI(__html__, { width: 460, height: 520 });

function say(text) { figma.ui.postMessage({ type: 'log', text: text }); }

figma.ui.onmessage = function (msg) {
  if (msg && msg.type === 'close') figma.closePlugin();
};
```

with:

```js
// Entry point.
//
// build() regenerates the design system and every screen in whatever file this runs in.
// Nothing here runs on load: plugin/runner.js owns the panel, the file's project label and the
// dump command, and calls build() when this project is picked.

function say(text) { figma.ui.postMessage({ type: 'log', text: text }); }
```

  - Then delete everything after the closing `}` of `build()`: the blank line, the `dump()`
    doc comment and function, `const COMMANDS …`, `const run …` and `run().catch(…)`. That's
    old lines 81-109. The file must end with `build()`'s closing brace and a newline. Keep
    `dump()`'s body somewhere you can copy it from: Task 2 moves it into the runner unchanged,
    and the full text is repeated in Task 2, Step 6.

- [ ] **Step 4: Run it and confirm it passes.**

Run: `cd assets && ./build.sh && node test/run.cjs`
Expected: exit 0; the last line is `OK — 2 screen(s), no runtime errors, no layout overflow.`

- [ ] **Step 5: Report; don't commit.** Changed:
  - `assets/test/run.cjs`: calls `build()` and forbids `showUI`
  - `assets/src/05-main.js`: no longer starts itself; `dump` leaves

---

### Task 2: The shared runner and the project registry

**Files:**
- Modify: `assets/test/mock-figma.cjs`: inside `makeNode`, after `n.createInstance` (line 72);
  and in the `ui: {` block (lines 213-216)
- Create: `assets/test/runner.cjs`
- Move: `assets/manifest.json` → `assets/plugin/manifest.json` (and edit it)
- Move: `assets/ui.html` → `assets/plugin/ui.html` (content unchanged until Task 3)
- Create: `assets/plugin/runner.js`
- Create: `assets/register.mjs`
- Modify: `assets/build.sh` (append one line)

**Interfaces:**
- **Consumes:** Task 1's top-level `build()` in `code.js`.
- **Produces** (Task 3's panel and Task 4's docs depend on these exact names):
  - **`register.mjs` command line:**
    - Env `FIGMENT_HOME` defaults to `~/.figment`. Env `FIGMENT_PROJECT` defaults to the
      folder name of `git rev-parse --show-toplevel`, or the scaffold folder without git.
    - Exits 1 with `… is already registered from <path>` on a collision.
    - Prints `registered <name> (<n> project[s])`.
  - **Project file:** `$FIGMENT_HOME/projects/<slug>.js`, where slug = name with
    `[^A-Za-z0-9._-]` → `-`. The first line is
    `// figment-project {"name":…,"path":…,"builtAt":<ISO>}`, then the project's `code.js`.
  - **Bundle:** `$FIGMENT_HOME/plugin/code.js` declares
    `const PROJECTS = Object.create(null)` and
    `PROJECTS[name] = { builtAt: string, load: function () → { build } }`, then `runner.js`.
  - **Runner → panel messages:**
    - `{type:'init', projects:[{name, builtAt}], label: string|null, selected: string|null}`
    - `{type:'log', text}`
    - `{type:'busy', busy: boolean}`
    - `{type:'confirm', project, label: string|null}`
    - `{type:'label', label}`
    - `{type:'dump', text}`
  - **Panel → runner messages:** `{type:'build', project, force?: true}` and `{type:'dump'}`.
  - **`figma.ui.onmessage(msg)`** returns a Promise that settles when that run is finished.
    The tests await it.

- [ ] **Step 1: Add plugin data and `ui.resize` to the mock.**
  - In `assets/test/mock-figma.cjs`, insert after the `n.createInstance = function () { … };`
    block (after line 72, before the `// Enum-valued layout properties.` comment):

```js

  // Plugin data is a string store on any node; the runner keeps the file's project label on the
  // document. Like the real API: '' for a key never set, and only strings may be stored.
  const pluginData = Object.create(null);
  n.getPluginData = function (key) { return pluginData[key] || ''; };
  n.setPluginData = function (key, value) {
    if (typeof value !== 'string') throw new Error('setPluginData("' + key + '"): value must be a string, got ' + typeof value);
    pluginData[key] = value;
  };
  n.setRelaunchData = function (data) {
    for (const k of Object.keys(data)) {
      if (typeof data[k] !== 'string') throw new Error('setRelaunchData: description for "' + k + '" must be a string');
      if (data[k].length > 1000) throw new Error('setRelaunchData: description for "' + k + '" exceeds 1000 characters');
    }
    n.relaunchData = data;
  };
```

  - Then, in the `ui: {` block, replace:

```js
    onmessage: null,
  },
```

with:

```js
    onmessage: null,
    resize: function (w, h) {
      if (typeof w !== 'number' || typeof h !== 'number' || !(w > 0) || !(h > 0)) {
        throw new Error('figma.ui.resize(' + w + ', ' + h + ') — needs two positive numbers');
      }
    },
  },
```

- [ ] **Step 2: Write the failing test.** Create `assets/test/runner.cjs`:

```js
// Checks the one-plugin runner end to end against the mock: the file's project label, the
// wrong-project warning, building on open, dump, one run at a time, and register.mjs.
//
// Run after ./build.sh (it registers the scaffold's code.js). It uses its own temporary
// FIGMENT_HOME, so it never touches the real ~/.figment.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const dir = path.join(__dirname, '..');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'figment-home-'));
const projects = path.join(home, 'projects');

function register(name) {
  const r = spawnSync(process.execPath, [path.join(dir, 'register.mjs')], {
    env: Object.assign({}, process.env, { FIGMENT_HOME: home, FIGMENT_PROJECT: name }),
    encoding: 'utf8',
  });
  return { status: r.status, out: r.stdout + r.stderr };
}

function registered(name) {
  const r = register(name);
  assert.strictEqual(r.status, 0, 'register ' + name + ' failed:\n' + r.out);
  return r;
}

/** A fresh mock file with the generated plugin loaded. `before` can label it or add pages first. */
function open(command, before) {
  delete require.cache[require.resolve('./mock-figma.cjs')];
  const mock = require('./mock-figma.cjs');
  const sent = [];
  mock.figma.ui.postMessage = (m) => { sent.push(m); };
  mock.figma.command = command;
  if (before) before(mock);
  const code = fs.readFileSync(path.join(home, 'plugin', 'code.js'), 'utf8');
  vm.runInContext(code, vm.createContext({ figma: mock.figma, __html__: '<html></html>', console, Promise }),
    { filename: 'plugin/code.js' });
  return { figma: mock.figma, root: mock.root, sent };
}

const of = (f, type) => f.sent.filter((m) => m.type === type);
const label = (f) => f.root.getPluginData('project');
const screens = (f) => {
  const page = f.root.children.find((p) => p.name === 'Screens');
  return page ? page.children.filter((n) => /^\d\d /.test(n.name)).map((n) => n.id) : [];
};

/** Resolves once a run the runner started by itself (on open) has finished. */
function settled(f) {
  return new Promise((resolve) => {
    (function poll() {
      const b = of(f, 'busy');
      if (b.length && !b[b.length - 1].busy) resolve(); else setTimeout(poll, 5);
    })();
  });
}

async function main() {
  registered('a');
  registered('b');

  // A new file waits for a click; the first build labels it.
  let f = open('build');
  assert.strictEqual(of(f, 'busy').length, 0, 'a new file must not build on open');
  const init = of(f, 'init')[0];
  assert.deepStrictEqual(init.projects.map((p) => p.name), ['a', 'b']);
  assert.strictEqual(init.label, null);
  assert.strictEqual(init.selected, 'b', 'preselects the newest build');
  await f.figma.ui.onmessage({ type: 'build', project: 'a' });
  assert.strictEqual(label(f), 'a');
  assert.deepStrictEqual(f.root.relaunchData, { build: 'a' });
  const built = screens(f);
  assert.ok(built.length >= 1, 'building a made screens');

  // Another project stops at the warning and leaves the file alone.
  await f.figma.ui.onmessage({ type: 'build', project: 'b' });
  assert.deepStrictEqual(of(f, 'confirm').pop(), { type: 'confirm', project: 'b', label: 'a' });
  assert.strictEqual(label(f), 'a');
  assert.deepStrictEqual(screens(f), built, 'a refused build leaves the screens untouched');

  // "Build anyway" builds and relabels.
  await f.figma.ui.onmessage({ type: 'build', project: 'b', force: true });
  assert.strictEqual(label(f), 'b');

  // Review Focus 1 — a second request during a run is ignored, not interleaved.
  const first = f.figma.ui.onmessage({ type: 'build', project: 'b' });
  const second = f.figma.ui.onmessage({ type: 'build', project: 'b' });
  await Promise.all([first, second]);
  assert.strictEqual(of(f, 'label').length, 3, 'a, forced b, then only one of the two overlapping builds');

  // A file built before labels existed warns before its first build.
  f = open('build', (m) => { m.figma.createPage().name = 'Screens'; });
  assert.strictEqual(of(f, 'busy').length, 0);
  await f.figma.ui.onmessage({ type: 'build', project: 'a' });
  assert.deepStrictEqual(of(f, 'confirm').pop(), { type: 'confirm', project: 'a', label: null });
  assert.strictEqual(label(f), '');

  // A labelled file builds as soon as the plugin opens.
  f = open('build', (m) => { m.root.setPluginData('project', 'a'); });
  await settled(f);
  assert.strictEqual(of(f, 'init')[0].selected, 'a');
  assert.ok(screens(f).length >= 1, 'building on open made screens');

  // Review Focus 2 — labelled with a project this machine doesn't have.
  f = open('build', (m) => { m.root.setPluginData('project', 'gone'); });
  assert.strictEqual(of(f, 'busy').length, 0, 'an unknown label must not build on open');
  assert.strictEqual(of(f, 'init')[0].label, 'gone');
  assert.strictEqual(of(f, 'init')[0].selected, 'b');
  await f.figma.ui.onmessage({ type: 'build', project: 'b' });
  assert.deepStrictEqual(of(f, 'confirm').pop(), { type: 'confirm', project: 'b', label: 'gone' });

  // Dump runs straight away in any file and needs no project.
  f = open('dump');
  await settled(f);
  assert.ok(Array.isArray(JSON.parse(of(f, 'dump')[0].text).collections), 'dump posted the JSON');

  // Review Focus 3 — a name with spaces and symbols keeps its name and gets a safe file name.
  registered('My App!');
  assert.ok(fs.existsSync(path.join(projects, 'My-App-.js')));
  assert.ok(of(open('build'), 'init')[0].projects.some((p) => p.name === 'My App!'));

  // Review Focus 4 — a stray file without the header is skipped, not fatal.
  fs.writeFileSync(path.join(projects, 'stray.js'), 'function nope() {}\n');
  assert.match(registered('a').out, /skipping .*stray\.js/);
  assert.ok(!of(open('build'), 'init')[0].projects.some((p) => p.name === 'stray'));
  fs.unlinkSync(path.join(projects, 'stray.js'));

  // Review Focus 5 — a bundle ending in a line comment with no newline still returns build.
  fs.writeFileSync(path.join(projects, 'c.js'),
    '// figment-project ' + JSON.stringify({ name: 'c', path: '/elsewhere/c', builtAt: '2000-01-01T00:00:00.000Z' }) +
    '\nasync function build() { figma.root.setPluginData("ran", "c"); } // trailing');
  registered('a');
  f = open('build');
  await f.figma.ui.onmessage({ type: 'build', project: 'c' });
  assert.strictEqual(f.root.getPluginData('ran'), 'c');

  // A name another repo already holds is refused, not overwritten.
  fs.writeFileSync(path.join(projects, 'a.js'),
    '// figment-project ' + JSON.stringify({ name: 'a', path: '/some/other/repo', builtAt: '2000-01-01T00:00:00.000Z' }) + '\n');
  const clash = register('a');
  assert.notStrictEqual(clash.status, 0, 'a clashing name must fail');
  assert.match(clash.out, /already registered from \/some\/other\/repo/);

  console.log('OK — runner: label, warning, build on open, dump, one run at a time, registry.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => fs.rmSync(home, { recursive: true, force: true }));
```

- [ ] **Step 3: Run it and confirm it fails.**

Run: `cd assets && ./build.sh && node test/runner.cjs`
(`build.sh` doesn't call `register.mjs` yet, so it's still safe to run without `FIGMENT_HOME`.)
Expected: exit 1 with `AssertionError … register a failed:` followed by `Cannot find module …/register.mjs`.

- [ ] **Step 4: Move the plugin files and update the manifest.**

Run: `cd assets && mkdir plugin && mv manifest.json plugin/manifest.json && mv ui.html plugin/ui.html`

Then replace the entire contents of `assets/plugin/manifest.json` with:

```json
{
  "name": "Figment",
  "id": "figment-plugin",
  "api": "1.0.0",
  "main": "code.js",
  "ui": "ui.html",
  "editorType": ["figma"],
  "menu": [
    { "name": "Build", "command": "build" },
    { "name": "Dump this file's design system", "command": "dump" }
  ],
  "relaunchButtons": [
    { "command": "build", "name": "Rebuild" }
  ],
  "networkAccess": { "allowedDomains": ["none"] }
}
```

- [ ] **Step 5: Write `assets/plugin/runner.js`.**

```js
// The one plugin Figma imports, for every project.
//
// register.mjs generates the bundle: every registered project as
//   PROJECTS[name] = { builtAt, load }     load() runs that project's code and returns { build }
// followed by this file. It owns the panel, the dump command, and the label that ties a Figma
// file to one project. The label check lives here on the main thread rather than in the panel,
// so nothing builds over another project's file without an explicit force.

(function () {
  const LABEL = 'project';

  figma.showUI(__html__, { width: 460, height: 300, themeColors: true });

  function post(m) { figma.ui.postMessage(m); }
  function say(text) { post({ type: 'log', text: text }); }

  let busy = false;

  /** One run at a time: a second click while a build runs is ignored, not interleaved. */
  function run(job) {
    if (busy) return Promise.resolve();
    busy = true;
    post({ type: 'busy', busy: true });
    return job()
      .catch(function (e) { say('Failed: ' + (e && e.message ? e.message : e) + '\n\n' + (e && e.stack ? e.stack : '')); })
      .then(function () { busy = false; post({ type: 'busy', busy: false }); });
  }

  function newest() {
    let best = null;
    for (const name of Object.keys(PROJECTS)) {
      if (!best || PROJECTS[name].builtAt > PROJECTS[best].builtAt) best = name;
    }
    return best;
  }

  /** A file built before labels existed has these pages and may hold another project's design. */
  function hasFigmentPages() {
    return figma.root.children.some(function (p) { return p.name === 'Screens' || p.name === 'Design System'; });
  }

  async function build(name, force) {
    if (!PROJECTS[name]) { say('No project "' + name + '" is registered — run ./build.sh in it.'); return; }
    const label = figma.root.getPluginData(LABEL);
    const clash = label ? label !== name : hasFigmentPages();
    if (clash && !force) { post({ type: 'confirm', project: name, label: label || null }); return; }
    // Labelled before building, so a run that dies halfway still names the project that touched it.
    figma.root.setPluginData(LABEL, name);
    figma.root.setRelaunchData({ build: name });
    post({ type: 'label', label: name });
    await PROJECTS[name].load().build();
  }
```

…continue the same file with Step 6.

- [ ] **Step 6: Finish `runner.js` with `dump`, the message handler and startup.** Append to
  `assets/plugin/runner.js`. `dump()` is old `05-main.js:83-104`, indented two spaces, with
  only its last line changed (it resizes the panel, then posts):

```js

  /** Read this file's design system out as JSON — how you port a system between files. */
  async function dump() {
    const out = { collections: [], textStyles: [], paintStyles: [], components: [] };
    const cols = await figma.variables.getLocalVariableCollectionsAsync();
    for (const c of cols) {
      const entry = { name: c.name, modes: c.modes.map(function (m) { return m.name; }), variables: [] };
      for (const id of c.variableIds) {
        const v = await figma.variables.getVariableByIdAsync(id);
        if (!v) continue;
        const values = {};
        for (const m of c.modes) values[m.name] = v.valuesByMode[m.modeId];
        entry.variables.push({ name: v.name, type: v.resolvedType, scopes: v.scopes, values: values });
      }
      out.collections.push(entry);
    }
    for (const s of await figma.getLocalTextStylesAsync()) {
      out.textStyles.push({ name: s.name, font: s.fontName, size: s.fontSize, lineHeight: s.lineHeight, tracking: s.letterSpacing });
    }
    for (const s of await figma.getLocalPaintStylesAsync()) out.paintStyles.push({ name: s.name, paints: s.paints });
    for (const p of figma.root.children) {
      for (const n of p.children) if (n.type === 'COMPONENT' || n.type === 'COMPONENT_SET') out.components.push(n.name);
    }
    figma.ui.resize(460, 560);
    post({ type: 'dump', text: JSON.stringify(out, null, 2) });
  }

  figma.ui.onmessage = function (msg) {
    if (msg && msg.type === 'build') return run(function () { return build(msg.project, msg.force === true); });
    if (msg && msg.type === 'dump') return run(dump);
  };

  const label = figma.root.getPluginData(LABEL);
  const known = Boolean(label && PROJECTS[label]);
  post({
    type: 'init',
    projects: Object.keys(PROJECTS).map(function (name) { return { name: name, builtAt: PROJECTS[name].builtAt }; }),
    label: label || null,
    selected: known ? label : newest(),
  });

  if (figma.command === 'dump') run(dump);
  else if (known) run(function () { return build(label, false); });
})();
```

- [ ] **Step 7: Write `assets/register.mjs`.**

```js
#!/usr/bin/env node
// Registers this project with the one Figment plugin, then regenerates that plugin's bundle.
//
//   $FIGMENT_HOME/projects/<name>.js   one per project: a header line, then its code.js
//   $FIGMENT_HOME/plugin/              what Figma imports, once: manifest.json, ui.html, code.js
//
// FIGMENT_HOME defaults to ~/.figment. FIGMENT_PROJECT names the project; otherwise it is the
// git repo's folder name. build.sh runs this after every build.

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, copyFileSync, renameSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const home = process.env.FIGMENT_HOME || join(homedir(), '.figment');
const projectsDir = join(home, 'projects');
const pluginDir = join(home, 'plugin');
const HEADER = '// figment-project ';

function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'],
      { cwd: here, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) {
    return here;   // not a git checkout: the scaffold folder stands in for the repo
  }
}

/** The JSON on a project file's first line, or null when it has none. */
function header(file) {
  const first = readFileSync(file, 'utf8').split('\n', 1)[0];
  if (!first.startsWith(HEADER)) return null;
  try { return JSON.parse(first.slice(HEADER.length)); } catch (e) { return null; }
}

const repo = repoRoot();
const name = process.env.FIGMENT_PROJECT || basename(repo);
const mine = join(projectsDir, name.replace(/[^A-Za-z0-9._-]/g, '-') + '.js');

// Two repos with the same folder name would otherwise build into each other's Figma files.
if (existsSync(mine)) {
  const prev = header(mine);
  if (!prev || prev.path !== repo) {
    console.error('register: "' + name + '" is already registered from ' +
      (prev ? prev.path : 'a file with no figment-project header') +
      '\n  this repo: ' + repo +
      '\n  set FIGMENT_PROJECT to another name, or delete ' + mine);
    process.exit(1);
  }
}

mkdirSync(projectsDir, { recursive: true });
mkdirSync(pluginDir, { recursive: true });
writeFileSync(mine, HEADER + JSON.stringify({ name: name, path: repo, builtAt: new Date().toISOString() }) + '\n' +
  readFileSync(join(here, 'code.js'), 'utf8'));

// Copied every time, which also refreshes the manifest's timestamp for Figma's hot reload.
const firstInstall = !existsSync(join(pluginDir, 'manifest.json'));
for (const f of ['manifest.json', 'ui.html']) copyFileSync(join(here, 'plugin', f), join(pluginDir, f));

// Every project wrapped in its own function so their top-level names never meet, then the
// runner. Only the project picked in the panel ever has load() called.
// ponytail: every project ships in one bundle; prune projects/ if opening the plugin gets slow.
const parts = ['// GENERATED by register.mjs from ' + projectsDir + ' — do not edit.',
  'const PROJECTS = Object.create(null);'];
let count = 0;
for (const f of readdirSync(projectsDir).filter(function (f) { return f.endsWith('.js'); }).sort()) {
  const meta = header(join(projectsDir, f));
  if (!meta) { console.error('register: skipping ' + join(projectsDir, f) + ' — no figment-project header'); continue; }
  parts.push('PROJECTS[' + JSON.stringify(meta.name) + '] = { builtAt: ' + JSON.stringify(meta.builtAt) + ', load: function () {',
    readFileSync(join(projectsDir, f), 'utf8'),
    ';return { build: build };',
    '} };');
  count++;
}
parts.push(readFileSync(join(here, 'plugin', 'runner.js'), 'utf8'));

// Checked before it replaces the installed bundle, so a broken build never reaches Figma.
const next = join(pluginDir, 'code.next.js');
writeFileSync(next, parts.join('\n'));
execFileSync(process.execPath, ['--check', next], { stdio: 'inherit' });
renameSync(next, join(pluginDir, 'code.js'));

console.log('registered ' + name + ' (' + count + ' project' + (count === 1 ? '' : 's') + ')');
if (firstInstall) {
  console.log('\nImport once in Figma: Plugins → Development → Import plugin from manifest…\n  ' +
    join(pluginDir, 'manifest.json') + '\n  (Cmd+Shift+. shows hidden folders in the file picker)');
}
```

- [ ] **Step 8: Hook it into `build.sh`.** Append one line after the final `printf …` line of
  `assets/build.sh`:

```bash
node register.mjs
```

- [ ] **Step 9: Run every check and confirm they pass.**

Run (with `FH` exported as in *Global Constraints*):
`cd assets && FIGMENT_HOME=$FH ./build.sh && node test/run.cjs && node test/runner.cjs`

Expected:
- `build.sh` prints `built code.js — … bytes`, then `registered figment (1 project)` and the
  one-time import hint.
- `run.cjs` ends `OK — 2 screen(s), no runtime errors, no layout overflow.`
- `runner.cjs` prints `OK — runner: label, warning, build on open, dump, one run at a time, registry.`
- `ls ~/.figment` fails with "No such file or directory", proving the real home wasn't
  touched. Skip that check if the user already had `~/.figment`.

- [ ] **Step 10: Report; don't commit.** Changed:
  - `assets/test/mock-figma.cjs`: plugin data, relaunch data, `ui.resize`
  - `assets/test/runner.cjs` (new): runner and registry checks
  - `assets/plugin/manifest.json` (moved from `assets/manifest.json`): Build menu, Rebuild button
  - `assets/plugin/ui.html` (moved from `assets/ui.html`, content unchanged)
  - `assets/plugin/runner.js` (new): the shared entry point
  - `assets/register.mjs` (new): registry and bundle
  - `assets/build.sh`: runs `register.mjs`

---

### Task 3: The panel

**Files:**
- Modify (full rewrite): `assets/plugin/ui.html`

**Interfaces:**
- **Consumes:** the runner ↔ panel messages listed in Task 2's *Interfaces*, exactly as named.
- **Produces:** nothing for later tasks.

- [ ] **Step 1: Replace the entire contents of `assets/plugin/ui.html`:**

```html
<!doctype html>
<meta charset="utf-8" />
<style>
  body { font: 12px/1.5 system-ui, -apple-system, sans-serif; margin: 0; padding: 12px;
         background: var(--figma-color-bg, #ffffff); color: var(--figma-color-text, #1e1e1e); }
  .row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .muted { color: var(--figma-color-text-secondary, #6e6e6e); }
  select, button, textarea { font: inherit; color: inherit; border-radius: 6px;
         border: 1px solid var(--figma-color-border, #e6e6e6); background: var(--figma-color-bg, #ffffff); }
  select { flex: 1; min-width: 0; padding: 4px 6px; }
  button { padding: 5px 12px; cursor: pointer; }
  button.primary { background: var(--figma-color-bg-brand, #0d99ff); color: var(--figma-color-text-onbrand, #ffffff);
         border-color: transparent; }
  button:disabled { opacity: 0.5; cursor: default; }
  #status { margin-bottom: 8px; }
  #warn { display: none; padding: 8px 10px; border-radius: 6px; margin-bottom: 8px;
          background: var(--figma-color-bg-warning-tertiary, #fff1e3); color: var(--figma-color-text-warning, #b35c00); }
  #warn .row { margin: 8px 0 0; }
  hr { border: 0; border-top: 1px solid var(--figma-color-border, #e6e6e6); margin: 10px 0; }
  pre, textarea { font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  pre { white-space: pre-wrap; word-break: break-word; margin: 0; }
  #dumpbox { display: none; margin-top: 10px; }
  #dumpbox .row span { flex: 1; }
  textarea { width: 100%; height: 300px; box-sizing: border-box; padding: 8px; resize: vertical;
             background: var(--figma-color-bg-secondary, #f5f5f5); }
</style>
<div class="row">
  <label for="project">Project</label>
  <select id="project"></select>
  <span id="age" class="muted"></span>
</div>
<div id="status" class="muted"></div>
<div id="warn">
  <div id="warntext"></div>
  <div class="row"><button id="force" class="primary"></button><button id="cancel">Cancel</button></div>
</div>
<div class="row">
  <button id="build" class="primary">Build</button>
  <button id="dump">Dump design system</button>
</div>
<hr />
<pre id="log"></pre>
<div id="dumpbox">
  <div class="row"><span class="muted">This file's design system, as JSON</span><button id="copy">Copy</button></div>
  <textarea id="out" readonly></textarea>
</div>
<script>
  const $ = (id) => document.getElementById(id);
  const send = (m) => parent.postMessage({ pluginMessage: m }, '*');
  let projects = [];
  let label = null;

  function ago(iso) {
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 60) return 'built just now';
    if (s < 3600) return 'built ' + Math.floor(s / 60) + 'm ago';
    if (s < 86400) return 'built ' + Math.floor(s / 3600) + 'h ago';
    return 'built ' + Math.floor(s / 86400) + 'd ago';
  }

  function showAge() {
    const p = projects.find((p) => p.name === $('project').value);
    $('age').textContent = p ? ago(p.builtAt) : '';
  }

  function showStatus() {
    let text;
    if (!projects.length) text = 'No projects registered — run ./build.sh in a project.';
    else if (!label) text = 'New file — the first build labels it.';
    else if (!projects.some((p) => p.name === label)) text = 'This file is ' + label + ', which isn\'t registered here — run ./build.sh in ' + label + '.';
    else text = 'This file: ' + label;
    $('status').textContent = text;
  }

  onmessage = (e) => {
    const m = e.data.pluginMessage;
    if (!m) return;
    if (m.type === 'init') {
      projects = m.projects;
      label = m.label;
      for (const p of projects) $('project').add(new Option(p.name, p.name, false, p.name === m.selected));
      $('build').disabled = !projects.length;
      showAge();
      showStatus();
    }
    if (m.type === 'log') $('log').textContent = m.text;
    if (m.type === 'busy') {
      for (const id of ['build', 'dump', 'force']) $(id).disabled = m.busy;
      if (!projects.length) $('build').disabled = true;
    }
    if (m.type === 'label') {
      label = m.label;
      $('warn').style.display = 'none';
      showStatus();
    }
    if (m.type === 'confirm') {
      $('warntext').textContent = '⚠ ' + (m.label ? 'This file is ' + m.label + '.' : 'This file already has Figment pages but no project label.') +
        ' Building ' + m.project + ' here replaces its screens and overwrites its tokens.';
      $('force').textContent = 'Build ' + m.project + ' anyway';
      $('force').dataset.project = m.project;
      $('warn').style.display = 'block';
    }
    if (m.type === 'dump') {
      $('out').value = m.text;
      $('dumpbox').style.display = 'block';
      $('log').textContent = 'Design system dumped — press Copy.';
    }
  };

  $('project').onchange = () => { showAge(); $('warn').style.display = 'none'; };
  $('build').onclick = () => send({ type: 'build', project: $('project').value });
  $('force').onclick = () => send({ type: 'build', project: $('force').dataset.project, force: true });
  $('cancel').onclick = () => { $('warn').style.display = 'none'; };
  $('dump').onclick = () => send({ type: 'dump' });
  $('copy').onclick = () => { $('out').select(); document.execCommand('copy'); };
</script>
```

- [ ] **Step 2: Check the panel in a browser.** Use the Playwright MCP tools.
  - Navigate to `file://<repo>/assets/plugin/ui.html` and resize the
    viewport to 460×300.
  - With `browser_evaluate`, run:

```js
() => {
  window.__sent = [];
  window.addEventListener('message', (e) => { if (e.data.pluginMessage && e.data.pluginMessage.type !== 'init') window.__sent.push(e.data.pluginMessage); });
  const now = Date.now();
  window.postMessage({ pluginMessage: { type: 'init', label: 'acme', selected: 'acme', projects: [
    { name: 'acme', builtAt: new Date(now - 180000).toISOString() },
    { name: 'beta', builtAt: new Date(now - 3600000).toISOString() } ] } }, '*');
  window.postMessage({ pluginMessage: { type: 'log', text: 'Building 04 settings (4 of 12)…' } }, '*');
}
```

  - Take a screenshot. Expected:
    - the dropdown shows `acme` and `built 3m ago`
    - the status reads `This file: acme`
    - a blue **Build** button and **Dump design system**
    - the log line
    - no warning box and no dump box
  - Select `beta`, click **Build**, then evaluate:

```js
() => {
  window.postMessage({ pluginMessage: { type: 'confirm', project: 'beta', label: 'acme' } }, '*');
}
```

  - Screenshot. Expected: a warning box reading
    `⚠ This file is acme. Building beta here replaces its screens and overwrites its tokens.`,
    with **Build beta anyway** and **Cancel**.
  - Click **Build beta anyway**, then evaluate `() => window.__sent`. Expected:
    `[{type:'build', project:'beta'}, {type:'build', project:'beta', force:true}]`.
  - Evaluate:

```js
() => {
  window.postMessage({ pluginMessage: { type: 'busy', busy: true } }, '*');
  window.postMessage({ pluginMessage: { type: 'dump', text: '{\n  "collections": []\n}' } }, '*');
}
```

  - Screenshot. Expected: Build, Dump and Build-anyway are disabled, and the dump box with
    **Copy** and the JSON is visible.
  - Dark check: evaluate the code below and take a screenshot. Expected: a dark panel with
    readable text, and the warning still legible.

```js
() => {
  const s = document.documentElement.style;
  s.setProperty('--figma-color-bg', '#2c2c2c'); s.setProperty('--figma-color-bg-secondary', '#383838');
  s.setProperty('--figma-color-text', '#ffffff'); s.setProperty('--figma-color-text-secondary', '#ffffffb3');
  s.setProperty('--figma-color-border', '#444444'); s.setProperty('--figma-color-bg-warning-tertiary', '#4d2f00');
  s.setProperty('--figma-color-text-warning', '#f7d15f');
}
```

  If Playwright isn't available, say so in the report and leave this step for the user's
  Figma check. Don't skip it silently.

- [ ] **Step 3: Rebuild and rerun the checks.** `ui.html` gets copied into the install, so:

Run: `cd assets && FIGMENT_HOME=$FH ./build.sh && node test/run.cjs && node test/runner.cjs`
Expected: both `OK` lines, as in Task 2, Step 9.

- [ ] **Step 4: Report; don't commit.** Changed:
  - `assets/plugin/ui.html`: project dropdown, file status, warning, busy state, dump box,
    Figma theme colours

---

### Task 4: Docs

**Files:**
- Modify: `assets/README.md:7-21` (Run it), `:24-40` (Layout); append a section
- Modify: `SKILL.md:28-29`, `:42-44`
- Modify: `README.md:64` (insert after it)

**Interfaces:**
- **Consumes:** command and path names from Task 2 (`~/.figment/plugin/manifest.json`,
  `FIGMENT_HOME`, `FIGMENT_PROJECT`, menu **Build**, sidebar **Rebuild**).
- **Produces:** nothing.

- [ ] **Step 1: Write the failing check.** Run:

```bash
grep -n "pick \`manifest.json\`\|Build the screens\|your plugin\* → Build" SKILL.md README.md assets/README.md
```

Expected: matches in `SKILL.md` and `assets/README.md`, which are the stale instructions.

- [ ] **Step 2: Rewrite "Run it" in `assets/README.md`.**
  - Replace lines 13-17, from `Then, in the **Figma desktop app**` through
    `3. Plugins → Development → **Figment → Build the screens**`.
  - Keep the code block above them and the "Re-running replaces…" paragraph below them.
  - The replacement text:

```markdown
`build.sh` also registers this project with the one Figment plugin in `~/.figment` (set
`FIGMENT_HOME` to move it, `FIGMENT_PROJECT` to rename the project). Then, in the **Figma
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
```

- [ ] **Step 3: Update the layout tree in `assets/README.md`.**
  - Replace these three lines:

```
manifest.json          the plugin Figma loads
ui.html                progress log + the dump textarea
build.sh               concatenates src/*.js into code.js, then node --check
```

with:

```
build.sh               concatenates src/*.js into code.js, checks it, runs register.mjs
register.mjs           registers code.js in ~/.figment and regenerates the one plugin
plugin/                copied to ~/.figment/plugin — what Figma imports, once
  manifest.json
  ui.html              project picker, file label, progress log, dump output
  runner.js            the shared entry point: panel, label check, dump
```

  - Replace `  05-main.js           ORDER, build, dump` with
    `  05-main.js           ORDER and build()`.
  - After the `  run.cjs …` line, add:

```
  runner.cjs           checks the file label, the wrong-project warning and the registry
```

- [ ] **Step 4: Add the upgrade section.** Append to the end of `assets/README.md`:

```markdown

## Upgrading an existing copy

A copy made before the shared plugin has its own `manifest.json`, which Figma imports once per
project. To move it onto the shared plugin:

1. Copy `build.sh`, `register.mjs`, `plugin/` and `test/` in from the skill's `assets/`.
2. Delete the copy's own `manifest.json` and `ui.html`.
3. In `src/05-main.js`, delete `figma.showUI(…)`, the `figma.ui.onmessage` handler, `dump()`
   and the last three lines (`COMMANDS` and `run`). `src/01`–`04` stay as they are.
4. `./build.sh && node test/run.cjs`, then in Figma remove the old "Figment" entries
   (Plugins → Development → Manage plugins in development) and import
   `~/.figment/plugin/manifest.json` once.

Files built before the upgrade carry no project label, so the first build in each asks once
before labelling it.
```

- [ ] **Step 5: Update `SKILL.md`.**
  - Replace lines 28-29:

```markdown
**The trade you are making:** a plugin runs in the Figma desktop app, so there is a human in
the loop on every run (Plugins → Development → your plugin). You will not see the canvas.
```

with:

```markdown
**The trade you are making:** a plugin runs in the Figma desktop app, so there is a human in
the loop on every run (one click: **Rebuild** in the right sidebar). You will not see the canvas.
```

  - Replace lines 42-44:

```markdown
Then in the **Figma desktop app** (not the browser — a manifest plugin needs desktop):
Plugins → Development → Import plugin from manifest… → pick `manifest.json` →
Plugins → Development → *your plugin* → Build.
```

with:

```markdown
`build.sh` also registers the project with the one Figment plugin in `~/.figment`. In the
**Figma desktop app** (not the browser — a manifest plugin needs desktop), import that plugin
once, ever: Plugins → Development → Import plugin from manifest… →
`~/.figment/plugin/manifest.json`. Then, in the project's own Figma file (one file per
project): Plugins → Development → Figment → Build, pick the project, press **Build**. The
first build labels the file; after that the plugin, or **Rebuild** in the right sidebar,
rebuilds it in one click, and building another project into it asks first.
```

- [ ] **Step 6: Update the top-level `README.md`.** Insert after line 64 (the closing ``` of
  the `assets/ runs as-is` block):

```markdown

`build.sh` also registers the project with the one Figment plugin in `~/.figment`. Import
`~/.figment/plugin/manifest.json` into the Figma desktop app once, and every project you build
shows up in it.
```

- [ ] **Step 7: Run the check from Step 1 again, plus the full suite.**

Run: the same `grep` as in Step 1. Expected: no output (exit 1).
Run: `cd assets && FIGMENT_HOME=$FH ./build.sh && node test/run.cjs && node test/runner.cjs`
Expected: both `OK` lines.

- [ ] **Step 8: Report; don't commit.** Changed:
  - `assets/README.md`: install-once steps, layout, upgrade section
  - `SKILL.md`: quick start and the one-click rebuild
  - `README.md`: one-time import note

---

## Manual check in Figma desktop (the user)

These cover the spec's *Unverified* items, which the mock can't reach.

1. **Install for real:** `cd assets && ./build.sh`, without `FIGMENT_HOME`, writes the real
   `~/.figment`. It should print the import hint once.
2. **Swap plugins:** remove the old "Figment" dev plugins, then import
   `~/.figment/plugin/manifest.json`.
3. **First build:** in a new file, choose Plugins → Development → Figment → Build. The status
   should read "New file — the first build labels it." Press **Build**; screens appear, and
   the status reads "This file: figment".
4. **Rebuild button:** click empty canvas so nothing is selected. **Rebuild** should appear in
   the right sidebar, and it should rebuild straight away.
5. **Theme:** switch Figma between light and dark. The panel should follow.
6. **Warning:** run `FIGMENT_PROJECT=other ./build.sh`, reopen the plugin and pick `other`.
   The warning should appear, and **Cancel** should leave the file alone.
7. **Optional hot reload:** turn on Plugins → Development → Hot reload plugin, then run
   `./build.sh`. Check whether Figma re-runs the plugin by itself.
