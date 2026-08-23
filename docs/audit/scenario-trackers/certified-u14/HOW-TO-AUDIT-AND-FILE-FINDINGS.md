# HOW CASCADE + DEVIN MUST AUDIT AND FILE FINDINGS

**Owner 2026-08-23. This is the method. ACK without this output = not auditing.**

**Two people only:** Cascade + **Devin-A (Devin)**. No Devin-B. No scribe. **AUDIT ONLY — no product PRs, no apps/ fixes, no recertify, no OPEN prefixes.**

Gold web (every module participates; not a Safety-only row):  
`docs/audit/ACCIDENT-CLAIM-WEB-AUDIT-MODEL-2026-08-23.md` (H01–H22).

Vertical bar: `docs/audit/CASCADE-DEVIN-VERTICAL-CERTIFIED-AUDIT-INSTRUCTIONS-2026-08-23.md`.

This folder (trackers + this HOW + findings board): `docs/audit/scenario-trackers/certified-u14/`

---

## What Jorge is measuring (not ACK)

Per **one** CERTIFIED module, you must produce **all four**:

1. **Tracker filled** — `U14-NN-<module>.md` in this folder.  
   Fully-Wired **1–12** + VERIFY **1–8** + **H01–H22** as TOUCHES / N/A / MISSING / DEAD / SILENT / UNVERIFIED + reverse on every TOUCHES hop.
2. **CONNECTIVITY-EXTENT block** (verbatim shape in the gold-web file) in that tracker **and** prepended on your OUTBOX.
3. **Findings in the shared board** (not chat): `FINDINGS-BOARD.md` in this folder.  
   Plus same-turn triple-lock: `docs/audit/GUARD-WORKORDERS.md` OPEN row + OUTBOX `FINDING | id | OWNER=… | board OPEN`.
4. **Recommendations** — who fixes (Cursor / CC-1 money / CC-2 / CC-3 / Codex). **You do not fix.**

`ACK | GOLD-WEB` with empty tracker = **defect**.  
`CDP=BLOCKED` then idle = **defect**. Chrome down → SQL/GET/Neon on the **same** hops; mark `LIVE_CHROME=BLOCKED`; still fill EXTENT. Unique 500/dead/silent still goes on the findings board.

Empty TMS / no accident row = `UNVERIFIED — 0 rows; recommend labeled TEST` — **not** AUDIT-PASS on the gold web.

---

## Lane (do not steal)

| Seat | Modules (CERTIFIED only) | App prefixes | OUTBOX |
|------|--------------------------|--------------|--------|
| Cascade | 1 accounting · 2 banking · 3 settlements · 4 factoring · 5 dispatch | `/accounting` `/banking` `/driver-finance` `/settlements` `/cash-advances` `/factoring` `/dispatch` | `docs/bus/OUTBOX-CASCADE.md` |
| Devin-A | 6 vendors · 11 maintenance · 12 safety · 13 insurance | `/vendors` `/maintenance` `/safety` `/insurance` | `docs/bus/OUTBOX-DEVIN-A.md` **(not the old Clicked OUTBOX-DEVIN)** |

Lawsuit hops: **from claim / safety / unit UI only**. Do **not** occupy `/legal` `/lists` `/customers` `/drivers` `/fleet`.

One module at a time. Finish EXTENT + board rows (or honest UNVERIFIED) → next module. Never idle.

---

## How to walk one module (order)

1. `git fetch origin && git checkout main && git pull --ff-only origin main`
2. `curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow` → `LIVE_SHA=version`
3. Open **that** module’s required JSON + architectural tabs. **Every tab / leaf**, not the home card.
4. For each leaf: Fully-Wired 1–12 (Live Chrome last if CDP works). Copy `VERTICAL-LEAF-WORKSHEET.md` into the tracker.
5. For the gold web: every H01–H22 that **touches this module** — click **forward and reverse**. Missing reverse = FINDING or UNVERIFIED, not PASS.
6. Money hops: **does it post to GL?** JE id or FLAG-OFF or N/A. No invented FKs. No remake Close / Book Load / proven TESTs.
7. Security: USMCA only; FORCE RLS; Owner-unscoped reads are load-bearing — page must still filter opco.

Then OUTBOX one module:

```
Cascade|Devin-A | CONNECTIVITY-EXTENT | MODULE=<id> | LIVE_SHA=<healthz>
EDGES_PROVEN: …
EDGES_MISSING: …
EDGES_DEAD: …
EDGES_SILENT: …
GL_POSTS: …
FINDINGS: none | id-list
VERDICT: AUDIT-PASS | FINDING | UNVERIFIED
GO
```

Incomplete EXTENT = keep going. Do not ACK and stop.

---

## How to file a finding (so the right coder fixes it now)

**Chat-only is not a finding.** File **same turn**:

| # | File | What |
|---|------|------|
| 1 | `FINDINGS-BOARD.md` (this folder) | New row: id, module, hop, class (500 / dead / silent / missing-reverse / no-GL / RLS), evidence (URL+SHA or SQL), **OWNER** seat |
| 2 | `docs/audit/GUARD-WORKORDERS.md` | OPEN row, same id, root cause, DoD for the **fixer** |
| 3 | Your OUTBOX | `FINDING \| <id> \| OWNER=<seat> \| board OPEN \| MODULE= \| LIVE_SHA=` |
| 4 | Tracker | Unique FINDING section + RECOMMEND |

**OWNER map (do not assign yourself to code):**

| Class | OWNER |
|-------|--------|
| GL / JE / bill / expense / settlement money math | CC-1 |
| Lists picker / +Add new FE | CC-3 |
| Reverse SQL/GET / canonical table | Codex |
| Live Chrome / routing / leftover 425c / bus | Cursor |
| Driver-hub leftover (after U14) | CC-2 |

Cursor lead copies OPEN ids onto `INBOX-<OWNER>.md` TOP. Auditors **never** FAST-MERGE product code.

Unique FINDING = HTTP 500, dead click, silent no-op, missing reverse that the gold web requires, money hop with no JE and no honest FLAG-OFF. Design nits stay in tracker notes.

---

## Forbidden (this is why Jorge said you are not doing it)

- ACK then wait for Chrome
- Recertify / Status table edits
- Product PRs / `trigger_deploy`
- Writing Clicked / Miss C / scoreboard Built as the audit
- Using `OUTBOX-DEVIN.md` (legacy Clicked dump) instead of `OUTBOX-DEVIN-A.md`
- Treating Devin-A as a scribe who only copies files
- Calling CERTIFIED SHA from last week complete on a new healthz without re-walking
- Inventing load/claim FKs
- Occupying OPEN U14 prefixes
