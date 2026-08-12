# CODER PASTE INSTRUCTIONS — USMCA WIRE-FIRST SPRINT (2026-08-12)

**★ REPLACES ALL PRIOR PASTE BOXES** — `CODER-FULL-INSTRUCTIONS`, split CC-3 blocks, Jorge bus snippets, and any older per-seat paste. **Use only the four boxes below.**

**Four seats: Cursor · Codex · CC-1 · CC-2. No CC-3.**

Copy **one entire fence** below and paste to that seat only. Each box is complete.

Law: `docs/lockdown/WIRE-FIRST-SPRINT-LAW-2026-08-12.md` · `docs/lockdown/USMCA-ENTITY-LAW-2026-08-12.md`

---

## CURSOR

```
USMCA WIRE-FIRST SPRINT — CURSOR — NO IDLE · NO CC-3

SEATS: Cursor · Codex · CC-1 · CC-2 only.

YOU ARE CURSOR: bus · deploy unblock · CI/guards · scoreboard · INBOX/OUTBOX sync · overflow when another seat is stuck >15m. NOT primary FE wiring (Codex) · NOT money (CC-1) · NOT full Live certify (CC-2).

REPO: /private/tmp/IH35-TMS-usmca-golive · read worktree INBOX.md · append OUTBOX-CURSOR.md last line only.

10 PRIORITY MODULES (USMCA 5c854333-6ea5-4faa-af31-67cb272fef80):
lists · accounting · dispatch · settlements · factoring · banking · customers · vendors · drivers · safety

TEST GATE (answered=closed):
Wire ALL 10 until Box 1 Required + Box 2 Audited + Box 3 Built = GREEN on every Required cell (Built ÷ Required = 100%). NO Chrome · NO Box 4 Live · NO PROD-VERIFIED until all 10 pass the 3-box gate. THEN we test.

USMCA FLAGS: TMS posting ON · all QBO_* OFF · no re-ask.

YOUR WORK: merge serial on shared hotfiles · EVEN verify-steps (claim-before-write) · unblock deploy/CI · honest matrix/scoreboard · ratcheting guards when Codex/CC lanes need them · PR title Cursor-

FORBIDDEN: primary Wave A FE wiring (Codex lane) · money PRs · Live certify before gate · invent CC-3 · QBO for USMCA

THROUGHPUT: ≥20 merges OR 3-box gate · blocked → GUARD-WORKORDERS OPEN row → next same turn.

Reply: ROLE: Cursor | 3-BOX: n% on 10 | MERGED: n/20 | NEXT: <one line>
```

---

## CODEX

```
USMCA WIRE-FIRST SPRINT — CODEX — NO IDLE · NO CC-3

SEATS: Cursor · Codex · CC-1 · CC-2 only.

YOU ARE CODEX: primary Wave A+B FE wiring — pickers (+ Add new first row), creators R=W, EntityLink F+R, catalog connectivity, dispatch/customers/vendors/lists surfaces. NOT money (CC-1) · NOT bus/deploy (Cursor) · NOT full Live certify (CC-2).

REPO: /private/tmp/IH35-devin-b · read worktree INBOX.md · append OUTBOX-CODEX.md last line only.

10 PRIORITY MODULES (USMCA 5c854333-6ea5-4faa-af31-67cb272fef80):
lists · accounting · dispatch · settlements · factoring · banking · customers · vendors · drivers · safety

YOUR MODULES NOW (primary): lists · customers · vendors · dispatch (+ Wave A linkage atoms: driver · customer · vendor · unit · trailer · load)

TEST GATE (answered=closed):
Wire ALL 10 until Box 1+2+3 GREEN on every Required cell (Built ÷ Required = 100%). NO Chrome · NO Box 4 Live until 3-box gate on all 10. THEN we test.

USMCA FLAGS: TMS posting ON · all QBO_* OFF · entity-scope USMCA on every read/write · no TRANSP/QBO scope on USMCA work.

YOUR WORK: ship wiring PRs — canonical FKs in submit payload, reverse nav on drawers, list/catalog pages entityScoped, guard per column wave · merge on local gate exit 0 · Wave D chrome LAST (after A–C Built on that module).

FORBIDDEN: GL/migrations/posters · deploy/CI babysit (Cursor) · Live PROD-VERIFIED before gate · invent load FK on historical import · invent CC-3

THROUGHPUT: ≥20 merges OR 3-box gate · OUTBOX shape: Codex | NN OF 50 | Pxx | SHIPPED #N @ sha | Built=… | NEXT=…

Reply: ROLE: Codex | 3-BOX: n% on 10 | MERGED: n/20 | NEXT: <one line>
```

---

## CC-1

```
USMCA WIRE-FIRST SPRINT — CC-1 MONEY — NO IDLE · NO CC-3

SEATS: Cursor · Codex · CC-1 · CC-2 only.

YOU ARE CC-1: money · GL · migrations · Neon apply. One open money PR at a time (serial).

REPO: /private/tmp/IH35-devin-b · read INBOX-CC-1.md · append OUTBOX-CC-1.md last line only.

10 PRIORITY MODULES (USMCA 5c854333-6ea5-4faa-af31-67cb272fef80):
lists · accounting · dispatch · settlements · factoring · banking · customers · vendors · drivers · safety

TEST GATE (answered=closed):
Wire ALL 10 until Box 1+2+3 GREEN (Built ÷ Required = 100%). NO Chrome money test · NO Box 4 Live until gate on all 10. THEN we test.

USMCA FLAGS: all TMS posting ON · all QBO_* OFF · on merge apply db/migrations/202608121800_usmca_posting_on_qbo_off.sql on Neon — no owner hand-apply.

YOUR WORK: Wave C money columns (ap_bill · expense · gl_je · liability) + CLS-LINKAGE-ONEWAY API label sweep on money forms · reuse existing posters — no new GL math · FINDING-first · merge on green.

FORBIDDEN: Live certify before gate · TMS→QBO write-back · QBO flags ON for USMCA · parallel money PRs · FE wiring primary (Codex)

THROUGHPUT: ≥20 merges OR 3-box gate · blocked → board row → next same turn.

Reply: ROLE: CC-1 | 3-BOX: n% on 10 | MERGED: n/20 | NEXT: <one line>
```

---

## CC-2

```
USMCA WIRE-FIRST SPRINT — CC-2 GUARD — NO IDLE · NO CC-3

SEATS: Cursor · Codex · CC-1 · CC-2 only.

YOU ARE CC-2: verify after merge · write OPEN board rows · NO build/fix PRs.

REPO: /Users/jorgemunoz/Documents/GitHub/IH35-TMS-agent2 · read INBOX.md · append OUTBOX-CC-2.md last line only.

10 PRIORITY MODULES (USMCA 5c854333-6ea5-4faa-af31-67cb272fef80):
lists · accounting · dispatch · settlements · factoring · banking · customers · vendors · drivers · safety

TEST GATE (answered=closed):
NO full Chrome / PROD-VERIFIED / Box 4 Live until all 10 are 3-box green. Until gate: post-merge samples only (healthz SHA · Neon counts · USMCA posting ON / QBO OFF).

YOUR WORK: confirm merge landed · spot-check wiring samples · mark VERIFIED only with proof · route defects to Codex (FE) or CC-1 (money) via GUARD-WORKORDERS.md.

FORBIDDEN: full Live certify during wire sprint · block merge for pre-merge browser · build fix PRs · invent CC-3

Reply: ROLE: CC-2 | 3-BOX-GATE: n% on 10 | SAMPLES: n | NEXT: <one line>
```
