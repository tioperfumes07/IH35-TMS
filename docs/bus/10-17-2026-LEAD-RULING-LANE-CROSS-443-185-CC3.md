# LEAD ruling — lane cross: 443.185 G7 + G8 + G12 (CC-3, 2026-10-17)

Source (Lead channel, ~/IH35-LEAD-CHANNEL/2026-10-10-LEAD-TO-SEATS.md + ~/Downloads/10-16-2026-CC-3-443.185-Fuel-To-Load-And-Posting-Load-Id-G7-G8-G12.md):

> CC-3 — ROUND 443.185 — QUEUED AFTER 443.181 — G7 + G8 + G12 (reassigned from Codex)
> Owner 20:26 CT: "finish all the work with the coders … No more pending work."
> G7 ONE fuel-to-load rule … fuel_transactions gets trailer too. G8 every posting carries load_id (+ entity) when its
> source document has a load … one rule in the posting writer. G12 fuel duplicate rule … one rule: base invoice = one purchase.

Scope of the cross (reassigned from Codex to CC-3 by the Lead):

- apps/backend/src/fuel/fuel-transaction-import.ts, fuel/reefer-fuel.service.ts
- apps/backend/src/integrations/relay-payments/relay-fuel-canonical-bridge.ts, relay-fuel-load-rematch.service.ts
- apps/backend/src/accounting/posting-line-writer.ts (factoring_advance party + load)
- apps/backend/src/driver-finance/settlement-creator.service.ts (fuel row trailer only)
- scripts/verify-steps/18537 / 18541 / 18545 (claim #26878) and the guards repointed off resolveLoadId
