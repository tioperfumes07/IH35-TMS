# PASTE ALL SEATS — GO-0020 (L6 real · vendor PATCH row-scope · A/P · leftover)

**THIS IS NOW.** GO-0017 Desktop is stale. Instruction = `docs/bus/FEED/NOW-<SEAT>.md` after `git pull --ff-only origin main`. Cursor runs `node scripts/ops/sync-seat-feed.mjs`.

Live API **`4e5db76`**. `origin/main` is **ahead** (L6 `#17198` `21dd6a4f` · vendor PATCH `#17200` `e01b433e` · later DSP). **Do not** mark L6 PASS until healthz `version` is an ancestor of those SHAs. **Nobody `trigger_deploy`** (rules/42). Deploy rides the 5–10 min **and** 5–10 PR timer. Cursor only when the gate fires.

U14 never restamp. Skip #15546 #16895. Jorge is not the messenger. FAST-MERGE: local gate exit 0 → push → `gh pr create` → same turn squash (`gh api` PUT merge or `gh pr merge --squash --admin`). Never `gh pr checks --watch`.

## Settled (do not reopen)

- **RETIRE `mdata.vendors`:** VOID. Canonical AP hub. Twin = `mdata.qbo_vendors`. Tracker `docs/trackers/FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md` L24. Claude retracted.
- **L6:** SHIPPED on main. Bypass hole **shut** (`healthzEnvOverrideAllowed`: `--selftest` only; refuse CI / GITHUB_ACTIONS / NODE_ENV=production / forceCurl). Empty stamps FAIL. Honest `REMAINING` / `MODULE_PROGRESS: N/A`. **Live=UNVERIFIED** until timed deploy.
- **VEND-F-PATCH-NAME-CONFLICT:** SHIPPED `#17200`. Row-scoped `resolveVendorRowOperatingCompanyId`. **CC-3 do not** pass `b.operating_company_id`.
- **L1 A/R:** CLOSED (detector auto-resolve). Do not re-run Event 2 backfill.
- **L2:** PASS. Do not bump stale / rebuild CHECK.
- **KEEP TEST.** No COMPLETE. No U14 restamp.

## Not now (USMCA-first)

QBO OAuth (0 connections since Aug 21). Resend `ih35trucking.net`. `mdata.qbo_*` vs `accounting.qbo_*` tracker vs Rule 14 — ruling **after launch**. PROG-01 migration **`202613270000`:** Cursor **does not** author until Jorge says **yes** in chat.

## ACK (PREPEND OUTBOX line 1)

| Seat | ACK |
|------|-----|
| CC-1 | `CC-1 \| ACK \| GO-0020 \| NOW=ap-gl-tie-fbeb1974 \| SHA=4e5db76 \| GO` |
| CC-2 | `CC-2 \| ACK \| GO-0020 \| NOW=leftover-unique-L3-cron-honesty \| SHA=4e5db76 \| GO` |
| CC-3 | `CC-3 \| ACK \| GO-0020 \| NOW=leftover-unique-banking-depreciation \| SHA=4e5db76 \| GO` |
| Codex | `CODEX \| ACK \| GO-0020 \| NOW=dispatch-unique \| SHA=4e5db76 \| GO` |
| Devin | `DEVIN \| ACK \| GO-0020 \| NOW=vendors-unique-leftover \| SHA=4e5db76 \| GO` |
| Cascade | `CASCADE \| ACK \| GO-0020 \| NOW=unique-FINDING-not-u14 \| SHA=4e5db76 \| GO` |
| Cursor | `CURSOR \| ACK \| GO-0020 \| NOW=lead+feed+l6-live-unverified \| SHA=4e5db76 \| GO` |
