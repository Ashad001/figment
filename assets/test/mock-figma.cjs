// A small mock of the Figma Plugin API, enough to execute code.js end to end in Node.
//
// It is not a renderer. Its job is to catch the failures that actually bite:
// calling something that does not exist, touching a property the real API rejects,
// setting FILL sizing on a node whose parent is not auto-layout, and writing text
// with a font that was never loaded.

const LOADED_FONTS = new Set();
const AUTO = new Set(['HORIZONTAL', 'VERTICAL']);

let idSeq = 1;

function descendants(n, acc) {
  acc = acc || [];
  for (const c of n.children || []) { acc.push(c); descendants(c, acc); }
  return acc;
}

function makeNode(type) {
  const n = {
    id: String(idSeq++) + ':' + idSeq,
    type,
    name: '',
    children: [],
    parent: null,
    x: 0, y: 0, width: 100, height: 100,
    fills: [], strokes: [],
    opacity: 1,
    cornerRadius: 0,
    strokeWeight: 1,
    visible: true,
  };

  n.appendChild = function (c) {
    if (!c) throw new Error(type + '.appendChild(undefined) — the child was never created');
    if (c.parent) c.parent.children = c.parent.children.filter(function (k) { return k !== c; });
    c.parent = n;
    n.children.push(c);
  };
  n.remove = function () {
    if (n.parent) n.parent.children = n.parent.children.filter(function (k) { return k !== n; });
  };
  n.resize = function (w, h) {
    if (typeof w !== 'number' || typeof h !== 'number' || isNaN(w) || isNaN(h)) {
      throw new Error(n.name + '.resize(' + w + ', ' + h + ') — non-numeric size');
    }
    if (w <= 0 || h <= 0) throw new Error(n.name + '.resize(' + w + ', ' + h + ') — must be > 0');
    n.width = w; n.height = h;
  };
  n.findOne = function (fn) {
    const all = descendants(n);
    for (const d of all) if (fn(d)) return d;
    return null;
  };
  n.findAll = function (fn) { return descendants(n).filter(fn || function () { return true; }); };
  n.findAllWithCriteria = function (crit) {
    return descendants(n).filter(function (d) { return crit.types.indexOf(d.type) !== -1; });
  };
  n.clone = function () {
    const copy = makeNode(n.type === 'COMPONENT' ? 'INSTANCE' : n.type);
    copy.name = n.name;
    copy.width = n.width; copy.height = n.height;
    copy.fills = n.fills; copy.strokes = n.strokes;
    copy.layoutMode = n.layoutMode;
    copy.characters = n.characters;
    for (const c of n.children) copy.appendChild(c.clone());
    return copy;
  };
  n.createInstance = function () {
    if (n.type !== 'COMPONENT') throw new Error('createInstance on a ' + n.type);
    return n.clone();
  };

  // Enum-valued layout properties. The real API validates these and the values are easy to
  // mix up: STRETCH is a child's layoutAlign, never a parent's counterAxisAlignItems.
  const ENUMS = {
    layoutMode: ['NONE', 'HORIZONTAL', 'VERTICAL'],
    primaryAxisSizingMode: ['FIXED', 'AUTO'],
    counterAxisSizingMode: ['FIXED', 'AUTO'],
    primaryAxisAlignItems: ['MIN', 'MAX', 'CENTER', 'SPACE_BETWEEN'],
    counterAxisAlignItems: ['MIN', 'MAX', 'CENTER', 'BASELINE'],
    layoutAlign: ['MIN', 'CENTER', 'MAX', 'STRETCH', 'INHERIT'],
    layoutPositioning: ['AUTO', 'ABSOLUTE'],
    layoutWrap: ['NO_WRAP', 'WRAP'],
  };
  for (const key of Object.keys(ENUMS)) {
    Object.defineProperty(n, key, {
      configurable: true,
      get: function () { return n['_' + key]; },
      set: function (v) {
        if (ENUMS[key].indexOf(v) === -1) {
          throw new Error('in set_' + key + ': Property "' + key + '" failed validation: Invalid enum value. Expected ' +
            ENUMS[key].map(function (e) { return "'" + e + "'"; }).join(' | ') + ", received '" + v + "' (node \"" + n.name + '")');
        }
        n['_' + key] = v;
      },
    });
  }
  // Real nodes always carry these; without the seed a clone copies `undefined` back in.
  n._layoutMode = 'NONE'; n._layoutPositioning = 'AUTO'; n._layoutWrap = 'NO_WRAP';
  n._layoutAlign = 'INHERIT'; n._primaryAxisSizingMode = 'AUTO'; n._counterAxisSizingMode = 'AUTO';
  n._primaryAxisAlignItems = 'MIN'; n._counterAxisAlignItems = 'MIN';

  // The real API rejects HUG/FILL unless the structural context allows it.
  for (const axis of ['Horizontal', 'Vertical']) {
    const key = 'layoutSizing' + axis;
    Object.defineProperty(n, key, {
      configurable: true,
      get: function () { return n['_' + key]; },
      set: function (v) {
        if (v === 'FILL' && (!n.parent || !AUTO.has(n.parent.layoutMode))) {
          throw new Error('in set_' + key + ': FILL can only be set on children of auto-layout frames (node "' + n.name + '")');
        }
        if (v === 'HUG' && !AUTO.has(n.layoutMode) && n.type !== 'TEXT') {
          throw new Error('in set_' + key + ': HUG can only be set on auto-layout frames or text children (node "' + n.name + '")');
        }
        if (v === 'FILL' && axis === 'Horizontal' && n.type === 'TEXT') n.textAutoResize = 'HEIGHT';
        n['_' + key] = v;
      },
    });
  }

  if (type === 'TEXT') {
    n.characters = '';
    n.textAutoResize = 'WIDTH_AND_HEIGHT';
    n.height = 20;
    Object.defineProperty(n, 'fontName', {
      configurable: true,
      get: function () { return n._fontName; },
      set: function (v) {
        const key = v.family + '|' + v.style;
        if (!LOADED_FONTS.has(key)) {
          throw new Error('Cannot write to node with unloaded font "' + v.family + ' ' + v.style + '"');
        }
        n._fontName = v;
      },
    });
  }

  return n;
}

