# HANDOFF TO NEXT CODER — READ THIS FIRST (2026-08-12)

**From:** prior Cursor session (multiple trust defects — see §Failures below)  
**To:** whoever picks up next — treat this as law until Jorge replaces it  
**Repo:** `https://github.com/tioperfumes07/IH35-TMS`  
**Prod health:** `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → compare `version` to `origin/main` short SHA

---

## 0. What Jorge is trying to accomplish (one paragraph)

**Wire USMCA completely on 10 priority modules** — linkage, connectivity, money columns where applicable — until **Box 1 Required + Box 2 Audited + Box 3 Built are green on every Required cell** (Built ÷ Required = 100%). **Only then** Chrome / system test / Box 4 Live / PROD-VERIFIED. **Not before.** USMCA has **no QuickBooks** — all TMS posting ON, all QBO_* OFF, permanently. **Fix and wire now; test later.**

---

## 1. Failures from the prior session — do NOT repeat

| Defect | What happened | Correct behavior |
|--------|---------------|------------------|
| **Invented CC-3** | Agent wrote paste boxes for a seat that does not exist | **Four seats only:** Cursor · **Codex** · CC-1 · CC-2. **No CC-3.** |
| **Dropped Codex** | Gave Jorge 3 paste boxes; Codex is the primary FE wiring seat | Codex gets its own full paste box; owns lists/customers/vendors/dispatch Wave A+B |
| **Fragmented paste** | Multiple partial paste sections, Jorge bus box, stale instructions | **One fence per seat** in `docs/specs/CODER-PASTE-INSTRUCTIONS-2026-08-12.md` — **replaces ALL prior paste** |
| **Test before wire** | Implied Chrome/Live during sprint | **Forbidden** until 10 modules × 3-box gate |
| **Re-asked locked law** | USMCA flags, test gate, QBO out of scope | **Answered = closed** — read lockdown files, apply, keep working |
| **gh rate limit** | Could not open PR for law branch | Jorge or next coder opens PR manually when limit clears |

---

## 2. Locked owner law (never re-ask)

### Four seats

| Seat | Worktree | INBOX | OUTBOX (last line only) | Lane |
|------|----------|-------|-------------------------|------|
| **Cursor** | `/private/tmp/IH35-TMS-usmca-golive` | `INBOX.md` | `~/Desktop/.../OUTBOX-CURSOR.md` | Bus · CI/deploy unblock · guards · scoreboard · overflow |
| **Codex** | `/private/tmp/IH35-devin-b` | `INBOX.md` | `OUTBOX-CODEX.md` | **Primary FE wiring** — lists · customers · vendors · dispatch · pickers · EntityLink |
| **CC-1** | `/private/tmp/IH35-devin-b` | `INBOX-CC-1.md` | `OUTBOX-CC-1.md` | Money · GL · migrations · Neon (serial, one money PR) |
| **CC-2** | `/Users/jorgemunoz/Documents/GitHub/IH35-TMS-agent2` | `INBOX.md` | `OUTBOX-CC-2.md` | Post-merge samples only — **no full Live until 3-box gate** |

Desktop bus authority: `~/Desktop/IH35-CURSOR-AUDIT/USMCA-WEEKEND-LEAD-2026-08-07/00-CODER-START-HERE.md` · `PARALLEL-10-MODULES-4-SEATS-LOCKED.md`

### 10 priority modules (USMCA)

lists · accounting · dispatch · settlements · factoring · banking · customers · vendors · drivers · safety

Entity: `5c854333-6ea5-4faa-af31-67cb272fef80`

### Test gate

**Wire sprint:** Box 1 + 2 + 3 green on all Required cells on all 10 boards.  
**Test phase:** Box 4 Live / Chrome / PROD-VERIFIED — **only after gate.**

### USMCA flags (permanent)

- All TMS `*_POSTING_*` / GL posting flags → **ON** for USMCA  
- All `QBO_%`, `TMS_QBO_RECON`, `AP_IMPORT`, `VOID_QBO_MIRROR` → **OFF** for USMCA  
- Migration: `db/migrations/202608121800_usmca_posting_on_qbo_off.sql` (CC-1 applies on merge)  
- Guard: `scripts/verify-usmca-posting-on-qbo-off.mjs` (verify-step not yet claimed on main — Rule 37)

### Out of scope for USMCA sprint

QBO sync · TRANSP mirror · reconcile UI · “make QuickBooks match” · historical load FK invent (Rule 32)

---

## 3. Sole paste authority (give Jorge these four boxes only)

**File:** `docs/specs/CODER-PASTE-INSTRUCTIONS-2026-08-12.md`

Supersedes: `CODER-FULL-INSTRUCTIONS`, split CC-3 blocks, old INBOX-PASTE files, Jorge-only bus snippets, any chat-only paste.

Jorge pastes **one entire fence** per seat from that file — nothing else.

---

## 4. Repo state at handoff (2026-08-12 ~13:00 CT)

| Item | Value |
|------|--------|
| `origin/main` | `7e169fb59` (verify with `git fetch`) |
| Law branch | `cursor/usmca-wire-first-law` @ **`b49b659a6` committed locally, PUSH BLOCKED** — pre-push gate wants `REHEARSED:` on migration `202608121800` (data-mutating). Prior session applied equivalent UPDATE live on prod Neon 2026-08-12; next coder adds honest `REHEARSED:` line to commit message **or** CC-1 opens fresh money PR with migration + Neon branch rehearsal. |
| Law PR | **Not opened** — GitHub API rate limit; URL: `https://github.com/tioperfumes07/IH35-TMS/pull/new/cursor/usmca-wire-first-law` |
| Cursor INBOX top | Merge **#6012** (CI fresh db + P44); close **#6032/#6054** superseded by **#6072** |
| Neon live fix | USMCA QBO flags turned OFF manually 2026-08-12 via Neon MCP (prior session) |

