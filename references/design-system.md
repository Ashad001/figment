# Layer 1 — the design system

Everything downstream binds to this, so it is worth getting right before drawing anything.

## Tokens as one table

Keep every design value in a single array in the foundation file, and generate the Figma
variable collection from it. One table means the token list is reviewable in a diff, and the
Figma file can never disagree with it.

```js
// [name, lightHex, lightAlpha, darkHex, darkAlpha, scope]
const TOKENS = [
  ['surface/canvas',  'ffffff', 1,    '0f0f0f', 1,    'fill'],
  ['surface/inset',   'f7f7f7', 1,    '161616', 1,    'fill'],
  ['border/subtle',   'ededed', 1,    '212121', 1,    'stroke'],
  ['text/primary',    '0f0f0f', 1,    'ffffff', 1,    'text'],
  ['text/muted',      '878787', 1,    'ffffff', 0.5,  'text'],
  ['accent/green',    '24a148', 1,    '24a148', 1,    'any'],
  ['tint/success',    '24a148', 0.12, '24a148', 0.16, 'fill'],
  ['shadow/subtle',   '000000', 0.06, '000000', 0.16, 'effect'],
];
```

**Name by role, not by value.** `surface/inset` survives a rebrand; `grey-100` does not, and
`bg-light` is a lie in dark mode. A reader should be able to tell from the name where a token
is allowed to appear, which is also what makes the scopes obvious.

**Alpha is part of the token.** Tints, scrims and shadows are colour *and* opacity. Splitting
them means every call site re-derives the opacity and they drift.

Useful families to have from the start: `surface/*` (canvas, inset, raised, active),
`border/*` (subtle, strong, emphasis), `text/*` (primary, secondary, muted, faint, link),
`accent/*`, `status/*`, `tint/*` (the low-alpha wash behind a status), `shadow/*`,
`overlay/*`.

## Modes

Write the primary mode to the collection's existing mode and add the second in a try/catch —
`addMode` throws on a Starter plan. Design for the single-mode case being correct: the mode
you ship is the mode that must look right, and the second is a bonus.

Because every fill is bound, switching the collection mode reskins every screen at once. That
is the payoff for the discipline, and it is worth demonstrating early so the team sees it.

## Type is a token too

Pair size, line-height and tracking permanently. A loose `fontSize` with an ad-hoc
`lineHeight` at each call site is how vertical rhythm dies.

```js
function T(chars, size, style, token, lh) {
  const t = figma.createText();
  t.fontName = style === 'Medium' ? MED : REG;
  t.characters = chars;
  t.fontSize = size;
  t.lineHeight = { unit: 'PIXELS', value: lh || Math.round(size * 1.45) };
  t.fills = [F(token)];
  return t;
}
```

If the product has a named type scale, encode *that* — `label-sm`, `body-md`, `heading-lg` —
rather than raw numbers. Two weights is usually the whole system; if the code only ships
Regular and Medium, do not invent a Bold in Figma.

Load every family/style pair with `figma.loadFontAsync` before any text is created.

## Spacing, radius, size

Real values from the product beat a theoretical 8pt grid. Read the padding off the shipped
component; if it is 14, the token is 14. A generated design that is tidier than the product
is not a design system, it is a redesign nobody asked for.

## Layout helpers are the system too

The foundation file should export a small vocabulary that every later layer uses. Roughly:

| helper | does |
|---|---|
| `F(token)` | a bound paint |
| `AL(dir, props)` | auto-layout frame, fills cleared |
| `BOX(dir, w, h, props)` | fixed-size auto-layout frame |
| `T(chars, size, style, token, lh)` | a text node |
| `paraIn(parent, chars, …)` | a wrapping paragraph at the parent's width |
| `CARD(name, w, h)` / `CARDA(name, w)` | fixed card / height-hugging card |
| `PAD(node, t, r, b, l)` | padding in one call |
| `fill(node)` / `grow(node)` | `layoutSizingHorizontal = 'FILL'` / `layoutGrow = 1` |
| `BTN(label, primary, h)` | button |
| `PILL(label, bg, fg, dot)` | status pill |
| `SHADOW(token, y, radius)` | an effect bound to a shadow token |

Once this vocabulary exists, a screen builder is a readable list of calls, and the traps in
`plugin-api.md` are fixed in one place instead of at every call site.

## Component or function?

Make a real Figma **component** when a designer will instance it, override it, or needs it to
update everywhere at once: icons, avatars, logos, a nav shell, anything appearing on many
screens.

Use a plain **factory function** for everything else. A component for a thing used once costs
a slot in the assets panel and buys nothing. The test is not "is it repeated in the code" —
factory functions repeat fine — it is "does a human need a handle on it".
