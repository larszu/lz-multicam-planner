# Plan import: walls and stages from the floor plan

A floor plan used to be a picture here: drop it in, calibrate it by hand, draw
the walls yourself. The AI analysis added in #39/#40 was meant to shorten that
and drew in the wrong places instead. This document says why, what replaced it,
and how accurate the result is — measured on five real architect's drawings.

## Why the AI analysis drew in the wrong places

Measured on 2026-10-14 against the code of #189:

1. **It asked the model for metres per pixel.** The providers downscale an
   image before the model sees it (Claude to 1568 px on the long edge, OpenAI
   and Gemini tile it), so the model never sees the pixels its number refers
   to. The wrong scale then displaced every wall it returned.
2. **It sent the whole sheet.** An A0 sheet at 1:200 rendered to 2000 px has
   about 12 cm per pixel. An 11.5 cm wall is one pixel wide — there is nothing
   left to trace.
3. **It asked for fractions 0..1 with nothing to measure against.** Models place
   things to a few per cent of the image that way; on a 60 m hall that is metres.

All three are properties of the method, not of the model. No prompt fixes them.

## What the import does now

**Geometry first, AI only where geometry runs out.**

A CAD export carries the drawing itself. `@avplan/floorplan` reads it:

- **Vector PDF** — paths and texts through the pdf.js operator list, including
  the layer names from the optional-content dictionary (`Wände neu`,
  `Bemaßung`, `Einrichtung Küche` …).
- **DXF** — LINE, LWPOLYLINE, POLYLINE, ARC, CIRCLE, SOLID, HATCH, TEXT, MTEXT,
  INSERT and DIMENSION through its display block; layer as the drawing layer,
  `$INSUNITS` as the unit.
- **Scale** from the dimension chains: every dimension figure that matches a
  candidate scale is one vote, the scale with the most votes wins, the title
  block (`M 1:200`) only adds weight. The same chains measure afterwards how
  accurately the detected geometry sits.
- **Walls** as centre lines from the edge pairs of the filled wall polygons,
  with their thickness; lightweight and glazed walls from parallel line pairs
  on wall layers. Ends are extended to the centre line of the wall they meet,
  so there is no gap at a corner in 3D.
- **Openings**: a gap between two collinear wall pieces of the same thickness
  is a door (a swing arc of the right size next to it), a window (glass lines
  across the gap, or a thin pane between columns) or a plain opening. Doors and
  windows become a filler wall carrying the opening, with sill and lintel —
  `BRH` in the plan sets the sill height when it is written.
- **Columns, stairs, rooms**: small stocky filled polygons are columns, five or
  more equally spaced parallel lines of the same length are a flight of stairs,
  and a room stamp (`1.115 / Gruppenraum 9 / F: 32,55 m² / RH 3,00`) gets its
  outline either from the coloured room area of an area plan or by flooding
  from the stamp against the detected walls.
- **Stages** from a label (`Bühne`, `Podium`, `Podest`, `Tribüne`) plus the
  outline it sits in; when the label writes its size (`2,30x8,60m`), that
  rectangle is looked for nearby, even if it is drawn as single lines.

The AI is left with what geometry cannot answer: scans and photos, and a plan
whose drawing is too unusual to read. It gets a **crop with a labelled grid**
and answers in grid units 0..1000; the answer is then **snapped** onto the
drawing — onto the detected wall centre lines, or, on a scan, onto the dark
band of pixels (that also measures the wall thickness). What does not snap is
kept as the AI drew it and says so in the report.

Nothing is applied until **Apply**: the result is an overlay on the 2D plan
(walls red, columns amber, stages orange, rooms green). A rectangle dragged on
the plan limits the run to one area — useful for the one hall on a sheet that
shows a whole building.

## Measured on five real plans

Five sheets by the same office (ArchiCAD, A0, 1:200, two of them area plans
after DIN 277). They are the client's drawings and are **not** in the repo; the
tests in `@avplan/floorplan` use small plans drawn in the test itself.

