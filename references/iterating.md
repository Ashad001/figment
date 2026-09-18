# Iterating on generated design

Review feedback on generated screens comes in a small number of shapes. Each one has a fix
and, more usefully, a check that stops it recurring.

## The common ones

**"Things are overlapping / running into each other."**
Almost always a hard-coded width, or three siblings with `layoutGrow = 1` where one's content
needs more than a third. Do not nudge the number — find the guess and replace it with a width
taken from the parent (`paraIn`, `FILL`, `layoutGrow`). Then add the `grower-overflow` check
if it is not already there.

**"This is clipped / cut off."**
A fixed-height card whose content grew, usually after copy changed or the column got narrower.
Switch it to a height-hugging card. Fixed heights are for things that genuinely are a fixed
height, which is fewer things than it seems.

**"It's too wordy."**
Rarely a copy problem — usually a structure problem. A dashboard that explains itself is one
with nowhere else to put the explanation. Look for a surface that should exist (a chat, a
detail panel, a tooltip) before rewriting sentences. A useful, brutal metric: count text nodes
per screen and watch it across revisions.

**"That's the wrong icon / logo."**
Verify by path data, never by name. See the name traps in `assets.md`. Brand marks that look
like flat blobs were recoloured — stop recolouring them.

**"This isn't what I'm seeing."**
A stale build. The plugin concatenates sources into one file; if you edited `src/` and did not
re-run `build.sh`, the harness and Figma both ran the old code. Make `build.sh && node test/run.cjs`
one habit, never two commands.

**"It doesn't look like our product."**
Measure rather than eyeball. Read computed styles from the running product and compare padding,
radius, line-height, weight. This is also where a design-system rule pays off: if a value has no
token, the odds are it is a differently-named token, not a missing one.

**"Nothing links to this screen."**
Worth catching yourself: a screen with no entry point is a screen that cannot ship. Every state
you draw needs something in the navigation, a row, a button or a badge that opens it. Ask it of
each screen as you add it.

## Habits that prevent rework

**Parameterise instead of copying.** "The same screen with the panel open" is an argument, not
a second builder. Two copies drift within a day and the reviewer will find the drift, not you.

**One table owns names and positions.** A single `ORDER` array mapping name → builder → grid
slot lets the canvas be reordered without touching a builder, and makes the layer list sort the
way the product reads. Renaming a screen becomes a one-line diff.

**Number the sources, hoist across them.** `01-foundation` … `05-screens` concatenated in
`build.sh`. Function declarations hoist across the whole bundle, so a later file can call an
earlier one and vice versa; the numbering is for humans.

**Keep superseded work in the tree, out of the build.** When a direction is abandoned, take the
screens out of `ORDER` rather than deleting the builders. They still compile, they cost nothing,
and "put that back" stays a one-line change. Say so in the README so nobody mistakes them for
live code.

**Rebuild, never patch the canvas.** Anyone who hand-edits a generated frame loses the edit on
the next run and, worse, stops trusting the pipeline. Make it a stated rule.

## Reviewing with a human

The outer loop is a screenshot and a conversation. Two things make it go faster:

- **Batch.** Run the plugin once per set of changes, not once per change. The inner loop is
  free; the outer loop costs someone's attention.
- **Say what you did not do.** When a request implies something you deliberately left out — a
  screen you did not draw because it would show one card that is already visible, a state you
  skipped — name it. It is the difference between a gap and an oversight, and only one of those
  needs discussing.
