# SEQUENCE — CERTIFIED Neon (Accounting · Dispatch · Settlements)

**Owner order 2026-08-09:** checklist 100% PASS (no HOLD) + every item `prod_verified: true` via Neon/live.  
**Seats:** Cursor · Cascade · Devin · Codex. **CC-1 offline until Thu** (new GL math only — density prove does not wait).

Mirror on Desktop bus: `~/Desktop/IH35-CURSOR-AUDIT/USMCA-WEEKEND-LEAD-2026-08-07/SEQUENCE-CERTIFIED-NEON.md`

---

## 0. Strict anti-clash rules (HARD)

| Rule | Law |
|------|-----|
| **R1 ONE MODULE FILE PER SEAT** | Only **one seat** edits `docs/module-completion/<module>.json` at a time. |
| **R2 SERIAL SCOREBOARD PR** | Max **one open PR** that touches any `docs/module-completion/*.json` or `wave-queue.json` at a time. Next seat waits for merge. |
| **R3 NO CLAIMED THRASH** | Do not edit `CLAIMED-NUMBERS.json` unless a new verify-step is required; prefer evidence-only JSON updates. |
| **R4 NO HOTFILE COLLISION** | Forbidden same-turn edits to: `wave-queue.json`, `AUDIT-COVERAGE-LIVE.md`, `GUARD-WORKORDERS.md` by two seats. Cursor lead owns wave-queue edits. |
| **R5 DISJOINT APPS/** | If a code fix is required: one seat per area (`accounting` / `dispatch` / `settlements` FE). Announce path in OUTBOX before branch. |
| **R6 PROOF BEFORE FLAG** | `prod_verified: true` **only** after Neon result (and click if VERIFY-2/3/4) pasted in that item’s `evidence` with date. No flip from memory. |
| **R7 NO HOLD** | Do not use `HOLD`. Prove → `PASS` or leave `OPEN`/`UNVERIFIED`. |
| **R8 NEVER IDLE** | Finished your slice → OUTBOX one line → take next ID from your INBOX queue (or assist listed backup). Do not invent parallel modules. |
| **R9 BRANCH SHAPE** | Fresh from `origin/main`. Title `Cursor- …` if `cursor/` branch. FINDING-first body. One commit. |
| **R10 WAVE LOCKS** | `complete: true` illegal while an OPEN wave lists the module. Cursor lead closes/re-scopes wave cards **after** proof — other seats do not edit `wave-queue.json`. |

### File ownership (exclusive write)

| File | Owner seat | Others |
|------|------------|--------|
| `docs/module-completion/accounting.json` + `.md` | **Cursor** (batch) then Codex assist only via patch file to Cursor | Devin/Cascade: evidence to OUTBOX only |
| `docs/module-completion/dispatch.json` + `.md` | **Devin** | OUTBOX evidence OK |
| `docs/module-completion/settlements.json` + `.md` | **Codex** | Cascade clicks → OUTBOX; Codex writes JSON |
| `docs/module-completion/safety.json` (HOLD removal) | **Cursor** after Cascade proves | — |
| `docs/audit/wave-queue.json` | **Cursor lead only** | — |

### PR merge order (serialize)

1. Accounting CERTIFIED PR (Cursor)  
2. Dispatch CERTIFIED PR (Devin) — rebase after #1  
3. Settlements CERTIFIED PR (Codex) — rebase after #2  
4. Wave-queue unlock PR (Cursor) — only after module proofs  

---

## 1. What CERTIFIED means

- Every item `status: PASS`  
- Every item `prod_verified: true`  
- `complete: true`  
- Zero `HOLD`  
- Scoreboard `.md` regenerated  
- No OPEN wave listing that module (or wave honestly re-scoped)

---

## 2. Seat DO NOW queues

### Cursor (lead) — Accounting + waves + bus

Worktree: `/private/tmp/IH35-TMS-usmca-golive`

1. Write/maintain this SEQUENCE + bus INBOXes.  
2. Neon-prove accounting items with `prod_verified:false` (batch).  
3. PR#1: accounting.json + accounting.md only.  
4. After Devin/Codex proofs land: wave-queue unlock for DISP-WIRE-06 / MONEY-HOLD as evidenced.  
5. Confirm deploy has #5367; do not ask Jorge for data.

**Backup if idle:** help Codex SETL evidence SQL (paste to OUTBOX, do not edit settlements.json).

### Cascade — clicks only (no module JSON)

Worktree: `/private/tmp/IH35-cascade`

1. `SETL-VERIFY-01` live click USMCA: list → detail → Finalize → Mark Paid Manually on **S-20260808-0085** when healthz includes `49ff971e`.  
2. Safety HOLD removal proof: SAF-B08 / SAF-ORPH-05 click or OPEN blocker.  
3. OUTBOX only: `PROD-VERIFIED | settlements | SETL-VERIFY-01 | …`  
4. **Never** edit `docs/module-completion/*.json`.

### Devin — Dispatch JSON exclusive

Worktree: `/private/tmp/IH35-devin-a`

1. List dispatch items with `prod_verified:false` (expect 3).  
2. Neon + route prove each; update **only** `dispatch.json` / `.md` after Cursor accounting PR merged (or wait if accounting PR open).  
3. OUTBOX evidence for `CLS-DISP-WIRE-06` going-forward path (Cursor closes wave).  
4. No settlements/accounting JSON.

### Codex — Settlements JSON exclusive

Worktree: `/private/tmp/IH35-devin-b`

1. Wait for Cascade `SETL-VERIFY-01` OUTBOX PASS (or co-prove API).  
2. Close SETL-VERIFY-01 → PASS + `prod_verified:true`; flip remaining settlements `prod_verified`.  
3. Set `complete:true` only after Cursor clears `CLS-MONEY-HOLD` module lock **or** wave re-scoped.  
4. PR after Devin dispatch PR merges.  
5. No dispatch/accounting JSON.

---

## 3. Neon discipline

- Project: IH35-TMS / prod branch `br-fancy-credit-akjnd07a`.  
- FORCED-RLS: use transaction `set_config('app.bypass_rls','lucia',true)` + completeness discriminator (Rule 10).  
- Prefer USMCA `operating_company_id` scope for app-visibility claims.  
- Paste counts into `evidence` with date `2026-08-09` (or current).

---

## 4. Idle = defect

If your queue is empty: take **Backup** row in §2, or ask Cursor lead OUTBOX for next ID.  
Forbidden end state: “waiting” with no OUTBOX line for >10 minutes while eligible IDs remain.
