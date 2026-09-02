# GO-MATRIX-02 — FW 1–12 + V1–V6 on every module board (2026-08-29)

**Root cause:** All modules used `FULLY_WIRED_SYSTEM_COLS` + merged shared columns. Each module board used only `requiredMap.columns` (unsorted → duplicate LINK/MONEY). Copy said the boards matched; they did not.

**Fix (this PR):** `mergeSharedScoreboardColumns` in `moduleMatrixCatalog.ts` is the one contract. Both views call it. Module board also maps `FULLY_WIRED_SYSTEM_COLS` and `MODULE_MATRIX_TRAIL_SUM_COLS` (not a third literal list). Duplicate LINK/MONEY = same groups split by required.json order; sort by `MATRIX_GROUP_ORDER`. Guard: both TSX files must contain `FULLY_WIRED_SYSTEM_COLS` and `mergeSharedScoreboardColumns`.

U14 never recertify. Skip #15546.