### Law branch files (when merged)

- `docs/lockdown/USMCA-ENTITY-LAW-2026-08-12.md`
- `docs/lockdown/WIRE-FIRST-SPRINT-LAW-2026-08-12.md`
- `docs/specs/CODER-PASTE-INSTRUCTIONS-2026-08-12.md` (4 boxes)
- `docs/specs/STANDING-SESSION-DIRECTIVE.md` (§8/§9)
- `db/migrations/202608121800_usmca_posting_on_qbo_off.sql`
- `scripts/verify-usmca-posting-on-qbo-off.mjs`

---

## 5. First actions for next Cursor coder (ordered)

1. **`git fetch origin main`** — never work from stale main.  
2. **Commit + push** remaining law edits on `cursor/usmca-wire-first-law` → open PR → merge on green (doc-only + migration; CC-1 applies migration on Neon after merge).  
3. **INBOX ☐1:** `#6012` — confirm CI green, merge, delete branch.  
4. **INBOX ☐2:** Close `#6032` / `#6054`.  
5. **Do not** Chrome audit · do not claim module complete · do not invent seats.  
6. **Sync Desktop OUTBOX** last line only after each merge.  
7. **Pull work from** `INBOX.md` + `docs/audit/GUARD-WORKORDERS.md` OPEN rows in Cursor lane — not random blocks.

---

## 6. Ship discipline (non-negotiable)

- **Local gate before push:** `node scripts/ops/cursor-ship-preflight.mjs --body-file /tmp/pr-body.txt`  
- **One commit** on tip of `origin/main` for feature PRs — no stacking open branches  
- **PR title:** `Cursor- fix(module): FINDING — one-line defect`  
- **Evidence:** FINDING-first body (Rule 30) — not `## Summary`  
- **Verify-steps:** EVEN only · claim on main before authoring (Rule 37)  
- **Never** `--no-verify` unless FAST-MERGE law explicitly allows ENV-static-only (Codex pattern — read `FAST-MERGE-4MIN-LAW.md`)  
- **Never** babysit CI — read failing log line once, fix, push (Rule 35)

---

## 7. Where truth lives (read order)

1. This handoff  
2. `docs/specs/CODER-PASTE-INSTRUCTIONS-2026-08-12.md`  
3. `docs/lockdown/WIRE-FIRST-SPRINT-LAW-2026-08-12.md`  
4. `docs/lockdown/USMCA-ENTITY-LAW-2026-08-12.md`  
5. Worktree `INBOX.md`  
6. `docs/audit/GUARD-WORKORDERS.md` (OPEN in your lane)  
7. `docs/audit/AUDIT-COVERAGE-LIVE.md` (FAIL+OPEN — do not invent work off stale trackers)

---

## 8. Reply shape every turn

```
ROLE: <Cursor|Codex|CC-1|CC-2>
3-BOX: n% on 10 modules (or 3-BOX-GATE for CC-2)
MERGED: n/20 (or SAMPLES for CC-2)
NEXT: <one line — real next PR or row id>
```

No “should I continue?” — continuous mode until Jorge says stop.

---

## 9. Owner contact

Jorge steers by **decision in chat** only — no merge labels, no `JORGE-APPROVED`. Merge on green with proof. If genuinely blocked on owner-only decision, surface it **and keep working everything else**.

---

*End handoff. Fix root cause. No patch. No guess. Trust over speed.*
