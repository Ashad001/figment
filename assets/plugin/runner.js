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
