# guard-expense-gl-branch.sh — env requirements & run conditions

Prepares an **isolated, throwaway Neon branch** so GUARD can run the remaining runtime checks for #1171
(EXPENSE_GL_POSTING) — checks **(b)** trial-balance moves, **(c)** payment account decreases, **(f)**
void reverses, **(g)** attachment re-keys onto `expense_id`. Checks (h, e, a, d) are already verified
(live + code-read) and do NOT need this.

## ⛔ DO NOT RUN until a sanctioned non-prod env exists
This script + a backend booted against the branch require a **bootable non-prod environment**. The coder
does **not** have one and must **never** source it from the sibling prod `.env` (`IH35-TMS-cleanup2-fresh/.env`).
It runs only on **Jorge's main setup or a GUARD runner** that already has the env below. Until then: STOP.

## Required env on the runner

| Var | Value | Why |
|---|---|---|
| `DATABASE_URL` | a **throwaway Neon branch** conn string (`guard-expense-gl`), never prod | the script asserts the host pre-flight |
| `I_CONFIRM_THIS_IS_A_THROWAWAY_BRANCH` | `yes` | guard against running on prod |
| `ENABLE_QBO_OUTBOX_DISPATCHER` | `false` | (1) QBO outbox dispatcher off — nothing pushes to QuickBooks |
| `QBO_ENV` | `sandbox` | (2) base URL = QBO sandbox, never live |

The script itself also revokes the branch's copied QBO tokens — **(3)** so the push can't authenticate.
All three QBO safeguards must hold; the script prints `active_qbo_connections` which **must be 0**.

## Backend boot env (the script migrates; the backend serves GUARD's HTTP checks)
The backend needs its normal env to boot, pointed at the **same branch** `DATABASE_URL`:
- `REDIS_URL` (outbox/queue), Cloudflare **R2** creds (`ih35-tms-evidence` — for the (g) attachment),
  Lucia/Google **auth** secrets, and **QBO _sandbox_** `QBO_CLIENT_ID`/`QBO_CLIENT_SECRET` (never prod QBO).
- Plus `ENABLE_QBO_OUTBOX_DISPATCHER=false` and `QBO_ENV=sandbox` (above).

## Run order (operator with the env)
```bash
export DATABASE_URL="postgres://…@<guard-branch-host>/neondb?sslmode=require"
export I_CONFIRM_THIS_IS_A_THROWAWAY_BRANCH=yes
export ENABLE_QBO_OUTBOX_DISPATCHER=false QBO_ENV=sandbox
bash scripts/guard-expense-gl-branch.sh        # migrate + revoke QBO + 30-min TRANSP flag override + confirmations
npm run start                                  # serve GUARD; hand over the backend URL
# GUARD: confirm branch host + active_qbo=0 → create one test expense → verify (b)(c)(f)(g) → report 8/8
neonctl branches delete guard-expense-gl --project-id tiny-field-89581227   # discard when done
```

#1171 stays **flag-OFF in prod** until all 8 pass. Only Jorge flips it ON in prod, after 8/8.
