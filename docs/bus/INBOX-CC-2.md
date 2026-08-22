# INBOX-CC-2 · 9224 · REJECT IDLE · FACTORING IS NOT DRY

`git pull --ff-only origin main`. **This file is your only order.** Chat status is not an excuse to skip it.

## REJECT (owner 2026-08-21 23:57 CT)

Your last cycle claimed: no new commits, INBOX unchanged, healthz still `0cec933`, 0 non-disbursed cash advances, settlements 7/8, **factoring fully dry**, remaining items blocked on deploy, **no OUTBOX because nothing moved**.

That is **idle**. It is **forbidden**.

**Live-verified same hour (Cursor, USMCA, `app.ih35dispatch.com`, healthz `0cec933` HTTP 200):**

- `/factoring` Recourse Pipeline is **not empty**. Row: **INV-2026-00038** · **TC Freight LLC** · Advance **$1,794.50** · Reserve **$55.50** · Recourse expiry **11/24/2026** · 94 days left.
- Neon (bypass in-txn, opco `5c854333-6ea5-4faa-af31-67cb272fef80`): `accounting.factoring_advances` **FAC-2026-00001** status `advanced`, `invoice_total_cents=185000`, `advance_amount_cents=179450`, `reserve_amount_cents=5550`. Matches the UI.

Do **not** wait for healthz to leave `0cec933`. Do **not** wait for Accounting CERTIFIED. Do **not** wait for CC-1 view SQL. Do **not** skip OUTBOX.

`settlements.modal.mark_disbursed` with 0 non-disbursed advances = **OUTBOX UNCHANGED blocker=no-non-disbursed-cash-advance** then **same turn** factoring Live. That is not a stop.

## FORBIDDEN

- Idle / healthz-watch / “nothing changed so no OUTBOX”
- legal / fuel / compliance / insurance / reports / cash-flow / tasks
- customers / drivers / fleet / lists (CC-3)
- `trigger_deploy`
- Claiming factoring dry while INV-2026-00038 is on the Recourse Pipeline

## NOW (click on CURRENT SHA)

1. **Factoring Live** USMCA `/factoring` → Recourse Pipeline → **INV-2026-00038 / TC Freight LLC**. Stamp reverse_link / picker_law leaves that are still unpaid **on this SHA**. If a money column is $0 on a **different** surface than this row, file a **unique FINDING** to CC-1 — do not reuse ACCT-F5743; do not sit.
2. Then remaining unpaid factoring reverse/picker leaves in `factoring.required.json` that you can click **today**. 0-row: `UNCHANGED blocker=<leaf:col>` then **next leaf same turn**.
3. If factoring unpaid Live cells are honestly gone: **dispatch** then **vendors** Live reverse/picker (Urgent 6). Not WAVE2.

Every cycle: prepend OUTBOX first line with a **click** or **UNCHANGED+NEXT leaf**. Silent loops are a process defect.

## PASTE BOX

```text
===== CC-2 · PORT 9224 · REJECT IDLE · FACTORING LIVE NOW =====
PULL: git pull --ff-only origin main
FILE: docs/bus/INBOX-CC-2.md
FORBIDDEN: idle on healthz 0cec933 · skip OUTBOX · claim factoring dry · WAVE2 · trigger_deploy · wait Accounting CERTIFIED

NOW: /factoring Recourse Pipeline INV-2026-00038 TC Freight LLC Live reverse/picker
THEN: remaining unpaid factoring leaves same SHA · then dispatch · then vendors
ACK: CC-2 | ACK | INBOX-CC-2 | PORT=9224 | NOW=/factoring INV-2026-00038 Live | GO
===== END CC-2 =====
```
