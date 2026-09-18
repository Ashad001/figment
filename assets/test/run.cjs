// Executes code.js against the mock runtime and reports what it built.
//
// This is the inner loop. It must stay fast and it must fail loudly: a clean run here is the
// only reason it is reasonable to open Figma.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { figma, descendants, root } = require('./mock-figma.cjs');
const { check } = require('./layout.cjs');

const MIN_SCREENS = Number(process.env.MIN_SCREENS || 1);

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

  const pages = root.children.map(p => p.name);
  const screensPage = root.children.find(p => p.name === 'Screens');
  const dsPage = root.children.find(p => p.name === 'Design System');
  if (!screensPage) { console.error('\nNo screens page was created'); process.exit(1); }

  const screens = screensPage.children.filter(n => /^\d\d /.test(n.name));
  const comps = dsPage ? dsPage.children.filter(n => n.type === 'COMPONENT') : [];
  const texts = descendants(screensPage).filter(n => n.type === 'TEXT');
  const empty = texts.filter(t => !t.characters || !t.characters.trim());

  console.log('\npages      :', pages.join(' | '));
  console.log('components :', comps.length);
  console.log('screens    :', screens.length);
  for (const s of screens) {
    console.log('  - ' + s.name.padEnd(28) + ' @ ' + String(Math.round(s.x)).padStart(5) + ',' +
      String(Math.round(s.y)).padStart(5) + '  ' + descendants(s).length + ' nodes');
  }
  console.log('text nodes :', texts.length, '\n');

  if (empty.length) { console.error(empty.length + ' empty text node(s)'); process.exitCode = 1; }
  if (screens.length < MIN_SCREENS) {
    console.error('expected at least ' + MIN_SCREENS + ' screen(s), got ' + screens.length);
    process.exitCode = 1;
  }

  let problems = 0;
  for (const s of screens) {
    const found = check(s);
    if (!found.length) continue;
    console.log(s.name);
    for (const f of found) {
      console.log('   ' + f.kind.padEnd(16) + ' needs ' + f.need + ', has ' + f.have + '  @ ' + f.where);
      problems++;
    }
    console.log('');
  }

  if (problems) { console.error(problems + ' layout problem(s)'); process.exitCode = 1; }
  else if (!process.exitCode) {
    console.log('OK — ' + screens.length + ' screen(s), no runtime errors, no layout overflow.');
  }
}, 80);
