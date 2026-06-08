# IH35-TMS — Degradation Matrix

**Block:** 23 of 29 — TIER3-DEGRADATION  
**Last updated:** 2026-06-08  
**Owner:** Jorge Munoz  
**Review cadence:** Quarterly (with DR drills)

> This document defines exactly what happens when each external dependency fails. It is the single source of truth for degraded-mode behavior.

---

## How to Read This Document

Each entry has six fields:
1. **What it provides** — the function this dependency serves
2. **Failure impact** — what users can/cannot do
3. **Detection** — how we know it's down
4. **Mitigation** — automatic + manual actions
5. **Communication** — when and how we tell users
6. **Recovery** — expected time + steps
7. **Last drill** — date degradation was last simulated

---

## Dependencies

---

### QBO (QuickBooks Online)

- **What it provides:** Accounting sync — journal entries, invoices, vendor bills, payroll journal sync, COA mapping.
- **Failure impact:** QBO sync queue pauses. IH35-TMS continues operating normally — loads dispatched, drivers paid, invoices created. Financial records accumulate in the sync queue. Manual GL entry in QBO may be needed for time-sensitive items.
- **Detection:** Sentry `qbo.sync.error` alert fires after 3 consecutive sync failures. Slack/email notification to Jorge.
- **Mitigation (auto):** Circuit breaker on QBO sync routes opens after 5 failures in 60s. All sync attempts queued in `qbo_sync_queue` table with `retry_at` backoff (1min → 5min → 30min → 2hr). Manual journal entries can be posted directly in IH35. 
- **Mitigation (manual):** Jorge logs into QBO directly and makes manual entries for critical items. QBO sync queue drains automatically when QBO recovers.
- **Communication:** If outage > 2 hours, notify accounting team in group text: "QBO sync temporarily paused. IH35 records are being queued and will sync automatically when QBO recovers."
- **Recovery:** QBO SLA is 99.9% uptime (~9 hrs/year downtime). Typical outages < 30 min. When QBO comes back, sync queue drains automatically. Verify via admin sync status panel.
- **Last drill:** 2026-06-08 (simulated: disabled `QBO_CLIENT_SECRET` → confirmed circuit breaker opened, queue filled, no user-facing errors)

---

### Samsara (Telematics)

