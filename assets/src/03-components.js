// Pages, and the components everything else instances.
//
// Built once per file and reused: a rerun looks components up by name rather than creating
// a second copy, so instances on existing screens keep their links and their overrides.

let ICONS = {};
let BRANDS = {};
let SHAPES = {};

function designSystemPage() {
  let p = figma.root.children.filter(function (n) { return n.name === 'Design System'; })[0];
  if (!p) { p = figma.createPage(); p.name = 'Design System'; }
  return p;
}

function screensPage() {
  // Match any earlier name too and rename in place — otherwise a rename leaves the previous
  // page behind carrying a stale build.
  const NAME = 'Screens';
  let p = figma.root.children.filter(function (n) { return n.name === NAME; })[0];
  if (!p) p = figma.createPage();
  p.name = NAME;
  return p;
}

/** Wrap an SVG string in a component, once, laid out on the Design System page. */
function svgComponent(page, name, svg, x, y) {
  const found = page.children.filter(function (n) { return n.name === name; })[0];
  if (found) return found;
  const node = figma.createNodeFromSvg(svg);
  const c = figma.createComponent();
  c.name = name;
  c.resize(node.width, node.height);
  c.fills = [];
  c.appendChild(node);
  node.x = 0; node.y = 0;
  // Instances do not scale their artwork without this — resizing the instance would move the
  // frame and leave the paths where they were.
  node.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
  c.x = x; c.y = y;
  page.appendChild(c);
  return c;
}

function buildIcons(page) {
  let x = 0;
  for (const key of Object.keys(ICON_SVG)) {
    ICONS[key] = svgComponent(page, 'icon/' + key, ICON_SVG[key], x, 0);
    x += 48;
  }
}

function buildBrands(page) {
  let x = 0;
  for (const key of Object.keys(BRAND_SVG)) {
    BRANDS[key] = svgComponent(page, 'brand/' + key, BRAND_SVG[key].svg, x, 80);
    x += 48;
  }
}

/**
 * Illustrations, drawn rather than sourced: one component per (tone × size).
 *
 * Per size rather than one that gets resized, because an instance does not scale its
 * artwork — and a consistent set of avatars costs a table and a loop.
 */
const SHAPE_TONES = [
  ['mint', 'bloom', 'c8f07a', '5fd3b2'],
  ['sky', 'clover', '8fc0ff', '4c7ff0'],
  ['violet', 'orb', 'c9a8ff', '7c4dff'],
];
const SHAPE_SIZES = [20, 24, 32, 40, 64];

function blobShape(shape, size) {
  let n;
  if (shape === 'bloom') { n = figma.createStar(); n.pointCount = 5; n.innerRadius = 0.78; }
  else if (shape === 'clover') { n = figma.createStar(); n.pointCount = 4; n.innerRadius = 0.8; }
  else { n = figma.createEllipse(); }
  n.resize(size, size);
  n.name = shape;
  return n;
}

function buildShapes(page) {
  let x = 0;
  for (const row of SHAPE_TONES) {
    const tone = row[0], shape = row[1], from = row[2], to = row[3];
    let y = 160;
    for (const size of SHAPE_SIZES) {
      const name = 'shape/' + tone + '-' + size;
      let c = page.children.filter(function (n) { return n.name === name; })[0];
      if (!c) {
        c = figma.createComponent();
        c.name = name;
        c.resize(size, size);
        c.fills = [];
        const art = blobShape(shape, size);
        art.fills = [GRAD(from, to)];
        c.appendChild(art);
        art.x = 0; art.y = 0;
        art.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
        c.x = x; c.y = y;
        page.appendChild(c);
      }
      SHAPES[name] = c;
      y += size + 12;
    }
    x += 90;
  }
}

// ── accessors ────────────────────────────────────────────────────────────────────
// Each names the missing thing. Without that the failure is "undefined.createInstance",
// which says nothing about which asset or which size.

function ICON(key, size, token) {
  if (!ICONS[key]) throw new Error('No icon/' + key + '. Available: ' + Object.keys(ICONS).join(', '));
  const inst = ICONS[key].createInstance();
  inst.resize(size, size);
  const glyph = inst.children[0];
  for (const p of glyph.children) {
    if (p.strokes && p.strokes.length) p.strokes = [F(token)];
    if (p.fills && p.fills.length) p.fills = [F(token)];
  }
  return inst;
}

/** Brand artwork, never recoloured — a mark is usually more than one colour and flattening
 *  it to one turns the logo into a solid blob. */
function BRANDMARK(key, size) {
  if (!BRANDS[key]) throw new Error('No brand/' + key + '. Available: ' + Object.keys(BRANDS).join(', '));
  const inst = BRANDS[key].createInstance();
  inst.resize(size, size);
  return inst;
}

function SHAPE(tone, size) {
  const c = SHAPES['shape/' + tone + '-' + size];
  if (!c) throw new Error('No shape/' + tone + '-' + size + '. Sizes built: ' + SHAPE_SIZES.join(', '));
  return c.createInstance();
}

/** Screen shell: a fixed artboard that later files fill. */
function screen(name, w, h) {
  const scr = figma.createFrame();
  scr.name = name;
  scr.resize(w || 1440, h || 900);
  scr.fills = [F('surface/canvas')];
  scr.clipsContent = true;
  scr.layoutMode = 'VERTICAL';
  scr.primaryAxisSizingMode = 'FIXED';
  scr.counterAxisSizingMode = 'FIXED';
  screensPage().appendChild(scr);
  return scr;
}

function bodyOf(scr, gap) {
  const body = AL('VERTICAL', { name: 'body', itemSpacing: gap || 16 });
  PAD(body, 24, 24, 24, 24);
  scr.appendChild(body);
  body.layoutSizingHorizontal = 'FILL';
  body.layoutSizingVertical = 'FILL';
  return body;
}
