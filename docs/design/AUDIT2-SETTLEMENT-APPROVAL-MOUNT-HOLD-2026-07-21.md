# [HOLD-FOR-JORGE] audit2 — settlement approval workflow mount

**Block:** `audit2-internal-controls-approval-workflow`  
**Base:** `origin/main` @ `e2db37a74`  
**Verdict:** DESIGN HOLD (do not mount as-is)

## What exists

- `apps/backend/src/settlements/approval.routes.ts` exports `registerSettlementApprovalRoutes`
- Handlers: approval-summary, line-items, approve-line, reject-line, approve, finalize, trip-link-queue, generate-pdf
- **Not** imported/awaited in `apps/backend/src/index.ts` (Owner Approval Portal + detention approval **are** mounted; settlement D1 approval is not)

## Why HOLD (not a drive-by mount)

1. **Financial / money-adjacent** — approve / finalize / PDF gates settlement lifecycle. Financial cluster → owner `JORGE-APPROVED` before merge.
2. **G1-3 membership debt still open** — most handlers still take `operating_company_id` raw from the query string with `withCurrentUser` only. Line-items path already uses `resolveOperatingCompanyId`; others do not match bills.routes G1-2 pattern. Mounting without membership assertion = IDOR risk.
3. **No invent** — do not invent a parallel “unified approval” product. Wire the existing D1 routes correctly after security pass.

## Recommended future block (owner-named)

1. Route every handler through `withCompanyScope` / `assertCompanyMembership` (close `0091-g1-3` / `0243-g1-3`).
2. Mount `registerSettlementApprovalRoutes` in `index.ts`.
3. Add FE callers only if product still wants the D1 surface (confirm vs Owner Approval Portal overlap).
4. Guard: verify-step that index mounts the registrar **and** every handler uses membership resolution.

## Out of scope / bans

- No Neon-apply, no PUBLIC grant changes, no CoA role seeds, no new GL math.
- Do not merge this design PR as a silent greenlight to mount.

## Evidence

```
rg registerSettlementApprovalRoutes apps/backend/src/index.ts  → no hits
rg registerOwnerApprovalPortalRoutes apps/backend/src/index.ts → mounted
```
