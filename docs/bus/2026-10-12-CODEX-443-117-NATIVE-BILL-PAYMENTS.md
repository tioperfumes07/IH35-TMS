# CODEX | 2026-10-12 3:16 PM CT (20:16Z) | 443.117 9b

The app owns bill-payment accounting regardless of imported QBO provenance.
Single, vendor-batch and AP payment-application writers call the existing poster on the same transaction client.
The existing posting feature flag remains; this change removes the provenance exception, not the operational flag.
An unposted bill is refused by the existing BILL_AP_NOT_POSTED control and the caller must roll back.

Settlement deduction applications declare `settlementDeductionNoncash: true` before calling the writer.
Marking that flag after payment is too late: native posting would already have attempted a cash leg.
The settlement application poster still owns the noncash entry; no parallel accounting engine is introduced.

LANE_CROSS: accounting/settlement-posting/settlement-bill-payment-posting.service.ts, deduction payBill call;
443.117 9b / 443.131 authorizes the payment vertical. The minimum change moves the existing noncash
declaration into the writer input, rather than changing settlement accounting or CC-3's active fuel/correction files.

Proof is isolated PostgreSQL only. Seven real writer/route tests fail on the old writers with the 9a
engine present, and pass with both changes. An eighth test executes the exported live-guard SQL against
temporary tables: two gaps count, removing company scope counts three, and restoring the QBO exemption
counts one. These are test-fixture counts, not production measurements.
The AP route test adapts only company-scope connection wiring to the caller's rollback transaction;
the route SQL, flag resolver, posting engine and bank updates are real. Therefore 9a is a merge
dependency, not an optional skip. Fresh PostgreSQL 16 migration ran twice, exit 0, 1,494 ledger entries;
existing repository production-data-only migration skips remain and are not live proof.
Production counts remain unverified here; exact USMCA read-only SQL belongs in the PR for CC-2.
The live unposted-payment guard no longer excludes QBO provenance. It binds USMCA, excludes frozen entities,
and fails every NULL-company payment. The existing separate mirror-puller static exception is not expanded;
9e removes that puller's native writes. This change governs native payment entry points.
