# THREE METERS — NO CONTRADICTION (owner 2026-08-27 11:51 CT)

**Why this file exists:** mixing three different facts in one sentence produced “it’s CERTIFIED / fully wired” and “it’s not launch-ready” in the same breath. Those are **three meters**. They are not synonyms.

**Do not restamp U14.** Do not add Program scoreboard columns. This is the owner-requested measurement.

Live SHA: `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version`.

---

## THE THREE METERS (read this first)

| Meter | Meaning | Equals subscription launch-ready? |
|------:|---------|-----------------------------------|
| **1. U14 CAMPAIGN** | Exclusive 14-module click campaign, frozen stamps on **old** SHAs (`c11bdab`, `36e51bb`, …). Law: never recertify. | **No.** History only. |
| **2. CODE ON MAIN** | Named FINDING has a merged PR + guard on `origin/main`. | **No** until it is also on **this** live SHA and Live Chrome. |
| **3. SUBSCRIPTION-READY** | On **current** live SHA: Fully-Wired 1–12 **including Live Chrome**, unique **500 / dead / silent / reverse-empty** = **0 named OPEN** after grep main, TMS posting **ON**, QBO **OFF**. | **Yes — only this meter.** |

If meter 1 is CERTIFIED and meter 3 is not: that is **not** a contradiction. It means the campaign finished on an old SHA and leftover unique work (or an unwalked current SHA) remains.

If a row says **Shipped #NNNN**: that ID is **DONE**. It is **not** a missing item.

---

## FLAGS + TEST DATA (owner 2026-08-27 — apply; do not re-ask)

Locked already in `docs/lockdown/00_LOCKED_DECISIONS.md` §9.9 and `docs/lockdown/USMCA-ENTITY-LAW-2026-08-12.md`:

- **Every TMS posting flag ON** (USMCA and the three-entity set already flipped).
- **Every QuickBooks flag OFF** (no write-back, no USMCA QBO).

Stale leftover-law line “posting flags OFF until Jorge says turn on” is **void** for this measurement. Flags are not the gap.

**TEST DATA:** create labeled TEST hops. **Do not void now.** Owner voids at launch so the books start at 0. Data is useful until then.

---

## HOW TO READ A MODULE ROW

```
NAMED OPEN = N   ← count of unique leftover IDs still true on origin/main after grep
SHIPPED     = IDs that are DONE (do not remake)
WALK        = Live Chrome still owed on CURRENT healthz (item 12), even if N=0
METER 3     = YES only if N=0 AND walk done on this SHA AND posting ON / QBO OFF
```

`N=0` + “walk owed” means: **no named bug list**, but **item 12 is not proven on this SHA**. That is incomplete for meter 3. It is **not** “F6797 is still missing.”

---

## ACCOUNTING (`/accounting`) — read this as Jorge asked

| Fact | Value |
|------|--------|
| Meter 1 U14 | CERTIFIED `@c11bdab` — frozen. Not today’s SHA. |
| Meter 2 shipped (DONE, **not missing**) | **F6797** WO line void-not-delete **#16683** · **F9508** commodity/weight **#16693** (dispatch Book Load, money persist) · **F6437** escrow/fine retry **#16712** · cron **#16709** verified **not** a money miss · **F6508** keyed remount · **F9408** cash-forecast ETA bucket · cash-entries customer CHECK **#16295** |
| Named OPEN leftover count on remainder file | **0** named accounting IDs still listed as unfixed (U14-01-F03 Claim/WO columns **LIVE CLOSED**) |
| What is still owed for meter 3 | **Live Chrome on current SHA `858d689`**: create labeled TEST bill/expense/invoice (do not void); prove save→reload→reverse→JE when posting ON. Hunt unique **500/dead/silent** only. Board `OPEN` without grep is often stale. |
| Meter 3 today | **NO** until that walk is recorded on **`858d689`**. Not because F6797 is missing. |

---

## BANKING (`/banking`) — named leftover count

| Fact | Value |
|------|--------|
| Meter 1 U14 | CERTIFIED `@36e51bb` — frozen. |
| Meter 2 shipped (DONE) | **BANK-F5987** phantom `mask` → `account_mask` **#14594** (grep-closed). Do not remake. |
| Named OPEN leftover count | **0** on `LAUNCH-READY-UNIQUE-REMAINDER` (the BANK-F5987 row is closed). |
| What “unique leftover only” meant | **Not** a hidden pile. It meant: if a **new** 500/dead/silent appears, file it. **Count of named banking leftovers = 0.** |
| What is still owed for meter 3 | **Live Chrome on `858d689`**: TEST expense → match → recon Accept → ledger. **Do not void.** |
| Meter 3 today | **NO** until that hop is clicked on **this** SHA. Not because BANK-F5987 is open. |

---

## OTHER U14 MODULES (same grammar; remainder file 2026-08-24 + 2026-08-27 grep)

Do not treat “unique FINDING only” as a count. Count = named IDs still true on main.

| Module | Named OPEN on remainder (after grep) | Meter 3 |
|--------|--------------------------------------|---------|
| settlements | **0** named | Walk current SHA (deduction-trail #16654 is **shipped**; re-prove UI) |
| factoring | **0** named (FACT-F5986 grep-closed) | Walk current SHA |
| dispatch | **0** named of the old F02/late-arrivals cards | Walk current SHA (labels + Retry + commodity **shipped**) |
| vendors | **0** named F02/F03 | Re-prove Reactivate on **this** SHA (last Devin walk was `15857b1`) |
| customers | **F6312 STALE** — already **#15471** / **#16723**. Named OPEN = **0** | Walk statements/recurring/late-fees on this SHA |
| drivers / fleet / lists / legal | remainder: **0** named | Walk + unique hunt |
| maintenance / safety / insurance | remainder closed those U14 F-cards; Codex silent-cap class is **new unique** (count those IDs separately, do not restamp U14) | Live Chrome the shipped verticals on this SHA |

Leftover POST 16 (cash-flow, reports, …): **same three meters.** Old stamp `@97d6a14` is meter 1-equivalent leftover-POST, **not** meter 3.

---

## FORBIDDEN SENTENCES

- “Accounting still needs F6797” — **false.** F6797 is shipped.
- “Banking unique leftover” with no count — **false.** Named count is **0**.
- “U14 CERTIFIED = subscription-ready” — **false.** Meter 1 ≠ meter 3.
- “Fully wired because the campaign stamped” — **false** unless meter 3 is YES on **current** healthz.

ACK: `SEAT | ACK | THREE-METERS | PORT=n | NOW=<module-walk-or-named-id> | GO`
