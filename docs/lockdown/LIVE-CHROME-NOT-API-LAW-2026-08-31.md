# LIVE CHROME NOT API — standing law (owner 2026-08-31)

**Applies to every seat, every REV-E / POST-U14 finding, forever until superseded.**

## The rule

**Product proof = Live Chrome on `app.ih35dispatch.com` (USMCA opco unless scoped).**

These do **NOT** count as done, wired, verified, or backfilled:

| Does NOT count | Why |
|----------------|-----|
| API PATCH/POST curl | Bypasses human product path; same class as Cascade REV-E API sequence |
| PATCH response JSON body | Field may not project on GET; operator never sees it |
| Neon read-only row (owner bypass) | Proves persistence, not app-path visibility or UI |
| Script backfill (`node scripts/ops/...`) | Mechanical; not operator workflow |
| Route string / grep / CI-green | Code-read tier-2 only |
| "11/12 PATCHed" without Chrome | **VOID** — redo all |

## Required proof shape (OUTBOX + board close)

Every product claim must include **all** in one OUTBOX line (or PR evidence block):

```
SEAT | LIVE-CHROME | <finding-or-load> | healthz=<sha> | url=<full app url> | click=<what you clicked> | reload=PASS|FAIL | GO
```

Optional: screenshot path under Desktop audit pack.

**Lead (Cursor) rejects** any OUTBOX `SHIPPED` / `DONE` / `BACKFILL` line that lacks `LIVE-CHROME` or the full LEAD-CONTRACT triple (healthz + url + click).

## REV-E specific (2026-08-31)

| Item | Chrome path required |
|------|---------------------|
| `live_load_number` backfill | Dispatch → load → **Edit Load** → AlwaysTrack field → Save → **reload** → field visible |
| L-20260830-0014 settlement | **Settlements UI** close trip — not API finalize, not governance self-approval |
| Load status progression | Load detail drawer buttons (**Mark in transit** → **Mark delivered** → **Mark completed**) — not `/transition` API |
| Invoice Send / Factor | Accounting UI buttons — not SQL, not API-only |
| CC-3 inv link | Chrome: open invoice → link load picker → Send → Factor |

**Cascade API session 2026-08-31: VOID. Redo every load in Chrome.**

## CC-2 / CC-3 / Codex

- **CC-3:** Do not link Faro inv 001–013 on Cascade API claims. Wait for `CASCADE | LIVE-CHROME` per load **or** self-verify in Chrome before link.
- **Codex:** Book Load **wizard in Chrome** for 014/13521 — remove PATCH API as primary path from INBOX.
- **CC-2:** Tie-out **scripts** OK for money math; do not upgrade product rows to VERIFIED from Neon alone.

## Enforcement

- `docs/bus/LEAD-CONTRACT.md` §3–§4 (false green / tripwire T3)
- `docs/audit/GUARD-WORKORDERS.md` — append VOID rows; never close on API-only evidence
- Cursor lead: read seven OUTBOXes each turn; flag bullshit same turn

Presence: bus INBOX TOP on every seat references this file.
