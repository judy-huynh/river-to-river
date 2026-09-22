# Standards

The bar every change to River to River is held to. Three parts: how it is drawn, how it is
used, how it is built. Set 19 Sep 2026.

## The goal, so the standards have something to serve

River to River is a tool for reading one street. It lines up everything the public record knows
about 42nd Street along the street itself, from the Hudson to the East River, so that anyone
can stand at any point and see what is there, who owns it, how it moves, and how much of it is
given to people. It diagnoses, then prices one trade between development capacity and public
space. It is also the author's portfolio piece and her record of living on the street, so it has
to survive a planner checking the numbers, a developer looking up a site, a board member on a
phone, and someone deciding whether to hire her.

## 1. Drawing standard (design school rigour)

The reference is the discipline of a graduate design school review: a drawing makes one
argument, and everything on the sheet either serves it or comes off.

- **One argument per view.** Every row, card and band answers a question. Nothing decorative.
- **Hierarchy by type, not by boxes.** One type scale on a 16px floor (16 / 16.5 / 18 / 20 / 24 /
  title). Helvetica Neue for statements, labels and every figure. A system serif (Charter stack)
  for running sentences only. No text below 16px except the map credit and the print foot.
- **One spacing scale**, multiples of 4px. No arbitrary literals.
- **Two line weights**: 1px hairline for division, 1.5px ink for structure.
- **Colour means something or is absent.** The data palette is fixed and is never changed
  without the author asking. A swatch that is identical on every row is removed, not styled.
- **Everything drawn to scale says so**, and anything exaggerated says that too.
- **Every figure carries its source and date** within one click, and its caveat on the sheet.
- **Empty is a finding.** Where data stops, the sheet is drawn blank and labelled, never
  interpolated.

## 2. Use standard (clean UX)

- **It explains itself in ten seconds**: what this is, what to do first.
- **Questions, not layers.** The answer is visible before the row is opened.
- **WCAG 2.1 AA throughout**: 4.5:1 text contrast, 3:1 for UI, visible focus on every control,
  full keyboard operation, names on every switch, `aria-live` on anything that updates.
- **Nothing is hover-only.** Anything a mouse can reveal, a tap and a key can reveal.
- **Touch targets 44px.** Works at 390px wide, stacks and scrolls, never overflows sideways.
- **Survives failure.** No WebGL, no token, no network: the numbers still render and the page
  says what did not load.
- **Survives the reader's settings.** Test with a browser minimum font size of 16px. Rows wrap
  inside themselves, never onto each other.
- **Plain language.** No planner jargon in anything a resident reads.
- **No copy in the author's voice** that she did not write. Placeholder slots stay visibly empty
  or are not rendered.
- **A text budget.** Each region shows only the answer to the question the reader has open. What
  explains or qualifies it sits one disclosure lower and is never deleted. Hard maximums for
  visible words at 1440x900 with a 16px minimum font, counted with `notes/ux/run.sh`:

  | Region | Max words | What counts |
  |---|---|---|
  | First-load rail | 100 | 9 rows, 3 group heads, the foot control |
  | First-load page, intro shut | 160 | Rail 100, ruler and foot 50, header 8 words plus 3 buttons |
  | First-load page, intro open | 250 | The intro text adds 89 words |
  | A closed row | 14 | Question, one figure, unit of 7 words or fewer, no sub-line |
  | An open row before any disclosure | 120 | Pick lists capped at 5 items plus "Show all N" |
  | Station card, short state | 60 | Close and More included; no scrolling at 900px tall; at most 2 lines per fact |
  | Station card, More open | +120 | Nothing repeated from the short state |
  | Ruler | 50 | 16 avenue labels, 4 hub names, 2 river labels, one caption of 10 words or fewer, one readout of 12 words or fewer; zero legend words |

  At most 6 type styles on screen, and at most 3 non-data emphases per state (the open answer, one
  flag, the position mark).

## 3. Build standard (clean code)

- Vanilla HTML, CSS and JS. No framework, no build step, no new dependency without a reason.
- **Every number on the page is computed from data**, never typed into prose.
- **Every dataset enters through a bake script** in `scripts/bake/`: fetch, clip, project,
  station, keep coordinates. Re-running it must reproduce the baked file.
- **`METHODOLOGY.md` changes in the same commit** as any dataset or spatial step.
- Lookups are pure functions. State lives in one place. No handler is bound twice.
- Comments are one or two lines and say why, not what.
- Before every commit: `node --check`, the data loads in node, `node scripts/check/station.js`
  passes, both widths render (1440 and 390), minimum font size 16 renders, no console errors,
  no horizontal overflow.
- `main` is live. Work happens on a branch and merges when the checks pass and the author has
  looked.
