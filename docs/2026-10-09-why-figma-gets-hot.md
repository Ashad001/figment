# Why the Mac gets hot while the Figment plugin runs

**Date:** 2026-10-09 · **Status:** cause narrowed down from the code; not yet measured inside Figma

## Short answer

The plugin does no background work, so the heat comes from the build itself. Every run deletes
everything it built last time and recreates it, all in one uninterrupted burst on Figma's main
thread, on the page you're looking at. Figma then has to:

- lay out every auto-layout frame
- shape every text layer
- draw the result
- sync every change to Figma's servers and the file's version history

For project B (below) there's a second cost. Its Screens page keeps every older design
version, roughly 32,000 nodes, and the plugin switches to that page on every run.

## What was checked

**1. No background loop.** I searched the scaffold and the two projects in the table below,
A and B, for:

- `setInterval`, `setTimeout`
- `figma.on(…)`, `documentchange`, `selectionchange`
- `requestAnimationFrame`, `while (true)`

There are none. After a build the plugin sits idle, with its panel open until you press Close.

**2. Build size.** Each project's own test harness, run on a scratch copy (the repos weren't
touched), reports:

| Project | Screens per run | Nodes created per run | Text layers |
|---|---|---|---|
| A | 11 | ~2,900 | 591 |
| B, final design only (what Figma builds) | 8 | ~3,400 | 745 |
| B, every section (what piles up on its Screens page) | 80 | ~31,800 | 7,262 |

Each run also deletes the same number of nodes it created last time.

**3. How a run works.**
- **One burst:** the screens loop has no `await`, so Figma can't do anything else until it
  finishes.
- **On the visible page:** B switches to Screens before it builds
  (`src/11-main.js:125`), so the nodes are created on the page on screen.
- **Zoom at the end:** the run finishes with `scrollAndZoomIntoView`.
- **Old versions stay:** older design sections are left on the same page and moved
  (`src/11-main.js:155-158`).

**4. The machine, with Figma idle (no plugin running):**
- Figma's renderer: about 5% CPU and 1.7 GB of memory.
- macOS reports no thermal warning.
- Chrome and Slack were using more CPU than Figma.

## Not verified

I can't run Figma desktop from here, so the CPU used *during* a build hasn't been measured. To
measure it, open Activity Monitor → CPU tab, sort by % CPU, and watch **Figma Helper
(Renderer)**:

1. While a build runs and for a minute after "Done".
   - If CPU drops back within seconds, the heat is the build burst.
2. With the panel open but idle, compared with the panel closed.
   - High CPU only while the panel is open would point to a plugin bug.
3. On the Screens page compared with an empty page, with no plugin running.
   - High CPU only on Screens means the heavy page is the cost, not the plugin.

## Ways to reduce it (none applied yet)

1. **Move old design sections to an "Archive" page** (B). Figma only loads and draws
   the page you're on, so the page the plugin opens shrinks from ~32k nodes to ~3k.
2. **Rebuild only the screens you changed:** the "Rebuild selected screens" option that was
   left out earlier. Each iteration then costs a few screens, not all of them.
3. **Close the plugin after a successful build.** Tidier, but probably no CPU win, since the
   plugin is idle by then.
