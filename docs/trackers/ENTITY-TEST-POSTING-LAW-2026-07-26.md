# Entity test + posting law (owner 2026-07-26) — DO NOT FORGET

## Companies

| Code | Law |
|---|---|
| **USMCA** | Brand-new. **Fully functional.** Everything posts. Primary clean test books. |
| **TRK** | Leases only. **Use as test.** Posting ON. |
| **TRANSP** | Live ops. **Testing OK immediately.** Posting ON for TMS test. |

## QuickBooks

- Sync **FROM** QBO into TMS.
- Reconcile **daily**.
- **Never write TMS → QuickBooks.**
- Therefore TMS posting/testing does **not** corrupt QBO.

## Live Neon action (same day)

- Fuel overage policies: TRANSP + USMCA + TRK ($900, recover non-fuel).
- Fuel overage flag: ON per-entity for all three.
- GL posting flags (`GL_POSTING_ENABLED` + `*_GL_POSTING_ENABLED`): ON for **USMCA + TRK + TRANSP**.
