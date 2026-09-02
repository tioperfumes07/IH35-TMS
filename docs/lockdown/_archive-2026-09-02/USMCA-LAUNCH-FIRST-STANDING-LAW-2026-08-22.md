# USMCA LAUNCH FIRST — STANDING LAW (owner 2026-08-22 12:24 CT — PERMANENT)

**Remind every seat, every session.** Trucking, Transportation, and QuickBooks **sync** are **irrelevant** until USMCA is fully complete and launched. Do not spend cycles on IH 35 Trucking, IH 35 Transportation, TRANSP QBO-mirror, QBO recon, or TMS→QBO write-back.

**Answered = closed.** Do not re-ask. Do not “also check TRANSP.”

## 1. USMCA first — then launch — then clean

1. **Only USMCA is operating.** Entity UUID `5c854333-6ea5-4faa-af31-67cb272fef80`. App `https://app.ih35dispatch.com`.
   **Owner 2026-08-30 (exact):** Do not work TRANSP or TRK. Leave posting overrides ON. Sister-entity TESTs prove **MECHANISM only** (routes, chrome, pickers, guards, lifecycle, reversal). **Never** money, RLS, entity isolation, subledger, GL delta, period lock, or Live Chrome 12. Those are USMCA-only. LAW-8 / C30 stand. New hops = USMCA.
2. **Launch** = Fully-Wired items **1–12** on USMCA (`docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md`). McLeod ops + QBO-*chrome*/books trust + NetSuite controls. QBO-looking chrome ≠ QBO sync.
3. **After launch:** void labeled TEST transactions (reversal / WORM, by UUID, never DELETE money rows) and **clean the software**. Until then, TESTs are how the product is proven.

Companions: `docs/lockdown/USMCA-ONLY-UNTIL-LAUNCH-LAW-2026-08-19.md` · `docs/lockdown/OWNER-RULING-USMCA-FIRST-FULL-READY-2026-08-16.md` · `docs/lockdown/CREATE-TEST-THEN-VOID-LAW-2026-08-22.md`.

## 2. Banking TEST hops are allowed and required to prove the ledger

Do **not** treat Banking as “don’t touch For-review / don’t create.” On USMCA you **create labeled TEST expenses**, **match** them to bank lines, **reconcile**, and **test the ledger**. Memo **TEST DATA**. Same CREATE-TEST-THEN-VOID as Accounting: prove the hop live; **void after launch**.

Forbidden: reporting “cannot reconcile / cannot test ledger / no expenses” without creating the TEST hop the same turn.

No TMS→QBO write-back. Match/reconcile stays in the TMS.

## 3. Urgent 14 — exclusive module (not a shared queue)

**Canonical:** `docs/lockdown/URGENT-14-EXCLUSIVE-MODULE-CERTIFY-LAW-2026-08-22.md`

Order: accounting → banking → settlements → factoring → dispatch → vendors → customers → drivers → fleet → lists → maintenance → safety → insurance → legal.

Each seat owns **one current module** from that law’s table. Empty unique-FINDING → next row on **your** list. **Do not** idle, HOLD, invent a 15th plan, or enter another seat’s URL prefix. Jorge is not the messenger.

## 4. FAST-MERGE 4 minutes · deploy 5–10 minutes

- **FAST-MERGE stays ON** (`docs/bus/FAST-MERGE-4MIN-LAW.md`): gate 0 → push → PR → squash `--admin` → Neon if money → OUTBOX → next URL **same turn**. ~**4–5 minutes**. Never babysit CI. Never ask Jorge to merge.
- **Production deploy is not in that loop.** Never `trigger_deploy` after each merge (that 502s the API for the whole deploy).
- **Cursor lead** kicks **one** API deploy every **5–10 minutes** wall clock, **and** every **5–10 merged PRs** (default 5, **never wait past 10** undeployed PRs) — **whichever fires first**. One in-flight. Wait until **live** + `healthz/shallow` JSON 200. CC seats never deploy.

Canonical deploy file: `docs/lockdown/NO-PER-MERGE-PROD-DEPLOY-LAW-2026-08-21.md`.

## Enforcement

`.cursor/rules/44-usmca-launch-first-standing.mdc` (alwaysApply) · standing session directive · seat INBOX / PASTE / URGENT-BLOCKS-NOW.
