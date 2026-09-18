// Foundation: tokens, fonts, and the layout vocabulary every later file uses.
//
// This runs as a real Figma plugin, so none of the MCP conveniences exist here: there is no
// figma.createAutoLayout, no node.set, no node.query, no node.screenshot. Everything below
// is stock Plugin API, with the traps fixed once so no call site has to remember them.

const FONT = 'Inter';                       // swap for the product's own typeface
const REG = { family: FONT, style: 'Regular' };
const MED = { family: FONT, style: 'Medium' };

// [name, lightHex, lightAlpha, darkHex, darkAlpha, scope]
//
// Replace these with the product's real values — read them off the shipped components rather
// than tidying them into a theoretical scale. Names are roles, so they survive a rebrand.
const TOKENS = [
  ['surface/canvas',   'ffffff', 1,    '0f0f0f', 1,    'fill'],
  ['surface/inset',    'f7f7f7', 1,    '161616', 1,    'fill'],
  ['surface/raised',   'ffffff', 1,    '171717', 1,    'fill'],
  ['surface/active',   'ededed', 1,    '292929', 1,    'fill'],
  ['border/subtle',    'ededed', 1,    '212121', 1,    'stroke'],
  ['border/strong',    'e0e0e0', 1,    '2e2e2e', 1,    'stroke'],
  ['text/primary',     '0f0f0f', 1,    'ffffff', 1,    'text'],
  ['text/secondary',   '525252', 1,    'bdbdbd', 1,    'text'],
  ['text/muted',       '878787', 1,    'ffffff', 0.5,  'text'],
  ['text/faint',       'a6a6a6', 1,    'ffffff', 0.35, 'text'],
  ['accent/blue',      '0062c6', 1,    '0088ff', 1,    'any'],
  ['accent/green',     '24a148', 1,    '24a148', 1,    'any'],
  ['status/warning',   'b26a00', 1,    'b28600', 1,    'any'],
  ['status/danger',    'd93025', 1,    'fa4d56', 1,    'any'],
  ['tint/success',     '24a148', 0.12, '24a148', 0.16, 'fill'],
  ['tint/warning',     'b26a00', 0.10, 'b28600', 0.14, 'fill'],
  ['tint/selected',    '0062c6', 0.08, '0088ff', 0.14, 'fill'],
  ['shadow/subtle',    '000000', 0.06, '000000', 0.16, 'effect'],
];

// Explicit scopes keep a token out of every property picker in the file.
const SCOPES = {
  fill: ['FRAME_FILL', 'SHAPE_FILL'],
  stroke: ['STROKE_COLOR'],
  text: ['TEXT_FILL'],
  effect: ['EFFECT_COLOR'],
  any: ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR'],
};

const VAR = {};

function hexToRgba(h, a) {
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
    a: a,
  };
}

/**
 * Idempotent, and degrades on a Starter plan.
 *
 * Multiple modes per collection is a paid feature — addMode throws "Limited to 1 modes only".
 * Light is therefore written to the collection's existing mode and is the one guaranteed to
 * exist; Dark is added when the plan allows. The single-mode case is correct, not a
 * consolation prize, so design against it.
 */
async function ensureTokens() {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  let col = cols.filter(function (c) { return c.name === 'Theme'; })[0];
  if (!col) col = figma.variables.createVariableCollection('Theme');

  col.renameMode(col.modes[0].modeId, 'Light');
  const light = col.modes[0].modeId;
  let dark = null;
  for (const m of col.modes) if (m.name === 'Dark') dark = m.modeId;
  if (!dark) {
    try { dark = col.addMode('Dark'); }
    catch (e) { dark = null; }   // Starter plan: one mode only
  }

  // Look up by id off the collection rather than listing every local variable: the file may
  // hold other collections, and reusing an existing variable is what keeps a rerun from
  // unbinding every fill in the file.
  const existing = {};
  for (const id of col.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (v) existing[v.name] = v;
  }
  for (const t of TOKENS) {
    let v = existing[t[0]];
    if (!v) v = figma.variables.createVariable(t[0], col, 'COLOR');
    v.scopes = SCOPES[t[5]] || SCOPES.any;
    v.setValueForMode(light, hexToRgba(t[1], t[2]));
    if (dark) v.setValueForMode(dark, hexToRgba(t[3], t[4]));
    VAR[t[0]] = v;
  }
  return { collection: col, modes: dark ? 2 : 1 };
}

