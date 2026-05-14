# Backup & Disaster Recovery — IH35 Dispatch (DIP-aware)

## Executive summary (one page)

IH35 Dispatch depends on **Neon Postgres** (authoritative operational data), **Cloudflare R2** (evidence and document blobs), **Render** (API + static/driver deployments), **QuickBooks Online** (financial source of truth), **Plaid** (bank connectivity tokens), **Sentry** (production errors), and **Cloudflare** (DNS + edge protections). Recovery posture is **restore data where it lives**, **redeploy apps from git**, and **reconcile mirrors** (TMS ↔ QBO) after any partial outage.

**Recovery objectives (targets, not guarantees until measured in production drills):**

| Capability | Target RPO | Target RTO | Notes |
| --- | --- | --- | --- |
| Neon Postgres (operational DB) | Minutes–hours (Neon PITR window) | Hours | Bounded by Neon plan limits & restore testing |
| R2 evidence objects | Near-zero for recent uploads | Hours | Lifecycle tiering affects retrieval latency |
| Render services | Git SHA redeploy | Minutes–hours | Dependency on build pipelines & secrets |
| QBO | External SaaS | Hours–days | TMS remains a **mirror** post-restore |
| Plaid | Token-based | Minutes–hours | Rotation/re-auth may be required |

This document is an **operator runbook**. Procedures marked **“documented only”** have not been executed end-to-end in this repo’s CI and must be rehearsed in staging or a disposable Neon branch before being claimed as “tested DR.”

---

## 1) Neon Postgres — PITR window, restore, RPO/RTO

**What we rely on**

- Neon provides **branching** and **Point-in-Time Recovery (PITR)** capabilities depending on plan/configuration (exact retention/window is account-specific).

**Restore procedure (documented only — validate against Neon console for your project)**

1. Identify the incident time boundary (UTC) and whether corruption vs deletion drove the decision.
2. In Neon, create a **restored branch** or **PITR fork** from the production branch at a timestamp **before** the incident (per Neon UI/API docs).
3. Run migration sanity checks on the restored branch:
   - Confirm `_system._schema_migrations` (or project-standard migration bookkeeping table) matches expectations for the target timestamp.
4. Validate application-level integrity scripts already maintained in-repo (`npm run db:verify:*` family) against the restored branch when safe.
5. Cut over application `DATABASE_URL` to the restored branch **only** after:
   - Smoke validation passes,
   - Jorge sign-off,
   - A documented rollback path exists.

**RPO/RTO**

- **RPO** is bounded by Neon’s **PITR granularity + retention** for the production branch.
- **RTO** includes DNS/config propagation, Render env updates, cache flush, and deliberate smoke testing.

---

## 2) Cloudflare R2 — lifecycle rules & cold tier for evidence (>90 days)

**Intent**

- Operational evidence (POD/BOL imagery, dispute attachments, compliance artifacts) should remain durable with predictable cost.

**Guidance**

- Configure **lifecycle rules** so older evidence transitions to a colder storage class/tier consistent with legal retention requirements (exact tier naming varies by configuration).
- Anything older than **90 days** should be treated as **archive-grade**: slower retrieval acceptable; integrity checks required before relying on objects in disputes.

**Restore**

- If buckets are deleted or policies misapplied, recovery is **restore from backups** (if configured) or **re-upload from offline legal holds** — this must be explicitly designed; **do not assume** implicit versioning unless enabled.

---

## 3) Render — deployment model (git is source of truth)

**Principle**

- **Git `main` is canonical** for deployable artifacts.
- Render services should auto-deploy from `main` with pinned runtime versions matching `.nvmrc` / repo engines where applicable.

**Recovery**

1. Confirm the failing deploy SHA vs last known good SHA.
2. Roll forward with a fix commit **or** rollback deploy to last green release (Render dashboard).
3. Re-verify environment variables (especially secrets rotation events).

---

## 4) QuickBooks Online — financial truth + resync

**Principle**

- **QBO is the master for financial truth.** The TMS mirrors operational entities and integrations but **does not override** QBO as the ledger of record.

**Resync procedure (high level)**

1. Freeze destructive accounting mutations in TMS until scope is understood (owner approval).
2. Identify impacted entities (customers/vendors/invoices/payments) from integration logs/outbox tables as applicable.
3. Run the project’s QBO reconciliation/sync workflows per operating company (`TRK`, `TRANSP`) using supported admin tooling.
4. Produce a written reconciliation summary before clearing incident status.

---

## 5) Plaid — token rotation & compromise response

**Rotation**

- Rotate Plaid credentials on the documented vendor cadence and whenever staff with access rotates.

**If tokens may be compromised**

1. Revoke/rotate credentials in Plaid dashboard per vendor guidance.
2. Invalidate stored tokens in the TMS integration tables following the service layer’s supported paths (avoid ad-hoc DB edits without Jorge approval).
3. Force affected connections through **re-link** flows for owners/accountants.
4. Capture an audit trail entry describing scope and timing.

---

## 6) Sentry — error alert routing (owner phone + email)

**Requirement**

- Production errors must notify **Jorge’s mobile** and **primary ops email** via Sentry alert rules (issue alerts + optional metric alerts).

**Configuration checklist**

- [ ] Two independent notification channels (SMS/voice/pager vendor + email), verified end-to-end with a controlled test event.
- [ ] Ownership assignment / escalation policy documented in Sentry.
- [ ] On-call rotation documented outside Sentry (single-owner MVP is acceptable if explicitly noted).

---

## 7) Cloudflare — DNS & DDoS posture

**DNS**

- Treat Cloudflare as authoritative for public hostnames (`driver`, `app`, API subdomain patterns as deployed).

**DDoS / WAF**

- Enable sensible baseline protections appropriate to plan.
- Maintain allowlists only narrowly (avoid blocking legitimate carrier integrations).

---

## 8) Quarterly restore drill — schedule & procedure

**Schedule**

- At least **once per calendar quarter**, timed outside peak dispatch windows when possible.

**Procedure (minimum)**

1. Create a **disposable Neon branch** from production (or restore snapshot) for drill purposes only.
2. Restore or validate **sample R2 objects** for one historical dispute case (metadata + object existence).
3. Verify app boots against disposable DB using staging Render configuration **or** local smoke with read-only constraints.
4. Record outcomes, timings, and defects in the incident log.

---

## 9) Ch.11 DIP — lender audit access & monthly operating report (MOR)

**Lender audit access**

- Provision **read-only** credentials (Neon read replica or scoped role + IP allowlist) for lender technical auditors as approved by counsel.
- Never grant write access to production without dual approval (Jorge + counsel).

**MOR data export**

- Define the recurring export bundle ( revenue loads, settlement summaries, cash positioning snapshots, QBO tie-outs ) per counsel template.
- Export generation should be **repeatable** (scripted or documented SQL + CSV extracts), stored in counsel-approved storage.

---

### Integrity note (Standing Order alignment)

No production hotfix should bypass migrations or manual schema edits. Use migrations + verified scripts. DR exercises should prefer **disposable branches** over risky production mutations.
