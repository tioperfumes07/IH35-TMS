# MVP launch checklist — IH35 Dispatch

Use this as the single **go / no-go** sheet for the May 2026 MVP launch window. Every box should be checked by **Jorge** or a designated accountable owner.

- [ ] All Phase 5 + Phase 6 blocks merged + deployed
- [ ] All migrations applied to production Neon (verify `_system._schema_migrations`)
- [ ] Render env vars present: `EMAIL_*`, `AWS_SES_*`, `QBO_*`, `PLAID_*`, `SAMSARA_*`, `R2_*`
- [ ] Real seed CSVs loaded (drivers + customers + vendors + assets per company)
- [ ] Plaid prod credentials swapped (sandbox → prod)
- [ ] WhatsApp Meta verification approved
- [ ] iPhone Safari ITP fix deployed (Block P Agent 2)
- [ ] iPhone Safari smoke test passes
- [ ] Backup/DR doc reviewed by Jorge (`docs/operations/BACKUP_DR.md`)
- [ ] Sentry alerts routed to Jorge phone + email
- [ ] Owner login confirmed on both companies (TRK + TRANSP)
- [ ] DIP lender access verified (read-only credentials)
- [ ] Decommission staging Neon branch
- [ ] First manual JE owner sign-off (Phase 5 cutover)
- [ ] Driver PWA Spanish locale verified (Block P Agent 2)
- [ ] Web Push notifications working on iOS Safari 16.4+ (Block P Agent 2)
