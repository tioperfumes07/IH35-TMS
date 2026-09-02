# IH35 complete software map (git-downloadable)

**Ingested 2026-09-01** from Cascade’s `~/Downloads/IH35-DELIVERABLES/` rebuild (commit `5ee312cf0` extractor pass). Open these in GitHub or clone — they are not Downloads-only.

USMCA only. This inventory does **not** prove Live Chrome. It lists what exists and how screens → modals → endpoints → files → tables connect.

## Download these (repo-relative)

| File | What |
|------|------|
| [INDEX.html](./INDEX.html) | Folder index (map + GO-18 designs) |
| [MAP-FINDINGS.md](./MAP-FINDINGS.md) | Counts + honest gap ranking |
| [map/IH35-SOFTWARE-MAP-COMPLETE.html](./map/IH35-SOFTWARE-MAP-COMPLETE.html) | Interactive complete map (584 screens, 150 modals, 2136 endpoints) |
| [designs/Load Costs Tab.html](./designs/Load%20Costs%20Tab.html) | GO-18 13th-tab mock |
| [designs/Load Costs Board Home Page.html](./designs/Load%20Costs%20Board%20Home%20Page.html) | GO-18 Costs Board mock |

**GO-18 design law (already on main #19439):**

- `docs/lockdown/GO-18-LOAD-COSTS-DESIGN.md`
- `docs/lockdown/GO-18-LOAD-COSTS-DESIGN.html`
- `docs/lockdown/GO-18-LOAD-COSTS-AND-LINEAGE-MAP.md`

## Not in this folder (on purpose)

| Artifact | Why omitted | Local path if you still have it |
|----------|-------------|---------------------------------|
| `IH35-DELIVERABLES.zip` (~3.3 MB) | Zip of the whole Downloads pack | `~/Downloads/IH35-DELIVERABLES.zip` |
| Lane History xlsx (~3.1 MB) | Spreadsheet noise | zip / `~/Downloads/IH35-DELIVERABLES/data/` |
| City Alias Review.csv | **#19414 63/63 drained.** Do not rebuild. | seed already in repo |
| Other GO-01…GO-17 instruction copies | Canonical copies live under `docs/lockdown/` | Downloads `instructions/` |

## Severity (do not re-rank High)

Cascade’s first pass labeled 16 missing tables **High**. Re-read of each call site: **nothing is High** — guarded empty, unmounted, or extractor truncation. **Do not invent High gaps.** Medium = silent empty screens (13 half-built tables). See `MAP-FINDINGS.md`.
