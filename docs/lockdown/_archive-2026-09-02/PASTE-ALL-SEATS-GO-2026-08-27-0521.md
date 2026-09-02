# GO-0521 — 2h LAUNCH DRAIN · API DEPLOY IN FLIGHT · 2026-08-27 05:21 CT

**THIS IS NOW.** GO-2158 / GO-2136 / GO-1405 are **VOID as NOW**. Do **not** recertify U14. Skip #15546. **Nobody except Cursor `trigger_deploy`.** One in-flight — **do not second-kick.**

**Live until this deploy lands:** `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` was **`13604db`**.  
**Deploy in flight:** Render `dep-da810bgae00c73ade7gg` · tip **`168257680f`** (`FLEET-F6850`) · **131 commits** behind that were undeployed. When `healthz.version` = `168257680f` (or descendant), **hard-reload** and walk **that** SHA.

ACK OUTBOX first line this turn:

`SEAT | ACK | GO-0521 | PORT=n | NOW=<id> | SHA=<healthz> | GO`

---

## CURRENT-LAW (do not deviate)

- USMCA only · no TRANSP/TRK · **no TMS→QBO write-back**
- **U14 14/14 CERTIFIED — never restamp / recertify / reopen hops for those 14**
- Leftover POST **1–16** (`docs/lockdown/POST-URGENT-14-MODULE-SEQUENCE-2026-08-23.md`) = **unique FINDING only** (500 / dead click / silent no-op / fake $0). They are **not** a second CERTIFIED wave.
- **Launch** = Fully-Wired **1–12** + Live Chrome on **current** healthz + **zero unique OPEN**. Scoreboard / leftover-CERTIFIED stamp / CI-green ≠ launch. Say **Live=BLOCKED** until that bar.
- CREATE-TEST-THEN-VOID · empty TMS expected
- FAST-MERGE ~4 min · never `gh pr checks --watch` · merge `gh api PUT .../merge` squash
- Findings → `docs/audit/GUARD-WORKORDERS.md` same turn · never through Jorge

**Owner asked “urgent 16 closed in 2 hours.” Honest execution:** do **not** recertify U14. Drain **unique OPEN leftovers** on leftover-16 URLs **and** exclusive U14 surfaces. Do not idle.

---

## Exclusive URLs (do not steal)

| Seat | Port | URLs | NOW |
|------|------|------|-----|
| **CC-1** | 9223 | `/accounting` `/banking` `/settlements` `/factoring` | Serial money: **`PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` (`57cabbab`)** if still OPEN on main → escrow residual → DEADHEAD → `VENDOR-OPEN-BALANCE-INCLUDES-DRAFT-BILLS` → named money class (UTC as-of, hide-flag fail-open, mutable-scope). Prove USMCA flags. **Never `trigger_deploy`. STOP `/425c` loop.** |
| **CC-2** | 9224 | `/cash-flow` `/reports` `/finance` `/tasks` | Unique hunt. `CUSTOMER-PROFITABILITY-LABEL-LOST-FOR-DEACTIVATED-CUSTOMERS` is **OPEN** — CC-1 if lucia join is money/RLS; else verify live on new SHA. Never GL. Do not remake #16459/#16473 if already on main. |
| **CC-3** | 9225 | `/lists` `/legal` `/compliance` `/program` `/system` + mdata API | **Do not remake** vendor Reactivate (#16469 / POST `/reactivate`). NOW=**`/compliance` unique** then lists/legal nested `+ Add new` = Lists. |
| **Codex** | 9226 | `/drivers` `/fleet` `/safety` `/fuel` `/maintenance` `/insurance` | Next unique 500/dead/silent. Do not remake F6850 this hop. Never restamp U14. |
| **Cascade** | audit | `/dispatch` `/driver-hub` | Unique FINDING only. Re-walk **new** healthz. No `/vendors`. No product PRs. |
| **Devin** | audit | **`/vendors` only** | Hard-reload when healthz leaves `13604db`. Click **Reactivate** TEST `63a9a2d1-caaf-4e2d-a923-318619213064` (void at launch). SAFER verify. `git fetch && git reset --hard origin/main` — **no 18-commit rebase**. Not PARKED. |
| **Devin-A** | — | VOID as second seat | Follow INBOX-DEVIN. Do not ACK this file as a second walker. |
| **Cursor** | 9222 | Lead + overflow `/home` `/help` `/users` `/docs` `/inventory` | Census · FAST-MERGE · **no second deploy until `dep-da810bgae00c73ade7gg` is live + healthz JSON 200**. Overflow: customer Reactivate sibling (same RLS 404 class). |

---

## Do not remake (already on main / live)

- MDATA deactivate 500 #16433
- Vendor Reactivate lucia + POST `/reactivate` #16469 (in `13604db` **and** this deploy)
- Skip #15546

---

## 2-hour drain (WIP≤3 · Rule 27 serial-by-area)

1. **Hard-reload** when healthz = `168257680f` (or descendant).
2. Each seat: unique 500 / dead / silent on **your URLs only** → board OPEN + one FAST-MERGE PR.
3. CC-1 does not fan out 15 money PRs — **one** money PR at a time.
4. Auditors file unique FINDING — they do **not** stamp CERTIFIED.
5. Cursor deploys next only on **5–10 min AND 5–10 PRs** after this deploy is **live**.

Idle = defect. Jorge is not the messenger.