/** A paint bound to a token. Never write a literal colour anywhere else. */
function F(name) {
  if (!VAR[name]) throw new Error('No token "' + name + '". Known: ' + Object.keys(VAR).join(', '));
  return figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', VAR[name]
  );
}

function GRAD(fromHex, toHex) {
  return {
    type: 'GRADIENT_LINEAR',
    gradientTransform: [[0.7, 0.7, 0], [-0.7, 0.7, 0.5]],
    gradientStops: [
      { position: 0, color: hexToRgba(fromHex, 1) },
      { position: 1, color: hexToRgba(toHex, 1) },
    ],
  };
}

/** A drop shadow bound to a shadow token. */
function SHADOW(token, y, radius) {
  // The literal is the token's own light value, not black: F() leaves the paint's colour at
  // {0,0,0} and carries the value in the binding, which an effect renders as a hard black
  // shadow if the binding does not take.
  const row = TOKENS.filter(function (t) { return t[0] === token; })[0];
  const e = {
    type: 'DROP_SHADOW',
    color: row ? hexToRgba(row[1], row[2]) : { r: 0, g: 0, b: 0, a: 0.08 },
    offset: { x: 0, y: y }, radius: radius, spread: 0, visible: true, blendMode: 'NORMAL',
  };
  if (VAR[token]) e.boundVariables = { color: { type: 'VARIABLE_ALIAS', id: VAR[token].id } };
  return e;
}

/**
 * Auto-layout frame, hugging both ways, with the default white fill cleared.
 *
 * That fill is the trap: createFrame() is opaque white, so a frame meant as a transparent
 * layout container paints a white box over whatever sits behind it.
 */
function AL(dir, props) {
  const f = figma.createFrame();
  f.layoutMode = dir;
  f.primaryAxisSizingMode = 'AUTO';
  f.counterAxisSizingMode = 'AUTO';
  f.fills = [];
  f.clipsContent = false;
  if (props) for (const k in props) f[k] = props[k];
  return f;
}

/** Fixed-size auto-layout frame. */
function BOX(dir, w, h, props) {
  const f = AL(dir, props);
  f.resize(w, h);
  f.primaryAxisSizingMode = 'FIXED';
  f.counterAxisSizingMode = 'FIXED';
  return f;
}

/** Size, weight, colour and line-height together — the type scale is one decision. */
function T(chars, size, style, token, lh) {
  const t = figma.createText();
  t.fontName = style === 'Medium' ? MED : REG;
  t.characters = chars;
  t.fontSize = size;
  t.lineHeight = { unit: 'PIXELS', value: lh || Math.round(size * 1.45) };
  t.fills = [F(token)];
  t.name = chars.length > 24 ? chars.slice(0, 24) : chars;
  return t;
}

/** Wrapping paragraph at an explicit width. Prefer paraIn — a guessed width is how text
 *  ends up wider than the card holding it. */
function PARA(chars, size, style, token, width, lh) {
  const t = T(chars, size, style, token, lh);
  t.textAutoResize = 'HEIGHT';
  t.resize(width, t.height);
  return t;
}

/**
 * Wrapping paragraph that takes its width from its parent. This is the one to reach for.
 * FILL is only legal once the node is parented, which is why this appends for you.
 */
