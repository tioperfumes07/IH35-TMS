-- SCENTSX B1 (1 of 2) — org.company_type gains 'distributor'.
--
-- Owner 2026-11-26 20:13 CT chose "Own company, same engine": ScentsX LLC (TIO Perfumes) becomes its own company
-- inside the existing accounting engine — its own chart, periods, journal entries, bank, QuickBooks — walled by
-- company exactly as USMCA is walled from TRANSP / TRK. ScentsX sells goods; it is neither an asset holder nor an
-- operating carrier, so it gets its own kind. Every carrier engine already runs only for LIVE_ENGINE_COMPANY_IDS
-- (USMCA) and every carrier picker filters operating_carrier / the launch code, so a 'distributor' row is invisible to
-- dispatch, drivers, settlements, fuel, IFTA and safety by construction.
--
-- THIS FILE DOES ONE THING, on purpose (same landmine as 202614310000): an ADD VALUE sharing a transaction with other
-- DDL is rolled back by any later failure while the ledger still says "applied". No explicit BEGIN/COMMIT — the
-- runner wraps the file; ADD VALUE inside a transaction is legal while the new label is not used in it, and nothing
-- here uses it. The row that uses it is 202616820200. Idempotent: IF NOT EXISTS.

ALTER TYPE org.company_type ADD VALUE IF NOT EXISTS 'distributor';
