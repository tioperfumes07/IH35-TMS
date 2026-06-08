# Vendor Lock-in Analysis — IH35-TMS

**Block:** 28 of 29 — TIER4-VENDOR-LOCKIN  
**Last updated:** 2026-06-08  
**Owner:** Jorge Munoz  
**Review cadence:** Annually (or when a new vendor is added)

> This document inventories every vendor IH35-TMS depends on, the cost of leaving, acceptable alternatives, and lock-in severity. The goal is to make lock-in a conscious, documented decision — not an accident.

---

## Severity Scale

| Level | Definition |
|---|---|
| 🟢 **Low** | Migration is straightforward, < 1 week engineering, no data format issues |
| 🟡 **Medium** | Migration is possible with 2–8 weeks engineering, some data migration complexity |
| 🔴 **High** | Migration requires 1–3 months engineering, significant data migration, or no good alternative |

---

## Vendor Inventory

---

### 1. Render (Hosting)

| Field | Details |
|---|---|
| **What we depend on** | Web and API hosting (Node.js/Fastify backend + React frontend), preview environments, deploy hooks, environment variable management |
| **Cost of leaving** | 1–2 weeks to containerize and deploy to Railway / Fly.io / AWS ECS. Docker images already build-able. Minimal data to migrate (env vars only). |
| **Acceptable alternatives** | Railway (nearest feature parity), Fly.io (more control), AWS ECS/Fargate, DigitalOcean App Platform |
| **Mitigation** | IH35-TMS is already Dockerized (`Dockerfile` in repo). Deployable to any container host with minimal changes. No Render-proprietary APIs used. |
| **Lock-in severity** | 🟡 **Medium** — tied to Render's deploy hook URLs (update 2 secrets), preview env workflow (adapt CI), and managed SSL |
| **Renewal / contract** | Month-to-month, cancel anytime. No contract. |
| **Monthly cost** | ~$35/month (Starter plan × 2 services) |

---

### 2. Neon (PostgreSQL Database)

| Field | Details |
|---|---|
| **What we depend on** | PostgreSQL 16 database — all application data, branching for dev/preview, PITR backups, serverless connection pooling |
| **Cost of leaving** | 2–4 weeks: provision RDS/Supabase/self-hosted PG, run `pg_dump` + `pg_restore`, update `DATABASE_URL`, verify all migrations apply. No Neon-proprietary SQL syntax used. |
| **Acceptable alternatives** | Supabase (PG-compatible + has branching), AWS RDS PostgreSQL, DigitalOcean Managed PostgreSQL, self-hosted on Fly.io |
| **Mitigation** | All data is standard PostgreSQL — `pg_dump` exports everything. Migration history in `db/migrations/` is vendor-agnostic SQL. RLS, schemas, functions all standard PG. |
| **Lock-in severity** | 🟡 **Medium** — Neon branching (dev/preview branches) and PITR have no exact equivalents in all alternatives, but the data is fully portable. |
| **Renewal / contract** | Pay-as-you-go. Free tier available. No contract. |
| **Monthly cost** | ~$25/month (Pro plan) |

---

### 3. Samsara (Telematics)

| Field | Details |
|---|---|
| **What we depend on** | GPS tracking, vehicle telemetry, driver HOS (ELD), DVIRs, engine fault codes, geofencing, trip history |
| **Cost of leaving** | 6–12 weeks engineering to integrate replacement. Samsara hardware on trucks (devices must be replaced). Significant operational disruption during transition. |
| **Acceptable alternatives** | Motive (formerly KeepTruckin) — similar API, ELD-certified. Verizon Connect, Omnitracs, Geotab. |
| **Mitigation** | All Samsara data written to local DB (`integrations.samsara_events`). Historical data owned by IH35. Telematics integration layer is abstracted (`apps/backend/src/telematics/`). A new provider adapter can be added without rewriting the rest of the app. |
| **Lock-in severity** | 🔴 **High** — hardware (ELD devices) on every truck must be replaced. Significant disruption and cost. Driver retraining on new ELD app. |
| **Renewal / contract** | Annual contract. Review before each annual renewal. |
| **Monthly cost** | ~$25–$35/truck/month (300 trucks = ~$9,000/month) |

