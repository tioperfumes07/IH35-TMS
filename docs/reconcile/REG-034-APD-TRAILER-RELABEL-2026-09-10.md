# REG-034 — APD trailer relabel to real numbers (owner-authorized 2026-09-10)

Owner ruling (verbatim, 2026-09-10 06:5xZ): **"REG-034 TO THEIR REAL NUMBERS."**

## What this fixed
Fleet showed 20 trailers as `USMCA-APD-16..35` — insurance-intake placeholder labels from the SIGNED
Lloyd's APD quote 437539 (loaded 2026-08-31 by Claude GO-01 migration #19315, which deliberately did NOT
invent a fleet number). The owner's real numbers existed separately, mapped to the placeholders **by VIN**
in `docs/reconcile/AT-TMS-TRAILERS-2026-09-01.csv`, and 12 of them had been created as SEPARATE duplicate
`mdata.equipment`/`mdata.assets` rows (vin=NULL, dry_van) on 2026-09-05/07. Result: same physical trailer
twice + a placeholder label.

## Applied LIVE on Neon `tiny-field-89581227` / `br-fancy-credit-akjnd07a` (USMCA), one atomic tx
1. Retired the 12 duplicate `vin=NULL` equipment rows: `equipment_number || '-DUP-VOID-20260910'`,
   `status='OutOfService'`, `deactivated_at=now()`, WORM note. Void-not-delete (rows kept).
2. Retired their 11 assets: `unit_code || '-DUP-VOID-20260910'`, `status='retired'`, `out_of_service=true`.
   (FB-56704 duplicate had no asset row.)
3. Relabeled 18 VIN-matched APD rows (equipment + asset) to their real numbers.

VIN-matched map applied (APD → real number):
16→10209, 17→10218, 18→10224, 19→10202, 20→FB-56208, 21→FB-56210, 22→10113, 23→FB-5038, 24→10380,
26→FB-56704, 27→FB-56709, 29→FB-56713, 30→FB-56716, 31→10876, 32→10215, 33→10222, 34→FB-56207, 35→FB-5056.

## LIVE PROOF (returned by the tx)
- 12 equipment retired, 11 assets retired, 18 equipment relabeled, 18 assets relabeled.
- Post-state: `active_apd_left = 2`, `retired_dups = 12`. The 18 real numbers are now the active trailer
  records (VIN + correct Reefer/Flatbed type + insurance `policy_unit` intact).

## OPEN — owner confirmation needed (NOT guessed)
- **USMCA-APD-25** (VIN `1JJV53280GL965870`) — no CSV mapping. Nearest is real trailer **10870**
  (CSV VIN `1JJV532B0GL965870`) — differs by one char (`8` vs `B0`). Likely a VIN transcription diff, not
  confirmed. Left as `USMCA-APD-25`.
- **USMCA-APD-28** (VIN `1UYSF2530J5394706`) — no CSV mapping. Nearest is real trailer **FB-56710**
  (CSV VIN `1UYFS2530J5394706`) — `SF`↔`FS` transposition. Likely the same trailer, not confirmed. Left as
  `USMCA-APD-28`.
Owner: confirm these two real numbers and I relabel them the same way.

## Idempotent / reversible
Re-running is a no-op (renamed APD rows no longer match `USMCA-APD-*`; retired dups already carry the
`-DUP-VOID-` suffix + vin IS NULL guard). Reversible: the retired duplicate rows are preserved (not
deleted) and can be reactivated if ever needed.
