# GUARD CAPACITY — proof packets + Cascade GUARD-2 (owner 2026-08-29)

Claude measured the queue. Cursor adopts it. **Builders never stamp `prod_verified`.**

## Corrections (do not repeat)

1. **Ancestor, not equality.** `live_verified_sha` is valid iff it is an **ancestor** of live `healthz/shallow` `version`. SYS-S07 stamped `b276443` stays valid on live `14daeed`. Cursor must **not** order a GUARD re-walk solely because healthz moved forward.
2. **Scoreboard glue** rows 50100/50103/50105 — **FIXED** [PR #17571](https://github.com/tioperfumes07/IH35-TMS/pull/17571). Board is 2026-08-29 (2145 rows, FAIL+OPEN 14). Cascade does not re-split those rows.
3. **U14 stamps** stay 14/14 CONCLUDED. This file is leftover Fully-Wired / `prod_verified` capacity, not recertify.

## Segregation of duties (unchanged)

The builder does not certify their own work. Removing that control returns 285 unfalsifiable greens.

Split **expensive walk** from **privileged stamp**:

| Step | Who |
|---|---|
| Walk + query + fill `docs/templates/GUARD-PROOF-PACKET.md` | Builder (CC-1/CC-3/Codex/Devin/Cursor) |
| Spot-check + stamp or reject | GUARD |

## GUARD seats (split today)

| Seat | May flip `prod_verified` on |
|---|---|
| **CC-2** | accounting, banking, settlements, factoring, vendors (money) + leftover `/reports` `/cash-flow` `/finance` `/tasks` `/home` unique FINDING |
| **Cascade GUARD-2** | safety, lists, drivers, system — **only** after a proof packet or Cascade’s own independent walk. Cascade still **does not build product PRs**. |
| **Everyone else** | never flip `prod_verified` |

New stamps **must** include `live_verified_sha` + `live_verified_at`. Paying baseline debt = stamp (or REOPEN false) and **remove** the id from `PROD-VERIFIED-BINDING-BASELINE.json`. Baseline may only shrink.

## Machine recheck (57-class)

`node scripts/ops/classify-prod-verified-evidence.mjs --write`  
`node scripts/ops/recheck-prod-verified-http.mjs`

HTTP 401/403 = mounted, not proven. Neon still needs GUARD/builder packet.

**404 disposition (Cursor 2026-08-29, live `14daeed`):** 9 HTTP-cited greens were **REOPENED FAIL**. Classifier after that: unbound **265** · neon 17 · http 35 · browser 20 · **prose 193**.

**OWNER 2026-08-29:** mass-REOPEN the **193 prose** greens. They are **UNVERIFIED** + `prod_verified: false`. Baseline shrunk. New unbound `prod_verified` with prose-only evidence **fails** `verify-module-completion`. Neon/HTTP/browser unbound still exist — GUARD packets those; do not treat them as certified. U14 stays 14/14 CONCLUDED.

## `background_jobs.stale`

Still the only failing `healthz` check. Separate Cursor infra hop — not a GUARD stamp.

Paste for Cascade: `docs/lockdown/PASTE-CASCADE-GUARD-2-NON-MONEY-2026-08-29.md`
