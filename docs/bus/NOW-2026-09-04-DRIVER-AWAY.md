# NOW — 2026-09-04 · OWNER MAY BE DRIVING

**Pull tip. ACK. One job. Do not ping Jorge.**

## Priority stack (owner 2026-09-04 evening)

| Priority | Seat | Job | Law |
|---|---|---|---|
| **P0** | **CC-3** | **Samsara geofence import** — count addresses → import ALL → project geofences | `ORDER-2026-09-04-CC-3-SAMSARA-GEOFENCE-IMPORT.md` |
| **P0** | **CC-1** | **Three-mile / true CPM** schema+guards (wire after geofences) + continue **31 OPEN** settlement feed | `ORDER-2026-09-04-CC-1-THREE-MILE-CPM.md` + settlement split |
| **P1** | **Cursor** | Lead · Book Load→Samsara push-back contract · control 6 · unblock ZERO if stalled | `CONTRACT-2026-09-04-BOOKLOAD-SAMSARA-PUSHBACK.md` |
| **P1** | **CC-3 later** | Telematics 3 + DRV-03 + samsara links + accident VOID | (after import) |
| **P2** | CC-2 / Codex / Cascade | ORDER-2026-09-04 section only | no settlement / no geo import |

## Hard rules (unchanged)

- Settlement feed: **31 OPEN · 0 closed · 0 close JEs** · hands off `5766/5772/5776/5780/5783/5784`
- Actual miles: **NULL+reason, never 0** · never derive from practical/short
- Geofences: import junk too · never auto-merge on city name · never delete
- USMCA · `is_sample_data=false` · real UI · FAST-MERGE ON

## Dependency

**True driven miles / detention / POD / invoice conversion need geofences.** CC-3 import is the prerequisite. CC-1 says so — does not invent brackets.
