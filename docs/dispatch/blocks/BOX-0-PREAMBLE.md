# IH35-TMS — Dispatch Block Standing Orders (BOX 0 PREAMBLE)
Prepend to every dispatch block when dispatching to Cursor.

STANDING ORDERS: foreground only, no subagents; no retries — STOP and paste exact error; live updates every 5 min with CST/Laredo timestamp + real measured data, no guesses; confirm worktree pwd, git status, log, rev-parse; show diff --staged --stat before commit; stop on unexpected.
SO#16 v2: verify→commit→push as ONE step. Gates: build:backend EMIT, frontend tsc -b, verify:arch-design, runtime blocks add full backend vitest, migration blocks self-contained (explicit GRANTs + drift-capture) — CI IS the fresh-DB gate.
RESPOND-BEFORE-CODE (RULE 6): list blueprint sections + PNGs + deviations + NEW SPEC before coding.
ADDITIVE-ONLY: never delete/remove/reorder modules, pages, sidebar, sections, cards, KPIs, fields, columns, tabs, routes. ARCHIVE never DELETE. Sidebar rail = 21 items (SIDEBAR_ITEM_IDS = source of truth). Additive only; never remove/reorder. factoring = rail #9, insurance = rail #7. driver-hub NOT in array yet. "+ Create"/"+ Book" vocabulary. No new financial code — call existing accounting/factoring/settlement service functions only.
UI TOKENS: font -apple-system,system-ui,"Segoe UI",Roboto; base 12px; h1 22/600; headers 11/700 UPPERCASE ls.3 #4B5563; text #0F1219/#1F2A44/#6B7280; surface #fff; page #F7F8FA; border 1px #E5E7EB; radius 4px; ~7px cell padding; rail navy #1B2333 (active rgba(255,255,255,.10), no colored left border); green #16A34A; amber #B45309/#D97706; blue #2563EB; red #DC2626; purple #534AB7; flat pills/dots, no gradients/shadows; currency 4,800.00; sortable every column header (Global Sort Rule #723).
NAV RULE #20: flat left rail (tooltip only, NO side flyout) + top-bar hover-dropdown sub-nav.
TRACKER: never invent IDs — add the tracker row first, then use it in the header. Header format: "AGENT-N · Block N of M — PHASE Dispatch / TASK <new tracker row> — Title".