function makePage(name) {
  const p = makeNode('PAGE');
  p.name = name;
  return p;
}

const root = makeNode('DOCUMENT');
root.name = 'Mock File';
const firstPage = makePage('Page 1');
root.appendChild(firstPage);

const collections = [];
const variablesById = {};

const figma = {
  root: root,
  currentPage: firstPage,
  command: 'build',
  editorType: 'figma',

  createFrame: function () { const n = makeNode('FRAME'); n.fills = [{ type: 'SOLID' }]; figma.currentPage.appendChild(n); return n; },
  createText: function () { const n = makeNode('TEXT'); figma.currentPage.appendChild(n); return n; },
  createRectangle: function () { const n = makeNode('RECTANGLE'); figma.currentPage.appendChild(n); return n; },
  createEllipse: function () { const n = makeNode('ELLIPSE'); figma.currentPage.appendChild(n); return n; },
  createStar: function () { const n = makeNode('STAR'); n.pointCount = 5; n.innerRadius = 0.5; figma.currentPage.appendChild(n); return n; },
  createPolygon: function () { const n = makeNode('POLYGON'); n.pointCount = 3; figma.currentPage.appendChild(n); return n; },
  createComponent: function () { const n = makeNode('COMPONENT'); n.fills = [{ type: 'SOLID' }]; figma.currentPage.appendChild(n); return n; },
  createPage: function () { const p = makePage('Page ' + root.children.length); root.appendChild(p); return p; },

  createNodeFromSvg: function (svg) {
    if (typeof svg !== 'string' || svg.indexOf('<svg') !== 0) throw new Error('createNodeFromSvg: not an svg string');
    if (svg.indexOf('viewBox') === -1) throw new Error('createNodeFromSvg: svg has no viewBox');
    if (svg.indexOf('currentColor') !== -1) throw new Error('createNodeFromSvg: currentColor would import as black');
    if (svg.indexOf('currentStroke') !== -1) throw new Error('createNodeFromSvg: strokeWidth="currentStroke" is not valid SVG');
    const f = makeNode('FRAME');
    f.fills = [{ type: 'SOLID' }];
    const paths = svg.match(/<path|<rect|<circle|<ellipse|<g\b/g) || ['<path'];
    for (let i = 0; i < paths.length; i++) {
      const v = makeNode('VECTOR');
      v.fills = [{ type: 'SOLID' }];
      v.strokes = [{ type: 'SOLID' }];
      f.appendChild(v);
    }
    figma.currentPage.appendChild(f);
    return f;
  },

  createImage: function (bytes) {
    // Duck-typed, not instanceof: the plugin runs in its own vm realm, so its Uint8Array
    // is a different constructor from this one.
    if (!bytes || typeof bytes.length !== 'number' || bytes.length < 16 || typeof bytes[0] !== 'number') {
      throw new Error('createImage: not image bytes');
    }
    const png = bytes[0] === 0x89 && bytes[1] === 0x50;
    const jpg = bytes[0] === 0xFF && bytes[1] === 0xD8;
    if (!png && !jpg) throw new Error('createImage: bytes are neither PNG nor JPEG');
    return { hash: 'img' + (idSeq++) };
  },
  loadFontAsync: async function (fn) { LOADED_FONTS.add(fn.family + '|' + fn.style); },
  listAvailableFontsAsync: async function () { return [{ fontName: { family: 'Google Sans Flex', style: 'Regular' } }]; },
  setCurrentPageAsync: async function (p) { figma.currentPage = p; },
  getNodeByIdAsync: async function (id) {
    const all = [root].concat(descendants(root));
    return all.filter(function (n) { return n.id === id; })[0] || null;
  },
  getLocalTextStylesAsync: async function () { return []; },
  getLocalPaintStylesAsync: async function () { return []; },
  getLocalEffectStylesAsync: async function () { return []; },

  viewport: { scrollAndZoomIntoView: function () {} },
  ui: {
    postMessage: function (m) { if (m.type === 'log') process.stdout.write('   · ' + m.text.split('\n')[0] + '\n'); },
    onmessage: null,
  },
  showUI: function () {},
  closePlugin: function () {},
  notify: function () { throw new Error('figma.notify is not implemented in plugins run this way'); },

  variables: {
    createVariableCollection: function (name) {
      const c = {
        id: 'C' + idSeq++, name: name,
        modes: [{ modeId: 'm1', name: 'Mode 1' }],
        variableIds: [],
        renameMode: function (id, n2) { for (const m of c.modes) if (m.modeId === id) m.name = n2; },
        // Starter plans allow exactly one mode. Simulated by default so the plugin is
        // tested against the plan it actually runs on.
        addMode: function (n2) {
          if (!process.env.FIGMA_PAID_PLAN) throw new Error('in addMode: Limited to 1 modes only');
          const id = 'm' + (c.modes.length + 1); c.modes.push({ modeId: id, name: n2 }); return id;
        },
      };
      collections.push(c);
      return c;
    },
    getLocalVariableCollectionsAsync: async function () { return collections; },
    createVariable: function (name, col, type) {
      const v = { id: 'V' + idSeq++, key: 'k' + idSeq, name: name, resolvedType: type, valuesByMode: {}, scopes: [], setValueForMode: function (m, val) { v.valuesByMode[m] = val; } };
      col.variableIds.push(v.id);
      variablesById[v.id] = v;
      return v;
    },
    getVariableByIdAsync: async function (id) { return variablesById[id] || null; },
    setBoundVariableForPaint: function (paint, field, variable) {
      if (!variable) throw new Error('setBoundVariableForPaint: variable is undefined — a token name is wrong');
      return { type: 'SOLID', color: { r: 0, g: 0, b: 0 }, boundVariables: { color: { id: variable.id } } };
    },
  },
};

module.exports = { figma: figma, descendants: descendants, root: root };