| Plan | Scale found | Chains read / used | Chain error median · p95 | Walls | Doors · windows | Columns | Rooms (with outline) | Room area vs. stamp (median) | Time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G-01 Erdgeschoß/UG | 1:200 from chains | 1053 / 292 | 0 mm · 6 mm | 2381 (2483 m) | 130 · 35 | 102 | 133 (86) | 5,5 % | 1,7 s |
| G-02 1. Obergeschoß | 1:200 from chains | 1095 / 273 | 1 mm · 10 mm | 3888 (3127 m) | 137 · 123 | 170 | 113 (67) | 8,1 % | 2,3 s |
| G-03 2. Obergeschoß | 1:200 from chains | 459 / 166 | 0 mm · 6 mm | 881 (1439 m) | 48 · 20 | 61 | 84 (68) | 8,4 % | 0,9 s |
| Ü-NRF-01 EG+UG | 1:200 from chains | 12 / 6 | 0 mm · 1 mm | 2445 (2557 m) | 139 · 114 | 106 | 131 (127) | **0,0 %** | 0,3 s |
| Ü-NRF-02 1. OG | 1:200 from title block | 4 / 1 | 1 mm · 1 mm | 3917 (2974 m) | 158 · 291 | 175 | 110 (106) | **0,0 %** | 0,7 s |

How to read this:

- **Chain error** is what the scale search itself reports: dimension figure
  minus measured length for every chain that matched. At 1:200 a millimetre on
  paper is 20 cm in the room, so these numbers say the scale is right, not that
  a wall is right.
- **Where the walls actually sit** was measured separately: for every dimension
  tick, the distance *along the chain* to the nearest wall face running across
  it. Median 25 mm on G-01 and G-02, 0 mm on G-03; the p95 is 0,3–0,5 m because
  many chains dimension things that are not walls (window reveals, furniture,
  axes, fixture positions) and then hit the wrong face. 81 of 184 points on
  G-01 are within 2 cm.
- **Room area against the stamp** is the strongest single check, because the
  stamp is a number the architect wrote: on both area plans the detected
  outline matches the printed m² to 0,0 % median (125 of 131, resp. 102 of 110
  rooms within 5 %). On the construction plans, where the outline has to be
  flooded against the walls instead of taken from a coloured area, the median
  is 5–8 % — the flood fill includes installation shafts and wall niches that
  the stamp's net area leaves out.
- The two area plans have almost no dimension chains. Ü-NRF-02 therefore falls
  back to the title block (`M 1:200`) — and the room areas confirm it
  independently.

Known limits on these sheets:

- The hall's structural columns are picked up as columns, but a few furniture
  symbols of the same size and shape are too.
- Outdoor areas (kerbs, parking bays) produce line-pair walls outside the
  building. The area rectangle is the answer to that.
- `Podium neu < 20m2 (2,30x8,60m)` on G-01 is found at 8,60 × 2,30 m from the
  size in its own label; a stage without a written size and without a closed
  outline is reported as uncertain rather than invented.

Reproduce: the overlays and `protokoll.json` are produced by the scripts in the
session scratchpad, not in the repo (the plans are the client's).

## DWG

DWG is a closed binary format. The free library that reads it, **LibreDWG**, is
GPL-3.0 — it cannot be bundled into these proprietary planners, as WASM or
otherwise. The paths that remain:

1. **ODA File Converter** (free, closed source) converts DWG → DXF in bulk on
   the desktop; the DXF then imports here with full geometry. This is the
   recommended route and the one every CAD office already has.
2. Any CAD application exports DXF directly (`SAVEAS` → DXF in AutoCAD,
   `Datei → Speichern unter` in BricsCAD, ArchiCAD and Vectorworks).
3. A paid DWG SDK (Open Design Alliance membership, Teigha) would allow direct
   reading. That is a licence decision, not a technical one.

Until one of those is taken, dropping a `.dwg` file says what it is and names
the converter instead of failing silently.