---

### 4. QuickBooks Online / QBO (Accounting)

| Field | Details |
|---|---|
| **What we depend on** | Chart of accounts, general ledger, payroll journal entries, AP/AR sync, financial reporting, tax filing support |
| **Cost of leaving** | 8–16 weeks: migrate COA to new system, re-map all accounts, rebuild sync layer, retrain accounting team. Requires Jorge's full buy-in. |
| **Acceptable alternatives** | Xero (strong API, international), Sage Intacct (mid-market), NetSuite (enterprise), FreshBooks (simpler). All have open APIs. |
| **Mitigation** | IH35-TMS maintains its own double-entry ledger (`accounting.journal_entries`) independent of QBO. QBO is a sync target, not the source of truth. If QBO is replaced, only the sync adapter changes. Financial data is owned by IH35. |
| **Lock-in severity** | 🟡 **Medium** — QBO sync is abstracted in the codebase. COA migration is the hard part (accounting work, not engineering). |
| **Renewal / contract** | Monthly subscription. ~$80/month (Plus plan). Cancel anytime. |
| **Monthly cost** | ~$80/month |

---

### 5. Plaid (Banking)

| Field | Details |
|---|---|
| **What we depend on** | Automated bank transaction import, account balance reads |
| **Cost of leaving** | 2–4 weeks to integrate a Plaid alternative. No stored Plaid-specific data format. |
| **Acceptable alternatives** | MX Technologies, Finicity (Mastercard), Yodlee, manual CSV import (already available as fallback) |
| **Mitigation** | Manual CSV import path exists and works. Plaid is enhancement only. Banking data stored in standard format in `banking_transactions` table. |
| **Lock-in severity** | 🟢 **Low** — banking data is portable; manual import is a viable fallback indefinitely. |
| **Renewal / contract** | Pay-per-call pricing. No minimum contract. |
| **Monthly cost** | ~$50–$100/month (depends on accounts connected) |

---

### 6. ComData (Fuel Cards)

| Field | Details |
|---|---|
| **What we depend on** | Fleet fuel card transaction import, per-truck fuel spend |
| **Cost of leaving** | 1–3 weeks to integrate a replacement (WEX, Fleetcor, etc.) |
| **Acceptable alternatives** | WEX Fleet (similar API), Fleetcor, Relay (already integrated), manual CSV import |
| **Mitigation** | Fuel transactions stored in standard format. Manual CSV import path exists. Multiple fuel card providers can be integrated in parallel. |
| **Lock-in severity** | 🟢 **Low** — data portable, alternatives available, manual fallback works. |
| **Renewal / contract** | No contract (API access tied to fuel card account). |
| **Monthly cost** | No separate API cost (bundled with fuel card processing). |

---

### 7. Relay (Fuel Cards)

| Field | Details |
|---|---|
| **What we depend on** | Alternative fuel card provider — some drivers use Relay cards |
| **Cost of leaving** | < 1 week — just stop calling the Relay API. |
| **Acceptable alternatives** | ComData (already integrated), WEX |
| **Mitigation** | Same as ComData. |
| **Lock-in severity** | 🟢 **Low** |
| **Renewal / contract** | No contract. |
| **Monthly cost** | No separate API cost. |

---

### 8. Sentry (Observability)

| Field | Details |
|---|---|
| **What we depend on** | Error tracking, performance monitoring, alerting, source map uploads |
| **Cost of leaving** | 1 week: install Datadog or Rollbar SDK, update DSN, configure alerts. |
| **Acceptable alternatives** | Datadog, Rollbar, Bugsnag, self-hosted Sentry (open-source) |
| **Mitigation** | Sentry SDK is initialized in one place (`apps/backend/src/observability/`, `apps/frontend/src/observability/`). Replacing it requires changing one file per service. Error data is not stored in IH35 DB (Sentry stores it). |
| **Lock-in severity** | 🟢 **Low** — SDK is a thin wrapper. Switching takes a day. |
| **Renewal / contract** | Monthly subscription. ~$26/month (Team plan). |
| **Monthly cost** | ~$26/month |

