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
  // Copied like Figma copies each message into the panel; it also moves it out of the vm's realm,
  // whose Object/Array prototypes would fail deepStrictEqual against this file's.
  mock.figma.ui.postMessage = (m) => { sent.push(structuredClone(m)); };
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
  assert.deepStrictEqual(structuredClone(f.root.relaunchData), { build: 'a' });
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

  // Two scaffolds in one git repo (a monorepo) get the same default name; the second is refused
  // rather than silently replacing the first.
  const mono = fs.mkdtempSync(path.join(os.tmpdir(), 'figment-mono-'));
  try {
    spawnSync('git', ['init', '-q', mono]);
    const scaffold = (app) => {
      const to = path.join(mono, app, 'figma-plugin');
      fs.cpSync(dir, to, { recursive: true });
      const env = Object.assign({}, process.env, { FIGMENT_HOME: home });
      delete env.FIGMENT_PROJECT;
      return spawnSync(process.execPath, [path.join(to, 'register.mjs')], { env, encoding: 'utf8' });
    };
    assert.strictEqual(scaffold('web').status, 0, 'the first scaffold registers');
    const second = scaffold('admin');
    assert.notStrictEqual(second.status, 0, 'a second scaffold in the same repo must not replace the first');
    assert.match(second.stdout + second.stderr, /already registered from .*web/);
  } finally {
    fs.rmSync(mono, { recursive: true, force: true });
  }

  console.log('OK — runner: label, warning, build on open, dump, one run at a time, registry.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => fs.rmSync(home, { recursive: true, force: true }));
