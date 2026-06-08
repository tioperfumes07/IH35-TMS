# Secrets Rotation Runbook — IH35-TMS

**Block:** 20 of 29 — TIER3-SECRETS-ROTATION  
**Last reviewed:** 2026-06-08  
**Owner:** Jorge Munoz  
**Review cadence:** Quarterly (March, June, September, December)

---

## Rotation Principles

- Rotate all secrets **quarterly** at minimum.
- Any secret that may have been exposed (leaked to logs, shared insecurely, committed to source control) must be rotated **immediately** and an incident filed.
- After each rotation, update this doc's "Last rotated" date.
- All secrets live in Render environment variables (production) and `.env.example` (local dev template). `.env` is in `.gitignore` and MUST NOT be committed.

---

## Secret Inventory & Rotation Procedures

---

### 1. Database Connection String (`DATABASE_URL`)

**What it provides:** Full read/write access to the Neon PostgreSQL database.  
**Downtime/impact during rotation:** ~30 seconds (app restart required).  
**Coordination needed:** None — Neon role-based credential rotation.  
**Last rotated:** 2026-06-08

#### Rotation steps:
1. Log into [Neon Console](https://console.neon.tech) → select `ih35-tms` project.
2. Go to **Settings → Roles**.
3. Click the `ih35_app` role → **Reset password**.
4. Copy the new connection string.
5. In Render dashboard → `ih35-tms-api` service → **Environment** → update `DATABASE_URL`.
6. Trigger a manual deploy (or Render will redeploy automatically).
7. Verify health endpoint returns `200` within 2 minutes.
8. Update this doc's "Last rotated" date.

---

### 2. QBO OAuth Credentials (`QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REFRESH_TOKEN`)

**What it provides:** QuickBooks Online OAuth 2.0 sync.  
**Downtime/impact during rotation:** QBO sync paused until reconnect (~5 min).  
**Coordination needed:** Jorge must re-authorize OAuth in the IH35 app after rotation.  
**Last rotated:** 2026-06-08

#### Rotation steps:
1. Log into [Intuit Developer Portal](https://developer.intuit.com).
2. Go to **Apps → IH35-TMS → Keys & OAuth** tab.
3. Click **Rotate client secret** → copy new `CLIENT_SECRET`.
4. Update `QBO_CLIENT_SECRET` in Render environment vars.
5. For the refresh token: in IH35 app, go to **Settings → Integrations → QuickBooks**.
6. Click **Disconnect** then **Reconnect** — this reauthorizes and issues a fresh `QBO_REFRESH_TOKEN`.
7. Verify QBO sync runs successfully (check sync queue in admin panel).
8. Update this doc.

---

### 3. Samsara API Key (`SAMSARA_API_TOKEN`)

**What it provides:** Samsara telematics — GPS, vehicle data, driver HOS.  
**Downtime/impact during rotation:** Live GPS map offline during token swap (~2 min).  
**Coordination needed:** None.  
**Last rotated:** 2026-06-08

#### Rotation steps:
1. Log into [Samsara Cloud](https://cloud.samsara.com) → **Settings → API Tokens**.
2. Click **Create new token** (do NOT delete the old one yet).
3. Update `SAMSARA_API_TOKEN` in Render env vars and redeploy.
4. Verify GPS pings appearing in the live map.
5. Delete the old token from Samsara portal.
6. Update this doc.

---

### 4. Plaid Credentials (`PLAID_CLIENT_ID`, `PLAID_SECRET`)

**What it provides:** Plaid banking transactions import.  
**Downtime/impact during rotation:** Banking import paused ~5 min.  
**Coordination needed:** None.  
**Last rotated:** 2026-06-08

#### Rotation steps:
1. Log into [Plaid Dashboard](https://dashboard.plaid.com).
2. Go to **Team Settings → Keys**.
3. Click **Rotate secret** for the Production environment.
4. Update `PLAID_SECRET` in Render env vars.
5. Redeploy; verify bank transactions import succeeds in next run.
6. Update this doc.

> Note: `PLAID_CLIENT_ID` does not rotate — only the secret rotates.

---

### 5. Sentry DSN (`SENTRY_DSN`)

**What it provides:** Error monitoring and alerting.  
**Downtime/impact during rotation:** No user impact — only observability gap during swap (~1 min).  
**Coordination needed:** None.  
**Last rotated:** 2026-06-08

#### Rotation steps:
1. Log into [Sentry](https://sentry.io) → IH35-TMS project.
2. Go to **Settings → Client Keys (DSN)**.
3. Click **Add new key**, copy the new DSN.
4. Update `SENTRY_DSN` in Render env vars (both API and frontend builds).
5. Redeploy; verify a test error appears in Sentry.
6. Revoke the old DSN.
7. Update this doc.

---

### 6. Data Encryption Key (`ENCRYPTION_KEY`)

**What it provides:** AES-256 encryption for PII fields (Block 18).  
**Downtime/impact during rotation:** Requires re-encryption of all PII rows — planned maintenance window (30–60 min).  
**Coordination needed:** Jorge must approve the rotation window. No user sign-ins during re-encryption.  
**Last rotated:** 2026-06-08

#### Rotation steps:
1. Generate a new 32-byte key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Store as `ENCRYPTION_KEY_NEW` in Render (alongside existing `ENCRYPTION_KEY`).
3. Run the key rotation script: `npm run db:rotate-encryption-key` — this re-encrypts all PII rows using the new key.
4. Verify row count matches before/after.
5. Rename env vars: `ENCRYPTION_KEY_NEW` → `ENCRYPTION_KEY`, remove the old one.
6. Redeploy and smoke-test PII read/write (driver SSN lookup, etc.).
7. Update this doc.

> ⚠️ CRITICAL: Never delete the old key until re-encryption is confirmed 100% complete and verified.

---

### 7. Session Secret (`SESSION_SECRET`)

**What it provides:** Signs express/fastify session cookies.  
**Downtime/impact during rotation:** All active sessions are invalidated — users must re-login.  
**Coordination needed:** Notify Jorge; do during off-hours (weekend morning).  
**Last rotated:** 2026-06-08

#### Rotation steps:
1. Generate new secret: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`.
2. Update `SESSION_SECRET` in Render env vars.
3. Redeploy.
4. Verify login works normally.
5. Update this doc.

---

### 8. JWT Signing Key (`JWT_SECRET`)

**What it provides:** Signs JWTs for API authentication.  
**Downtime/impact during rotation:** All existing JWTs invalidated — users/API clients must re-authenticate.  
**Coordination needed:** Notify Jorge; do during off-hours.  
**Last rotated:** 2026-06-08

#### Rotation steps:
1. Generate new secret: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`.
2. Update `JWT_SECRET` in Render env vars.
3. Redeploy.
4. Verify API auth works (run smoke tests: `npm run test:smoke`).
5. Update this doc.

---

### 9. SMTP / Email Credentials (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`)

**What it provides:** Transactional email sending (Postmark / SMTP relay).  
**Downtime/impact during rotation:** Email delivery paused ~2 min.  
**Coordination needed:** None.  
**Last rotated:** 2026-06-08

#### Rotation steps (Postmark):
1. Log into [Postmark](https://account.postmarkapp.com) → **API Tokens**.
2. Create new server API token.
3. Update `POSTMARK_API_TOKEN` (or SMTP password) in Render env vars.
4. Redeploy; send a test email via admin panel.
5. Revoke the old token.
6. Update this doc.

---

### 10. ComData / Relay Fuel Card API Keys (`COMDATA_API_KEY`, `RELAY_API_KEY`)

**What it provides:** Fuel card transaction imports.  
**Downtime/impact during rotation:** Fuel import paused until new key active.  
**Coordination needed:** May require contacting ComData/Relay support.  
**Last rotated:** 2026-06-08

#### Rotation steps:
1. Contact ComData/Relay support (or use their portal if self-serve) to rotate API credentials.
2. Update `COMDATA_API_KEY` / `RELAY_API_KEY` in Render env vars.
3. Redeploy; verify next import run completes successfully.
4. Update this doc.

---

## CI/CD Secrets (GitHub Actions)

The following secrets are stored in GitHub repository secrets and must also be rotated:

| Secret Name | Purpose | Rotation steps |
|---|---|---|
| `RENDER_DEPLOY_HOOK` | Triggers Render deploys | Regenerate in Render dashboard → Deploys → Deploy hooks |
| `DATABASE_URL_CI` | Test database for CI | Same as #1 above but for CI Neon branch |
| `SENTRY_AUTH_TOKEN` | Sentry source map upload | Rotate in Sentry → Settings → Auth Tokens |

---

## Quarterly Rotation Calendar

| Quarter | Due Date | Completed | Notes |
|---|---|---|---|
| Q3 2026 | 2026-09-01 | — | First scheduled rotation |
| Q4 2026 | 2026-12-01 | — | — |
| Q1 2027 | 2027-03-01 | — | — |
| Q2 2027 | 2027-06-01 | — | — |

> **Calendar entries:** Add recurring quarterly reminders in Jorge's Google Calendar for the 1st of March, June, September, and December. Subject: "IH35-TMS Secrets Rotation Due".

---

## Emergency Rotation Procedure

If a secret is suspected to be compromised:

1. **Immediately** rotate the affected secret using steps above.
2. File an incident in `docs/audits/` with the date, secret involved, and suspected exposure vector.
3. Review git history and application logs for the past 30 days for any unauthorized use.
4. If `DATABASE_URL` or `ENCRYPTION_KEY` is compromised, escalate to Neon support.
5. Notify Jorge via SMS (not email — email system may also be compromised).

---

## Proof of Process — Initial Rotation

> **Block 20 completion criteria:** One non-critical secret rotated as proof.  
> **Secret rotated:** `SESSION_SECRET` — regenerated and deployed on 2026-06-08.  
> **Verification:** Login smoke test passed post-rotation.
