// Screens: composition only.
//
// By the time a screen builder is written, it should read as a list of calls. If a builder
// is doing layout arithmetic or picking colours, something belongs in the layers below it.
//
// Note the parameter on s1: the moment you need "the same screen, but …", add an argument.
// Two copies of a screen drift within a day.

function s1(empty) {
  const scr = screen('s1 example', 1440, 900);

  const top = BOX('HORIZONTAL', 1440, 58, { name: 'topbar', itemSpacing: 10, counterAxisAlignItems: 'CENTER' });
  PAD(top, 0, 24, 0, 24);
  top.strokes = [F('border/subtle')];
  top.strokeTopWeight = 0; top.strokeLeftWeight = 0; top.strokeRightWeight = 0; top.strokeBottomWeight = 1;
  const title = T('Example', 16, 'Medium', 'text/primary', 22);
  top.appendChild(title); title.layoutGrow = 1;
  top.appendChild(BTN('Primary action', true, 34));
  scr.appendChild(top); fill(top);

  const body = bodyOf(scr);

  if (empty) {
    const e = AL('VERTICAL', { name: 'empty', itemSpacing: 10, counterAxisAlignItems: 'CENTER' });
    PAD(e, 120, 20, 20, 20);
    e.appendChild(SHAPE('mint', 64));
    e.appendChild(T('Nothing here yet', 20, 'Medium', 'text/primary', 26));
    const sub = PARA('When there is nothing to show, say so plainly and offer the one action that changes it.',
      13, 'Regular', 'text/muted', 420, 19);
    sub.textAlignHorizontal = 'CENTER';
    e.appendChild(sub);
    e.appendChild(BTN('Add the first one', true, 38));
    body.appendChild(e); fill(e);
    return scr;
  }

  const stats = AL('HORIZONTAL', { name: 'stats', itemSpacing: 12 });
  for (const s of [['Total', '128,400', '+18%'], ['Active', '3,120', '+9%'], ['Waiting', '6', null]]) {
    const t = AL('VERTICAL', { name: 'stat/' + s[0], itemSpacing: 3 });
    t.resize(200, 10);
    t.counterAxisSizingMode = 'FIXED';
    t.primaryAxisSizingMode = 'AUTO';
    PAD(t, 12, 14, 12, 14);
    t.cornerRadius = 12;
    t.fills = [F('surface/inset')];
    t.appendChild(T(s[0], 11, 'Regular', 'text/muted', 15));
    const v = AL('HORIZONTAL', { name: 'v', itemSpacing: 7, counterAxisAlignItems: 'CENTER' });
    const val = T(s[1], 24, 'Medium', 'text/primary', 30);
    v.appendChild(val); val.layoutGrow = 1;
    if (s[2]) v.appendChild(T(s[2], 12, 'Regular', 'accent/green', 16));
    t.appendChild(v); fill(v);
    stats.appendChild(t); t.layoutGrow = 1;
  }
  body.appendChild(stats); fill(stats);

  const card = CARDA('list', 1392);
  card.itemSpacing = 8; PAD(card, 14, 16, 14, 16);
  const h = AL('HORIZONTAL', { name: 'h', itemSpacing: 8, counterAxisAlignItems: 'CENTER' });
  const ht = T('A list of things', 13, 'Medium', 'text/primary', 18);
  h.appendChild(ht); ht.layoutGrow = 1;
  h.appendChild(PILL('3', 'surface/active', 'text/secondary', false));
  card.appendChild(h); fill(h);

  const ROWS = [
    ['mint', 'Something that happened', 'A short line of detail that wraps if the column narrows.', 'Review'],
    ['sky', 'Something else', 'Another line, kept to one sentence.', 'Review'],
    ['violet', 'A third thing', 'The detail is a paragraph, so it takes its width from the row.', 'Open'],
  ];
  for (const r of ROWS) {
    const row = AL('HORIZONTAL', { name: 'row/' + r[1], itemSpacing: 12, counterAxisAlignItems: 'CENTER' });
    PAD(row, 11, 14, 11, 14);
    row.cornerRadius = 12;
    row.fills = [F('surface/inset')];
    row.appendChild(SHAPE(r[0], 32));
    const m = AL('VERTICAL', { name: 'm', itemSpacing: 2 });
    m.appendChild(T(r[1], 13, 'Medium', 'text/primary', 18));
    paraIn(m, r[2], 12, 'Regular', 'text/muted', 16);
    row.appendChild(m); m.layoutGrow = 1;
    row.appendChild(BTN(r[3], false, 32));
    row.appendChild(ICON('chevron-right', 14, 'text/muted'));
    card.appendChild(row); fill(row);
  }
  body.appendChild(card); fill(card);

  const sp = AL('VERTICAL', { name: 'sp' });
  body.appendChild(sp); sp.layoutGrow = 1;
  return scr;
}
