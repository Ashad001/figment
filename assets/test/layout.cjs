// A small auto-layout engine, used only to catch overflow before Figma renders it.
//
// It is not a renderer. It assigns widths top-down the way Figma does (fixed, fill,
// grow-share) and measures text against the width it actually gets, then reports any
// frame whose content cannot fit its declared box — a text node hard-coded to 124px inside
// a 100px card, a 130px stack inside a card declared 108px tall, or a layoutGrow child whose
// content needs more than the share it was given and so overlaps its neighbour.

// Approximate advance width as a fraction of font size, for a typical UI sans in mixed
// case. Tune it to the real typeface if labels come out consistently wrong; err
// pessimistic, since a false alarm costs a minute and a missed overlap costs a cycle.
const CHAR_W = 0.53;
const MIN_USEFUL = 8;

function isAuto(n) { return n.layoutMode === 'HORIZONTAL' || n.layoutMode === 'VERTICAL'; }
function padX(n) { return (n.paddingLeft || 0) + (n.paddingRight || 0); }
function padY(n) { return (n.paddingTop || 0) + (n.paddingBottom || 0); }
function fillsW(n) { return n._layoutSizingHorizontal === 'FILL' || n.layoutGrow === 1; }

function textSize(n, availW) {
  const size = n.fontSize || 14;
  const lh = (n.lineHeight && n.lineHeight.value) || Math.round(size * 1.45);
  const chars = n.characters || '';
  const natural = chars.length * CHAR_W * size;
  const longestWord = chars.split(/\s+/).reduce((m, t) => Math.max(m, t.length), 0) * CHAR_W * size;

  if (n.textAutoResize === 'WIDTH_AND_HEIGHT') return { w: natural, h: lh, min: natural };
  // wrapping text: width is whatever it was given
  const w = n._layoutSizingHorizontal === 'FILL' ? availW : (n.width || availW);
  const para = chars.split('\n');
  let lines = 0;
  for (const p of para) lines += Math.max(1, Math.ceil((p.length * CHAR_W * size) / Math.max(w, MIN_USEFUL)));
  return { w: w, h: lines * lh, min: longestWord };
}

/**
 * Lay a node out inside `availW` and return the box it actually occupies.
 * Records overflow into `out`.
 */
function layout(n, availW, out, path) {
  const here = path.concat(n.name || n.type);

  if (n.type === 'TEXT') {
    const s = textSize(n, availW);
    n._w = s.w; n._h = s.h;
    if (s.min > availW + 0.5 && availW > MIN_USEFUL) {
      out.push({ kind: 'text-too-wide', where: here.join(' > '), need: Math.round(s.min), have: Math.round(availW) });
    }
    return { w: s.w, h: s.h, need: s.min };
  }

  if (!isAuto(n)) {
    const w = fillsW(n) ? availW : n.width;
    n._w = w; n._h = n.height;
    return { w: w, h: n.height, need: fillsW(n) ? 0 : n.width };
  }

  const wFixed = n.layoutMode === 'HORIZONTAL' ? n.primaryAxisSizingMode === 'FIXED' : n.counterAxisSizingMode === 'FIXED';
  const hFixed = n.layoutMode === 'VERTICAL' ? n.primaryAxisSizingMode === 'FIXED' : n.counterAxisSizingMode === 'FIXED';

  let w;
  if (fillsW(n)) w = availW;
  else if (wFixed) w = n.width;
  else w = availW;                        // hug: bounded by what the parent offers
  const inner = Math.max(MIN_USEFUL, w - padX(n));

  // Absolutely-positioned children (a logo pinned to a corner) are laid out for their
  // own text checks but contribute nothing to the parent's stack.
  const kids = n.children.filter((c) => c.visible !== false && c.layoutPositioning !== 'ABSOLUTE');
  for (const c of n.children) if (c.layoutPositioning === 'ABSOLUTE') layout(c, inner, out, here);
  const gaps = Math.max(0, kids.length - 1) * (n.itemSpacing || 0);

  // `need` is what the content CANNOT go below; `contentW` is what it was actually given.
  // The two differ for a grower, and only `need` can tell you a box will overlap.
  let contentW = 0, contentH = 0, need = 0;

  if (n.layoutMode === 'VERTICAL') {
    for (const c of kids) {
      const box = layout(c, inner, out, here);
      contentW = Math.max(contentW, box.w);
      need = Math.max(need, box.need || 0);
      contentH += box.h;
    }
    contentH += gaps;
  } else if (n.layoutWrap === 'WRAP') {
    // Wrapping row: children flow onto as many lines as they need.
    let rowW = 0, rowH = 0, rows = 1;
    for (const c of kids) {
      const b = layout(c, inner, out, here);
      const next = rowW ? rowW + (n.itemSpacing || 0) + b.w : b.w;
      if (next > inner && rowW > 0) { contentH += rowH + (n.counterAxisSpacing || 0); rows++; rowW = b.w; rowH = b.h; }
      else { rowW = next; rowH = Math.max(rowH, b.h); }
      contentW = Math.max(contentW, rowW);
      need = Math.max(need, b.need || 0);
    }
    contentH += rowH;
  } else {
    // Fixed-width children first; growers share what is left.
    const growers = kids.filter(fillsW);
    let used = 0;
    for (const c of kids) if (!fillsW(c)) { const b = layout(c, inner, out, here); used += b.w; need += b.need || 0; }
    const leftover = inner - used - gaps;
    const share = growers.length ? Math.max(MIN_USEFUL, leftover / growers.length) : 0;
    for (const c of growers) {
      const b = layout(c, share, out, here);
      need += b.need || 0;
      // A grower whose own content cannot fit the share it was given. Figma does not shrink
      // it — it overlaps its neighbour, which is how a top bar split into equal thirds ends
      // up with the title running through the mode switch.
      if ((b.need || 0) > share + 1) {
        out.push({ kind: 'grower-overflow', where: here.concat(c.name || c.type).join(' > '), need: Math.round(b.need), have: Math.round(share) });
      }
    }
    for (const c of kids) { contentW += c._w || 0; contentH = Math.max(contentH, c._h || 0); }
    contentW += gaps;
    need += gaps;
    if (growers.length && leftover < 0) {
      out.push({ kind: 'row-overflow', where: here.join(' > '), need: Math.round(used + gaps + padX(n)), have: Math.round(w) });
    }
  }

  const needW = need + padX(n);
  const needH = contentH + padY(n);
  if (wFixed && needW > n.width + 1) {
    out.push({ kind: 'too-wide', where: here.join(' > '), need: Math.round(needW), have: n.width });
  }
  if (hFixed && n._layoutSizingVertical !== 'FILL' && needH > n.height + 1) {
    out.push({ kind: 'too-tall', where: here.join(' > '), need: Math.round(needH), have: n.height });
  }

  // A grower's assigned width beats its declared one — that is what layoutGrow means.
  n._w = fillsW(n) ? w : (wFixed ? n.width : Math.max(contentW + padX(n), 0));
  n._h = hFixed ? n.height : needH;
  return { w: n._w, h: n._h, need: needW };
}

function check(screen) {
  const out = [];
  // A screen frame is a fixed 1440x900 horizontal row.
  layout(screen, screen.width, out, []);
  return out;
}

module.exports = { check };
