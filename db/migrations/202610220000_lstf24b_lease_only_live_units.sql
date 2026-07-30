-- LST-F24b — a lease may only be asserted on a unit the company still operates.
--
-- CORRECTS MY OWN MIGRATION 202610200000 (LST-F24, PR #3796). That migration set
-- currently_leased_to_company_id = TRANSP on ALL 186 rows of mdata.units. It has already applied on
-- prod. The owner correctly challenged the number: 186 is not the fleet.
--
-- WHAT 186 ACTUALLY CONTAINS (prod br-fancy-credit-akjnd07a, complete read 186 == n_live_tup 186,
-- positive control passing):
--     status Sold ................ 78     deactivated_at set ......... 136
--     status OutOfService ........ 26     live + in service .......... ~37
--     status InService ........... 82
--   and, the part that made the list look doubled: EVERY unit exists twice — once live and once with
--   a `U-` prefix that is deactivated. T120/U-T120 (both FREIGHTLINER CASCADIA), T122 (R)/U-T122 (R)
--   (both PETERBILT 579), Truck-121/U-Truck-121, 123..129/U-123..U-129. Same make, same model, same
--   truck: a superseded import that was deactivated rather than removed.
--   Plus 8 TEST units (TEST-TRUCK-1..4, U-TEST-TRUCK-1..4), all deactivated.
--
-- So 202610200000 asserted an ACTIVE LEASE TO TRANSPORTATION on 78 sold trucks, on every superseded
-- `U-` duplicate, and on 8 test rows. A sold truck cannot be leased to anyone. On a fixed-asset
-- register or in front of a lender that reads as equipment the company still operates.
--
-- I reported "186 distinct unit_numbers, zero duplicate VINs" and called the data clean. That was
-- wrong in substance: `T120` and `U-T120` are distinct STRINGS and distinct VIN values but the same
-- physical truck. I checked string equality when the duplication is by prefix convention. Recorded
-- so the next reader does not repeat it.
--
-- WHAT THIS MIGRATION DOES: clears the lease where it is false. It does NOT change ownership —
-- owner_company_id stays TRK, which is historically true even for a unit that has since been sold —
-- and it does NOT delete anything. The `U-` rows, the sold units and the test rows all remain for
-- history, and stay editable in the app.
--
-- OWNER RULINGS APPLIED (2026-07-29, verbatim where quoted):
--   · "OUT OF SERVICE STAY TRUCKING OWNED AND TRUASNPORTATION LEASED YES" — the 26 OutOfService units
--     are deliberately NOT touched. A truck in the shop is still owned and still leased.
--   · "ALL TRAILERS IN SAMSARA ARE ACTIVE TRAILERS" — active trailers keep their lease.
--   · "THE ONLY UNITS THAT ARE WORKING ARE THOSE BETWEEN T139-T178 ... ALSO T120, T122 T124" —
--     verified on prod: T139..T177 are 35 rows, all InService, none deactivated (MACK ANTHEM,
--     PETERBILT 567/579/389, VOLVO VNL/VNR). T120 exists and is live. T122 exists as `T122 (R)`.
--     T124 does NOT exist as a live unit — the only match is `124`, PETERBILT 579, status Sold and
--     deactivated. Flagged rather than invented.
--   · Sold units: the owner is editing/deactivating those in the app himself. This migration only
--     removes the false lease and leaves that work untouched.
--
-- IDEMPOTENT: guarded by `currently_leased_to_company_id IS NOT NULL`; a second run changes 0 rows.
-- AUDITED: trg_audit_units writes an append-only audit.row_changes entry for every row changed, so
-- the pre-change value stays recoverable. NO DDL. NO DELETE.

DO $$
DECLARE
  v_cleared int;
  v_still_leased_sold int;
  v_live_leased int;
BEGIN
  UPDATE mdata.units u
     SET currently_leased_to_company_id = NULL
   WHERE u.currently_leased_to_company_id IS NOT NULL
     AND (
           u.status::text = 'Sold'              -- a sold truck cannot be leased
        OR u.unit_number LIKE 'U-%'             -- superseded duplicate import, all deactivated
        OR u.unit_number ILIKE '%TEST%'         -- TEST-TRUCK-1..4 / U-TEST-TRUCK-1..4
         );
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  SELECT count(*) INTO v_still_leased_sold
    FROM mdata.units
   WHERE status::text = 'Sold' AND currently_leased_to_company_id IS NOT NULL;

  SELECT count(*) INTO v_live_leased
    FROM mdata.units
   WHERE currently_leased_to_company_id IS NOT NULL;

  RAISE NOTICE 'LST-F24b: cleared % false lease(s); % units still carry a lease; sold-with-lease now %',
    v_cleared, v_live_leased, v_still_leased_sold;

  IF v_still_leased_sold <> 0 THEN
    RAISE EXCEPTION 'LST-F24b: % sold unit(s) still carry an active lease. Aborting.', v_still_leased_sold;
  END IF;
END $$;
