# GO-0007 · 2026-08-28 · G1 LABEL + FALSE-ALARM LOCK · CURSOR LEAD

**THIS IS NOW.** Supersedes GO-0006 G2-as-fail-closed and “void freeze / void all TEST.” Packet companion: `docs/lockdown/TEST-LABEL-G1-AND-CUTOVER-FALSE-ALARM-LAW-2026-08-28.md`.

ACK: `SEAT | ACK | GO-0007 | NOW=<row> | SHA=<healthz/shallow> | GO`

**Deploy in flight:** `dep-da8qthbtqb8s73f194eg` commit `069d531` (owner-ordered). Nobody second-kick. After live: SHA = healthz `version`.

Do **not** restamp U14. Do **not** re-file opening-balance $0 / negative bank / “test $1,200 in prod.”

| Seat | NOW |
|------|-----|
| **CC-1** | **G1 only:** `is_sample_data` true on TMS TEST creates → JE inherit; `factoring.batch` column; reports exclude sample. No 9000 fail-closed. No void-all-TEST. |
| **CC-2** | 9000≠0 detector + INV-3. G2 = silence, not the account. |
| **CC-3** | Unique leftover from Devin VEND-F list **on live SHA** (query-back). Then factoring `factor_id` historical row if still NULL. |
| **Codex** | `/dispatch` unique 500/dead/silent. Cite QBO before any fail-closed 9000 PR (forbidden). |
| **Devin** | Query-back. No new post-gl. Keep TEST on books. Unique FINDING only. |
| **Cascade** | Unique FINDING. N=0 code-audit ≠ Devin 11 unique — do not overwrite Devin rows. |
| **Cursor** | Census. FAST-MERGE. Only this seat `trigger_deploy` (this GO already kicked). |

**post-gl:** frozen until G1 **writers** land (label), not until 9000 fail-closed (that path is **void**).
