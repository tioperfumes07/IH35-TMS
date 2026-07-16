# Pre-Cutover Checklist

**Scope:** Items that must be completed before production cutover of IH 35 TMS.  
**Last updated:** 2026-06-06 (PASS-8-RUNTIME resolution)

> **⚑ Ch.11 FRESH-START (OWNER-FINAL 2026-07-16; supersedes the prior 07/01/2026 cutover / 06/30/2026 opening lock.)**
> Cutover to **live parallel TMS posting = 04/01/2026** (per entity, after that entity's opening balance — QBO BS
> **as of 03/31/2026** — is imported + tied to QBO). The QBO-PUSH authority cutover stays EVENT-gated. Canonical
> spec: `docs/specs/OPENING-BALANCE-IMPORT-AND-CUTOVER-2026-07-16.md`.

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
