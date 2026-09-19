# Plan

Phased plan for River to River, set 19 Sep 2026 after a five-lens audit of the repo.
Working notes and the author's own framing live in `notes/` which is gitignored and private.

## What this is trying to be

An instrument that makes an argument, not a document and not a scroll narrative. It states a
position about 42nd Street and shows its method, so that a reviewer can see how each number was
arrived at and where it could be wrong.

The argument has two halves that are usually treated as separate subjects, and the point of the
project is that they are one:

1. **The public realm.** 42nd Street carries more people than its walking space allows. Pedestrians
   spill into the roadbed, the crosstown bus is slow at peak, and the street reads as chaotic rather
   than as the civic spine it could be.
2. **The development capacity.** There is unbuilt zoning capacity along the street, unevenly
   distributed and concentrated away from the four famous hubs.

The link between them is money: public realm improvements get paid for out of development value.
That is why a capacity study and a public life study belong in the same instrument.

Audience, in priority order: someone assessing the author's work, then urban planners and DCP
reviewers, then real estate developers, then community boards and residents.

## Standing rules

- **No copy is written in the author's voice.** Any sentence that sounds like her must be her words.
  Placeholder text is marked as placeholder and never quietly published as finished.
- **No colour, opacity or design value changes** that were not asked for.
- **Every published number traces to a raw source and is re-derivable** from code in this repo.
  A number that only an archived page can compute does not ship.
- **One selection rule, written down once**, and every lot on every page passes it.
- `main` is live. Work is branched and merged only when both sheets load and the data checks pass.

## Phases

Each phase ends in something a stranger could be shown.

| | Phase | What a stranger sees | Gate |
|---|---|---|---|
| **0** | Nothing on the live site is embarrassing | Every tab loads and looks finished. Clicking a lot visibly does something. It works on a phone. No new analysis. | Send the link to someone who has never seen it and watch them use it on a phone |
| **1** | One street, one dataset, one number | Both sheets describe the same lots under one stated rule. The capacity total on Sheet 01 matches the homepage. | A spot-checked address resolves the same on both sheets |
| **2** | The rail becomes readable | One legend open at a time, every control named for its layer, the readout where you can see it, the whole rail keyboard navigable. | Operate the sheet start to finish without a mouse |
| **3** | It leaves the browser | Link to a specific lot. Print to A3 for a packet. Use it on a phone at a community board meeting. | Print it and hand it to someone |
| **4** | Findings a developer would act on | How much of the street is already built past its zoning, what share of the ground goes to vehicles, and the official pedestrian count series. | Three figures nobody else has published about this street |
| **5** | The ground floor and the resident | What the ground floor actually does, foot by foot, and a layer of pinned observations from someone who lives on the street. | Gated on fieldwork, not on code |
| **6** | Freeze time | The same street across time. What was proposed and never drawn, and what was deleted at the east end. | Depends on 1 through 4 being credible |

Phases 0 to 4 are bounded and sized. Phases 5 and 6 are open ended and gated on fieldwork and on
decisions the author has not made yet.

## Known open decisions

- **Extent.** The project measures 12th Avenue to 1st Avenue, 10,411 ft. Pier 83 sits at the foot of
  West 42nd and the 42nd Street Ferry once ran from East 42nd to Williamsburg. Whether the extent
  should become pier to pier is open, and changing it re-bases every measurement.
- **Grand Central Terminal.** Whether it belongs in the lot set, and how its paper floor area is
  graded. It swings the headline finding by 33 points.
- **The chronology.** Whether the author appears on it, and in what words.

## Where the numbers live

Every headline must be computed by a page that ships. See `RESEARCH.md` for sources and
`analysis/` for the derivations.