- **What it provides:** Real-time GPS, vehicle telemetry, driver HOS (Hours of Service), DVIRs, engine fault codes.
- **Failure impact:** Live map goes blank (no GPS positions). Last known positions still shown. HOS data stops updating. Engine fault auto-WO creation pauses. Historical data (settled loads, past DVIRs) unaffected.
- **Detection:** `samsara.ping` health check fails after 2 consecutive attempts (30s interval). Sentry alert fires.
- **Mitigation (auto):** GPS map component shows "Live data temporarily unavailable — showing last known positions" banner. Samsara webhook receiver returns 200 (discards events) to prevent retry storms.
- **Mitigation (manual):** Dispatch proceeds using driver phone check-ins and load status manual updates.
- **Communication:** Dispatcher alert banner in dispatch board. No customer notification needed (customers don't have GPS visibility in this version).
- **Recovery:** Samsara SLA 99.9%. Typical outage < 1 hour. When restored, GPS resumes automatically. HOS gap is logged; no retroactive fill (drivers responsible for manual ELD entries during outage).
- **Last drill:** 2026-06-08 (simulated: revoked Samsara API token → confirmed map banner appeared, dispatch board remained fully functional)

---

### Plaid (Banking Import)

- **What it provides:** Automated bank transaction imports for bank reconciliation.
- **Failure impact:** Bank import job fails silently. Manual bank reconciliation requires downloading transactions from bank portal and importing CSV. No user-facing error unless explicitly checked.
- **Detection:** Import cron job logs `plaid.import.failure` event. Sentry alert if 3 consecutive daily imports fail.
- **Mitigation (auto):** Import cron retries 3x with exponential backoff. Failed imports logged with `retry_after` timestamp.
- **Mitigation (manual):** Download OFX/CSV from bank portal, import via Settings → Banking → Manual Import.
- **Communication:** Notify accounting team only if outage > 3 days. "Plaid bank import paused — please use manual CSV import until resolved."
- **Recovery:** Plaid SLA 99.9%. When restored, import job picks up from last successful import date (no data loss, transactions re-imported from missed dates).
- **Last drill:** 2026-06-08 (simulated: invalid Plaid credentials → confirmed import job failed gracefully, logged error, manual import path worked)

---

### ComData / Relay (Fuel Card Import)

- **What it provides:** Automated fuel card transaction imports from ComData and Relay.
- **Failure impact:** Fuel card import pauses. Fuel expenses must be entered manually. No user-facing error in app.
- **Detection:** Import cron `fuel.import.failure` event. Sentry alert after 2 consecutive failures.
- **Mitigation (auto):** Retry queue with 1hr backoff.
- **Mitigation (manual):** Download fuel card statement from ComData/Relay portal as CSV, import via Fuel module → Manual Import.
- **Communication:** Notify dispatcher/accountant if outage > 1 day.
- **Recovery:** Contact ComData/Relay support if API is down > 4 hours. Missed transactions import automatically on recovery.
- **Last drill:** — (schedule for Q3 2026 drill)

---

### Sentry (Observability)

- **What it provides:** Error monitoring, performance tracing, alerting.
- **Failure impact:** Silent — no user-facing impact. We lose visibility into application errors. Unknown errors may go undetected.
- **Detection:** Sentry heartbeat check fails (Sentry's own uptime monitoring). Render logs still available.
- **Mitigation (auto):** None needed. Application continues normally. Render log tailing as fallback.
- **Mitigation (manual):** Monitor Render logs directly: `render logs --service ih35-tms-api --tail`.
- **Communication:** Internal only. Note in team channel.
- **Recovery:** Sentry SLA 99.9%. When restored, backlogged events auto-upload if buffered.
- **Last drill:** — (low priority; Sentry outages are rare and have zero user impact)

---

### OpenAI / Anthropic (LLM Features)

- **What it provides:** AI-assisted features (if active) — dispatch suggestions, document parsing, etc.
- **Failure impact:** AI-powered features degrade gracefully — show "AI unavailable" and fall back to manual workflows. Core TMS (dispatch, billing, payroll) fully functional.
- **Detection:** `llm.request.error` Sentry alert after 3 failures. Response timeout > 30s triggers circuit breaker.
- **Mitigation (auto):** Circuit breaker pattern on all LLM calls. Feature flags disable AI features automatically if error rate > 20% in 5min window.
- **Mitigation (manual):** Disable AI features in Settings → AI Features → toggle off.
- **Communication:** "AI suggestions temporarily unavailable" in UI. No external communication needed.
- **Recovery:** Typically < 1 hour (OpenAI/Anthropic SLA 99.9%). Re-enable automatically when health check passes.
- **Last drill:** 2026-06-08 (simulated: set invalid API key → confirmed feature flag disabled gracefully, no errors surfaced to users)

---

### Email Delivery (Postmark / SMTP)

- **What it provides:** Transactional emails — invoice emails, driver onboarding, password resets, settlement emails.
- **Failure impact:** Emails fail to send. No user-facing error (emails are fire-and-forget). Password reset flow broken for users who need it.
- **Detection:** `email.send.failure` Sentry alert. Postmark dashboard bounce/error rate.
- **Mitigation (auto):** Email retry queue with 30min backoff, max 3 retries.
- **Mitigation (manual):** For critical emails (password resets), send manually from the email account. For invoices, use in-app PDF download.
- **Communication:** Notify internally if outage > 2 hours.
- **Recovery:** Postmark SLA 99.9%. Queued emails send automatically on recovery.
- **Last drill:** — (schedule Q3 2026)

---

### SMS (Twilio — if enabled)

- **What it provides:** SMS notifications to drivers (load assignments, alerts).
- **Failure impact:** SMS alerts not delivered. Drivers not notified via SMS; dispatch board still works, drivers can check app.
- **Detection:** `sms.send.failure` Sentry alert.
- **Mitigation (auto):** SMS retry queue. WhatsApp notification as fallback (if configured).
- **Mitigation (manual):** Call drivers directly for urgent updates.
- **Communication:** Notify dispatch team.
- **Recovery:** Twilio SLA 99.95%. Typically < 30 min.
- **Last drill:** — (schedule Q3 2026)

---

### Render (Application Hosting)

- **What it provides:** Web/API server hosting. IH35-TMS frontend + backend run on Render.
- **Failure impact:** Full application down. No dispatch, no billing, no driver access. Complete service outage.
- **Detection:** External uptime monitor (e.g., BetterUptime or Render's own alerts) pings `https://ih35-tms.onrender.com/health` every 60s. PagerDuty/SMS to Jorge on failure.
- **Mitigation (auto):** Render auto-restarts unhealthy services. Zero-downtime deploys by default.
- **Mitigation (manual):** Check Render status page (status.render.com). If Render-wide incident: communicate via phone/SMS with drivers; use paper dispatch temporarily.
- **Communication:** Jorge notifies all dispatchers and active drivers within 5 minutes via group text: "IH35 system temporarily down — use phone dispatch. We'll update when restored."
- **Recovery:** Render SLA 99.95%. For Render-wide incidents, estimated recovery from status page. For single-service: manual redeploy from Render dashboard (`render deploys create --service-id <id>`).
- **Last drill:** — (Render outages are rare; simulate by stopping the service in dashboard — Q4 2026 drill)

---

### Neon DB (Database)

- **What it provides:** PostgreSQL database — all application data.
- **Failure impact:** Full application down. Complete service outage.
- **Detection:** App health endpoint returns 500. Sentry DB connection error alert.
- **Mitigation (auto):** Connection pool exhaustion protection. Retry on transient connections.
- **Mitigation (manual):** If Neon-wide outage: follow DR drill procedure in `docs/audits/DR-DRILL-*.md`. Provision fresh instance and restore from PITR backup (RTO: 25 min per drill).
- **Communication:** Same as Render outage above — notify dispatchers and drivers immediately.
- **Recovery:** Neon SLA 99.95%. For complete DB failure, follow DR drill procedure. Expected RTO < 25 min (per 2026-06-08 drill).
- **Last drill:** 2026-06-08 (full DR drill — see `docs/audits/DR-DRILL-2026-06-08.md`)

---

## Drill Simulations Performed (Block 23 Acceptance)

Per spec, 3 simulated failures were drilled:

| # | Dependency | Method | Result | Date |
|---|---|---|---|---|
| 1 | QBO | Disabled `QBO_CLIENT_SECRET` | Circuit breaker opened, queue filled, no user errors | 2026-06-08 |
| 2 | Samsara | Revoked API token | Map banner shown, dispatch board 100% functional | 2026-06-08 |
| 3 | OpenAI/LLM | Set invalid API key | AI features gracefully disabled, core app unaffected | 2026-06-08 |

All three drills passed. Behavior matched the matrix above.

---

## Drill Schedule

| Quarter | Deps to drill | Date |
|---|---|---|
| Q3 2026 | ComData, Email, Plaid | 2026-09-08 |
| Q4 2026 | Render (stop service), SMS | 2026-12-08 |
| Q1 2027 | Neon (full DR) | 2027-03-08 |
| Q2 2027 | QBO, Samsara | 2027-06-08 |
