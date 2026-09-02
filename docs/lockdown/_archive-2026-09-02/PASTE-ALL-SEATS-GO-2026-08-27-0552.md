# GO-0552 — WORK NOW · DEPLOY IN FLIGHT · U14 FIRST THEN LEFTOVER · 2026-08-27 05:52 CT

**THIS IS NOW.** Idle = defect. **Do not wait for deploy.** Walk **current** live SHA until healthz moves, then hard-reload.

**LIVE now:** `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → **`e591ccb`** until land.  
**DEPLOY (Cursor only):** `dep-da81eaad0e5s73a261hg` tip **`78240b9`** (`DISPATCH-DRIVER-LABEL-LOST REGRESSED` + later main). **Nobody else `trigger_deploy`.** Skip #15546.

**Sequence (owner):** **Urgent 14 first**, then leftover POST. Not U14-only. ELD is **inside Compliance** (HOS/ELD tabs) — not a separate leftover campaign.

ACK: `SEAT | ACK | GO-0552 | PORT=n | NOW=<id> | SHA=<healthz> | GO`

---

## Do not wait

Code, grep-verify, FAST-MERGE on `origin/main`. Live Chrome / Reactivate re-click **after** healthz is **`78240b9`** (or descendant). Until then, unique FINDING vs **`e591ccb`**.

---

## Phase 1 — Urgent 14 first (your exclusive URL)

Unique 500 / dead click / silent no-op / books-lie. CREATE-TEST-THEN-VOID. Do not remake proven TESTs / Close / Book Load. Do not restamp frozen U14 SHA cells.

| Seat | NOW (U14 first) | Then if unique empty |
|------|-----------------|----------------------|
| **CC-1** | `/accounting` leftover money (hop.assign 0 rate-card bills). `57cabbab` DONE #16280 — do not remake. Never `trigger_deploy`. | `/factoring` unique · then `/banking` money leftover if Cursor files it |
| **CC-2** | `/settlements` `/driver-finance` `/cash-advances` unique. Never GL. | leftover POST `/cash-flow` `/reports` `/finance` `/tasks` |
| **CC-3** | `/lists` unique. Do not remake vendor Reactivate. | `/legal` then leftover `/compliance` (**ELD/HOS lives here**) |
| **Codex** | `/drivers` `/fleet` unique. Never restamp U14. | `/safety` `/maintenance` `/insurance` `/fuel` · HOS unbounded if still true |
| **Cascade** | `/dispatch` unique (status-filter 400 / commodity PATCH 500 / driver-label on **`78240b9`**) | `/driver-hub` leftover unique |
| **Devin** | `/vendors` only. Reactivate TEST `63a9a2d1`. Hard-reload **`78240b9`**. `git fetch && git reset --hard origin/main` | stay `/vendors` |
| **Cursor** | Lead + `/banking` TEST expense → Match → recon Accept. Overflow `/customers` if Devin stays vendors. | leftover `/home` `/help` `/users` `/docs` `/inventory` |

---

## Phase 2 — leftover POST (after your U14 unique is empty)

`cash-flow` · `finance` · `driver-hub` · `reports` · `tasks` · **`compliance` (includes ELD)** · `inventory` · `users` · `home` · `fuel` · `docs` · `help` · `program` · `system`. `/425c` = **do not loop**.

---

Waiting for Jorge or waiting for healthz before writing the next unique PR = defect.
