# Pre-Cutover Checklist

**Scope:** Items that must be completed before production cutover of IH 35 TMS.  
**Last updated:** 2026-06-06 (PASS-8-RUNTIME resolution)

---

## QBO Connectivity

- [ ] Direct QBO sandbox CreateInvoice round-trip from outbox (deferred from PASS-8-RUNTIME 2026-06-06 per Jorge directive)
  - Verify TRANSP QBO connection (realm `123145885549599`) can create a real invoice in sandbox
  - Verify TRK QBO connection (realm `1432746210`) can create a real invoice in sandbox
  - Confirm `accounting.outbox_events` row transitions: `pending → dispatched` after background dispatcher tick
  - Confirm no cross-OCI invoice creation

## Data Readiness

- [ ] TRK carrier onboarding data (customers, drivers, fleet units) loaded before TRK live operations
- [ ] TRANSP production QBO auth token refreshed and verified before cutover

## Go-Live Gates

- [ ] Jorge Gate 15 GO — PASS-8-RUNTIME second approval (Pass-2 ingest + GAP unpause)
- [ ] CLOSURE-32 expanded scope reviewed and dispatched

---

*Reference: `docs/audits/PASS-8-RESULTS-2026-06-06.md` §D3-X RESOLUTION for QBO deferral rationale.*