---

### 9. OpenAI / Anthropic (LLMs)

| Field | Details |
|---|---|
| **What we depend on** | AI-assisted features (document parsing, dispatch suggestions if active) |
| **Cost of leaving** | 1–2 weeks to swap API provider or disable AI features. |
| **Acceptable alternatives** | Anthropic Claude (if using OpenAI), OpenAI GPT-4o (if using Anthropic), Google Gemini, local Ollama |
| **Mitigation** | LLM calls are wrapped in a provider-agnostic client layer. Feature flags allow complete disabling. |
| **Lock-in severity** | 🟢 **Low** — abstraction layer makes provider swaps straightforward. |
| **Renewal / contract** | Pay-per-token. No contract. |
| **Monthly cost** | ~$20–$50/month (depends on usage) |

---

### 10. Email Provider (Postmark)

| Field | Details |
|---|---|
| **What we depend on** | Transactional email delivery — invoices, driver onboarding, password resets |
| **Cost of leaving** | < 1 week: update SMTP credentials or API key, update `SMTP_HOST` env var. |
| **Acceptable alternatives** | Resend, SendGrid, AWS SES, Mailgun |
| **Mitigation** | Email sending is in one service file (`apps/backend/src/email/`). Swap is a 1-day task. |
| **Lock-in severity** | 🟢 **Low** |
| **Renewal / contract** | Pay-per-email. No contract. |
| **Monthly cost** | ~$10–$20/month |

---

### 11. DNS / Domain

| Field | Details |
|---|---|
| **What we depend on** | Domain registration and DNS routing for `ih35tms.com` (or similar) |
| **Cost of leaving** | 30 minutes to transfer domain to another registrar. |
| **Acceptable alternatives** | Any ICANN-accredited registrar: Cloudflare Registrar (recommended — at-cost), Namecheap, Route 53 |
| **Mitigation** | Domain is owned by Jorge; transfer anytime with auth code. |
| **Lock-in severity** | 🟢 **Low** |
| **Renewal / contract** | Annual domain renewal (~$15/year). Auto-renew enabled. |
| **Monthly cost** | ~$1.25/month |

---

## Summary Scorecard

| Vendor | Severity | Est. Migration Cost | Monthly Cost |
|---|---|---|---|
| Render | 🟡 Medium | 1–2 weeks | ~$35 |
| Neon | 🟡 Medium | 2–4 weeks | ~$25 |
| **Samsara** | 🔴 **High** | 6–12 weeks + hardware | ~$9,000 |
| QBO | 🟡 Medium | 8–16 weeks | ~$80 |
| Plaid | 🟢 Low | 2–4 weeks | ~$75 |
| ComData | 🟢 Low | 1–3 weeks | $0 |
| Relay | 🟢 Low | < 1 week | $0 |
| Sentry | 🟢 Low | 1 day | ~$26 |
| OpenAI/Anthropic | 🟢 Low | 1–2 weeks | ~$35 |
| Postmark | 🟢 Low | 1 day | ~$15 |
| DNS/Domain | 🟢 Low | 30 min | ~$1 |
| **Total** | — | — | **~$9,292/month** |

---

## Key Findings

1. **Samsara is the only high-severity lock-in.** The ELD hardware on every truck is the binding constraint. Evaluate Samsara contracts annually and negotiate pricing accordingly.
2. **Database (Neon) and hosting (Render) are medium severity** but carry zero proprietary data formats — data is fully portable standard SQL.
3. **QBO is medium severity** due to accounting team familiarity and COA history, not technical lock-in. IH35 owns its own ledger.
4. **All other vendors are low severity** — days to weeks to replace, no hardware dependency.

---

## Next Review

Review this document annually and when:
- A new vendor is added (add an entry here)
- A vendor changes pricing or contract terms significantly
- A vendor has a major outage (assess whether to mitigate lock-in)