function paraIn(parent, chars, size, style, token, lh) {
  const t = T(chars, size, style, token, lh);
  t.textAutoResize = 'HEIGHT';
  parent.appendChild(t);
  t.layoutSizingHorizontal = 'FILL';
  return t;
}

/** Card that hugs its content vertically — cannot overflow, whatever the copy does. */
function CARDA(name, w) {
  const c = AL('VERTICAL', { name: name });
  c.resize(w, 10);
  c.counterAxisSizingMode = 'FIXED';
  c.primaryAxisSizingMode = 'AUTO';
  c.fills = [F('surface/raised')];
  c.cornerRadius = 14;
  c.strokes = [F('border/subtle')];
  c.strokeWeight = 1;
  return c;
}

/** Fixed-size card. Use it only when the height really is fixed. */
function CARD(name, w, h) {
  const c = BOX('VERTICAL', w, h, { name: name });
  c.fills = [F('surface/raised')];
  c.cornerRadius = 14;
  c.strokes = [F('border/subtle')];
  c.strokeWeight = 1;
  return c;
}

/**
 * Horizontal card, fixed width, height hugging its tallest child.
 *
 * Not CARDA with layoutMode flipped afterwards: switching a frame from VERTICAL to HORIZONTAL
 * swaps which axis "primary" means, so the height-hug silently becomes a width-hug and the
 * card collapses to its seed height.
 */
function CARD_ROW(name, w) {
  const c = AL('HORIZONTAL', { name: name, counterAxisAlignItems: 'CENTER' });
  c.resize(w, 10);
  c.primaryAxisSizingMode = 'FIXED';   // width
  c.counterAxisSizingMode = 'AUTO';    // height hugs
  c.fills = [F('surface/raised')];
  c.cornerRadius = 14;
  c.strokes = [F('border/subtle')];
  c.strokeWeight = 1;
  return c;
}

function PAD(node, t, r, b, l) {
  node.paddingTop = t; node.paddingRight = r; node.paddingBottom = b; node.paddingLeft = l;
}

/**
 * Height is a parameter rather than a later resize(): resize() pins BOTH axes to FIXED,
 * which turns a hugging button into a fixed-width one and is how a label ends up clipped.
 */
function BTN(label, primary, h) {
  const b = AL('HORIZONTAL', {
    name: 'btn/' + label, primaryAxisAlignItems: 'CENTER', counterAxisAlignItems: 'CENTER',
  });
  b.counterAxisSizingMode = 'FIXED';
  b.resize(80, h || 34);
  b.primaryAxisSizingMode = 'AUTO';
  PAD(b, 0, 14, 0, 14);
  b.cornerRadius = 9;
  b.fills = [F(primary ? 'text/primary' : 'surface/active')];
  b.appendChild(T(label, 13, 'Medium', primary ? 'surface/canvas' : 'text/primary', 18));
  return b;
}

function PILL(label, bgToken, fgToken, dot) {
  const c = AL('HORIZONTAL', { name: 'pill', itemSpacing: 5, counterAxisAlignItems: 'CENTER' });
  c.counterAxisSizingMode = 'FIXED';
  c.resize(60, 22);
  c.primaryAxisSizingMode = 'AUTO';   // width back to the content, or a long label overflows
  PAD(c, 0, 8, 0, 8);
  c.cornerRadius = 999;
  c.fills = [F(bgToken)];
  if (dot) {
    const d = figma.createEllipse();
    d.resize(6, 6); d.fills = [F(fgToken)]; d.name = 'dot';
    c.appendChild(d);
  }
  c.appendChild(T(label, 11, 'Medium', fgToken, 15));
  return c;
}

function DIVIDER(width) {
  const r = figma.createRectangle();
  r.resize(width, 1);
  r.fills = [F('border/subtle')];
  r.name = 'divider';
  return r;
}

function fill(node) { node.layoutSizingHorizontal = 'FILL'; return node; }
function grow(node) { node.layoutGrow = 1; return node; }
