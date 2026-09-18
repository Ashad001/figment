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

/**
 * One table owns both the name and the position of every screen.
 *
 * Reordering the canvas never touches a builder, and the numeric prefix makes Figma's layer
 * list sort the way the product reads. A superseded screen comes out of this list rather
 * than being deleted — its builder still compiles and putting it back is one line.
 *
 * [frame name, builder, section label drawn above it (or null)]
 */
const ORDER = [
  ['01 example', function () { return s1(false); }, 'Examples'],
  ['02 example — empty', function () { return s1(true); }, null],
];

const COL = 1560;
const ROW = 1160;

async function build() {
  say('Loading ' + FONT + '…');
  await figma.loadFontAsync(REG);
  await figma.loadFontAsync(MED);

  say('Tokens…');
  const tokens = await ensureTokens();

  const ds = designSystemPage();
  const sp = screensPage();

  // Clear generated screens, keep the system. Tokens and components survive, so instances
  // stay linked. Match every naming scheme this file has ever used, or a rename orphans the
  // frames from the previous one.
  say('Clearing the previous build…');
  for (const node of sp.children.slice()) {
    if (/^([s]\d+ |\d\d )/.test(node.name) || node.name.indexOf('label/') === 0) node.remove();
  }

  say('Assets…');
  buildIcons(ds);
  buildBrands(ds);
  buildShapes(ds);

  const made = [];
  for (let i = 0; i < ORDER.length; i++) {
    const row = ORDER[i];
    say('Building ' + row[0] + ' (' + (i + 1) + ' of ' + ORDER.length + ')…');
    const frame = row[1]();
    frame.name = row[0];
    frame.x = (i % 3) * COL;
    frame.y = Math.floor(i / 3) * ROW;
    made.push(frame);

    if (row[2]) {
      const label = T(row[2], 28, 'Medium', 'text/muted', 34);
      label.name = 'label/' + row[2];
      sp.appendChild(label);
      label.x = frame.x;
      label.y = frame.y - 96;   // clear of Figma's own frame-name label at ~-24
    }
  }

  await figma.setCurrentPageAsync(sp);
  figma.viewport.scrollAndZoomIntoView(made);
  say('Done — ' + made.length + ' screen(s).\n' + (tokens.modes === 2
    ? 'Light and Dark — switch from the modes dropdown.'
    : 'Light only (a Starter plan allows one variable mode).'));
}

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
  figma.ui.postMessage({ type: 'dump', text: JSON.stringify(out, null, 2) });
}

const COMMANDS = { build: build, dump: dump };
const run = COMMANDS[figma.command] || build;
run().catch(function (e) { say('Failed: ' + (e && e.message ? e.message : e) + '\n\n' + (e && e.stack ? e.stack : '')); });
