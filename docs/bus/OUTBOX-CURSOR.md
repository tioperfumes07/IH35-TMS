# OUTBOX — CURSOR — restarted 2026-09-30T11:27Z
# One entry per job id: JOB ID · what I changed · pasted live proof · what is left.
# Append below. Do not delete another seat's entries.

**2026-09-30T12:35Z · C-18 + D47..D54 MERGED · PR #23385 · `cf2b264d8f`**

**2026-09-30T12:50Z · C-01 + C-02 + C-03 + C-16 + C-17 SHARED SHELL · branch `cursor/c01-c17-master-detail-shell-c89b`**

C-01 · what changed: house `SegmentedControl` — h-7, min-w-[4.5rem], inactive tint `#F3F4F6` (never transparent); Customers/Vendors/Drivers view+status toggles use it; `ToolbarSegmentControl` is an alias. · LIVE PROOF: `node scripts/verify-c01-c17-master-detail-shell.mjs --selftest` → PASS. · LEFT: Chrome getComputedStyle height/padding/width of every pill on /customers.

C-02 · what changed: `useViewModePref` seeds `master-detail` from code; localStorage only restores after explicit `:chosen` click (or server pref). · LIVE PROOF: vitest C-02 cases + guard asserts `() => defaultMode` + `:chosen`. · LEFT: clear key, reload, paste active pill.

C-03 · what changed: master/detail panes use `MASTER_DETAIL.surfaceClass` (= C-18 QBO_SURFACE pane: border `#E5E7EB` + shadow). · LIVE PROOF: guard asserts surfaceClass on Customer/Vendor/Driver sidebars. · LEFT: Chrome pane border/box-shadow.

C-16 · what changed: `design/master-detail.ts` `masterPaneClass` `xl:w-[640px]` (was 440 / 20.8%); min 480 · max 760; Customers+Vendors+Drivers share it. · LIVE PROOF: `verify-md-width-0-vendors-customers.mjs --selftest` PASS 4/4; shell guard asserts 640. · LEFT: Chrome widths at 1280/1920.

C-17 · what changed: `MasterDetailShell` + `DriverListSidebar` on Drivers Profiles; same tokens + SegmentedControl + view pref as Customers/Vendors. · LIVE PROOF: Drivers.tsx mounts `drivers-master-detail-shell`; guard. · LEFT: three pages side-by-side Chrome.

C-04..C-15 / C-19 · LEFT: next (row treatment sweep, min-scroll, cash-flow, banking boxes, driver profile polish, multi-select filters, WO modal, has-transactions default).

GUARD: verify-c01-c17-master-detail-shell + verify-md-width-0. No Aug/Sep money. No seat fixtures.

ACK 2026-09-30 · CURSOR · read NOW-CURSOR · starting C-20

**2026-09-30T16:12Z · C-20 DRIVER PROFILE · PR #23444 · `cursor/c20-driver-profile-module-c89b`**
Tabbed shell (NavyPageSubNav before KPI strip), A-13 payee tabs, A-14 report shells, Proper Case + `(956) 000-0000` phone. Ops: `scripts/ops/verify-c20-driver-profile-module.mjs`.

**2026-09-30T16:45Z · C-21 ODOMETER HONESTY · branch `cursor/c21-maintenance-odometer-honest-c89b`**
C-21 · what changed: PM countdown + fleet odometer never invent miles when Samsara odometer is null. Backend `odometer_reading_at` on `/api/v1/maint/pm/due` + fleet-table rows. FE `odometerHonesty.ts` + `MaintenancePmCountdownCards` / `FleetTable` say "No odometer reading since <date>". Ops: `scripts/ops/verify-c21-odometer-honesty.mjs`. · LIVE PROOF: ops --selftest PASS; vitest odometerHonesty 3/3; tsc -b exit 0. · LEFT: D24 WO modal restore + rest of C-21 shell; C-22 next.
