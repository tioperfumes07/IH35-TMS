# DS-IMPL-3 — Reconciliation Worker Design

Block: `DS-IMPL-3`  
Priority: `P1`  
Type: Design only (no code, no migrations, no SQL execution)  
Date: `2026-05-21`

## 1) Purpose + MUST-DS-3/4 contract restated

This design defines the reconciliation worker that closes Data Sovereignty gaps identified in DS-IMPL-1, DS-IMPL-2, and DS-IMPL-4.

- **MUST-DS-3 contract:** every integration must have explicit delta cadence, full-sync cadence, and event-ingest paths.
- **MUST-DS-4 contract:** third-party outages must not break local operational reads; writes/backfill queue safely; users see clear degraded-state warnings; outage start/recovery are auditable.

Worker mission:
- run on explicit schedule by integration and operating company
- compare local mirror state vs remote source-of-truth snapshots/metrics
- write drift findings to `_system.reconciliation_findings`
- route critical findings to existing outbox alert paths
- record outage lifecycle events for observability and recovery

## 2) Findings input index (audit trilogy -> this design)

| Audit finding | Addressed by DD / section | Coverage status |
|---|---|---|
| F-TOOLING-001 (no canonical QBO remote counts) | DD-3, Section 6, Section 11 | Covered (dependency on DS-REMEDIATE-2) |
| F-005/F-006/F-007 (QBO request-path external reads) | DD-1, DD-5, Section 10 | Covered (design dependency for DS-REMEDIATE-1) |
| F-004 (DS-5 metadata inconsistency) | DD-2, Section 5, Section 12 | Covered (schema contract shape + follow-on alignments) |
| S-001 (Samsara DS-5 metadata gap) | DD-2, Section 5, Section 12 | Covered |
| S-002 (Samsara config route sync call) | DD-1, DD-5, Section 10 | Covered |
| S-003 (Samsara master-sync dormant) | DD-1, DD-3, Section 12 | Covered (defer activation decision to remediation) |
| S-004 (no webhook projection worker) | DD-1, Section 8, Section 10 | Covered (reconciliation reads projection outcomes; does not replace projection worker) |
| S-006 (CAP-15 reconciliation) | DD-4, Section 7, Section 8 | Covered (zero tolerance identity mismatch) |
| B-009 (queue/background pattern for DS-1 violations) | DD-1, Section 10 | Covered |
| B-010 (remote count collector) | DD-3, Section 7, Section 10 | Covered (prerequisite noted) |
| B-011 (canonical mirror metadata contract) | DD-2, Section 5 | Covered |
| B-016 (boundary policy annotations) | Section 11 only | Deferred (out of reconciliation scope) |
| B-017 (empty UUID cron failures) | DD-7, Section 9, Section 10 | Covered |
| B-018 (reconciliation observability) | DD-5, Section 5, Section 10 | Covered |

## 3) Existing patterns the worker plugs into (exact references)

- Background job wrapper: `apps/backend/src/lib/background-jobs.ts` (`wrapBackgroundJobTick`, `recordBackgroundJobRun`)
- Scheduler examples:
  - `apps/backend/src/cron/qbo-cdc-poll.cron.ts`
  - `apps/backend/src/cron/samsara-health-cron.ts`
- Job telemetry table: `_system.background_jobs`
- QBO outbox dispatcher pattern: `apps/backend/src/integrations/qbo/outbox-dispatcher.ts` (`accounting.outbox_events` -> dispatch loop)
- Generic outbox processor + handlers:
  - `apps/backend/src/outbox/index.ts`
  - `apps/backend/src/outbox/handlers/twilio-sms.ts`
- Audit event pattern (`audit.append_event`) used in:
  - `apps/backend/src/integrations/plaid/webhook-core.ts`
  - `apps/backend/src/integrations/samsara/samsara-webhook.routes.ts`
  - `apps/backend/src/integrations/qbo/forensic-admin.routes.ts`
- Webhook persistence tables:
  - QBO: `integrations.qbo_inbound_events` via `apps/backend/src/integrations/qbo/qbo-webhook.routes.ts`
  - Samsara: `integrations.samsara_webhook_events` via `apps/backend/src/integrations/samsara/samsara-webhook.routes.ts`

## 4) Architecture decisions (DD-1 to DD-7)

<span style="color:#c62828"><strong>DECISION POINT DD-1 — Worker invocation pattern</strong></span>  
**Recommendation:** Option A (scheduled background job via existing cron + `wrapBackgroundJobTick`).  
**Rationale:** satisfies MUST-DS-3 explicit cadence, matches existing runtime pattern, centralizes telemetry in `_system.background_jobs`, and avoids introducing new infrastructure.

<span style="color:#c62828"><strong>DECISION POINT DD-2 — Findings persistence model</strong></span>  
**Recommendation:** Option A (single `_system.reconciliation_findings` table with `integration` discriminator).  
**Rationale:** supports cross-integration dashboards, uniform alerting logic, and consistent lifecycle fields (`detected_at`, `resolved_at`, `severity`) without table sprawl.

<span style="color:#c62828"><strong>DECISION POINT DD-3 — Cadence defaults</strong></span>  
**Recommendation:** conservative initial cadence (defined, not optimized) with week-1 retune after observed noise/finding rates.  
**Rationale:** remote-count collector not yet implemented (B-010), unknown production drift baseline, and MUST-DS-3 needs explicit cadence not aggressive polling.

<span style="color:#c62828"><strong>DECISION POINT DD-4 — Drift thresholds</strong></span>  
**Recommendation:** strict zero for static and identity domains; mixed absolute + percentage thresholds for transactional domains; numeric deltas for odometer.  
**Rationale:** prevents false negatives on invariants while controlling noise on naturally bursty transactional data.

<span style="color:#c62828"><strong>DECISION POINT DD-5 — Alert routing policy</strong></span>  
**Recommendation:** Critical -> outbox SMS + audit event; Important -> audit event + dashboard; Cleanup -> audit event only.  
**Rationale:** reuses existing outbox/notification stack, preserves signal-to-noise, and maps directly to remediation urgency.

<span style="color:#c62828"><strong>DECISION POINT DD-6 — Outage degradation behavior</strong></span>  
**Recommendation:** fail run safely, log `outage_started`, retry next cadence, escalate after 3 consecutive failures, log `outage_recovered`, then run immediate catch-up full reconciliation.  
**Rationale:** explicit DS-4 compliance with bounded alerting and deterministic recovery.

<span style="color:#c62828"><strong>DECISION POINT DD-7 — Operating company tenancy scope</strong></span>  
**Recommendation:** fail fast when `operating_company_id` context is missing/invalid (no silent skip, no implicit default).  
**Rationale:** addresses B-017 empty-UUID class directly and prevents cross-tenant reconciliation contamination.

## 5) Schema proposal — `_system.reconciliation_findings`

Proposed table shape (design only, no migration SQL in this block):

| Column | Proposed type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `operating_company_id` | `uuid` | no | Tenant scope |
| `integration` | `text` | no | enum-like check: `qbo`, `samsara`, `plaid`, `fmcsa` |
| `mirror_category` | `text` | no | e.g., `refdata_static`, `transactional`, `identity_mapping`, `telematics_numeric` |
| `finding_type` | `text` | no | e.g., `count_drift`, `value_drift`, `identity_mismatch`, `remote_unavailable`, `webhook_projection_gap` |
| `severity` | `text` | no | `critical`, `important`, `cleanup` |
| `status` | `text` | no | `open`, `acknowledged`, `resolved` |
| `detected_at` | `timestamptz` | no | default now |
| `reconciliation_run_id` | `uuid` | yes | Links logical run context (if run-id object introduced) |
| `resource_scope` | `jsonb` | no | keyed identifiers: table/entity/realm/item/company |
| `local_value` | `jsonb` | no | local observed state |
| `remote_value` | `jsonb` | yes | null when remote unavailable |
| `drift_metric_abs` | `numeric(20,6)` | yes | absolute delta |
| `drift_metric_pct` | `numeric(10,6)` | yes | relative drift percentage |
| `threshold_snapshot` | `jsonb` | no | thresholds used at detect time |
| `first_seen_at` | `timestamptz` | no | first detection timestamp |
| `last_seen_at` | `timestamptz` | no | last re-observed timestamp |
| `resolved_at` | `timestamptz` | yes | closed timestamp |
| `resolved_by_user_id` | `uuid` | yes | actor for manual resolution |
| `resolution_notes` | `text` | yes | freeform resolution detail |
| `created_at` | `timestamptz` | no | default now |
| `updated_at` | `timestamptz` | no | default now |

Proposed indexes:
- `idx_recon_findings_open_by_company` on (`operating_company_id`, `status`, `severity`, `detected_at desc`)
- `idx_recon_findings_integration_window` on (`integration`, `detected_at desc`)
- `idx_recon_findings_finding_type` on (`finding_type`, `status`)
- `idx_recon_findings_resource_scope_gin` GIN on `resource_scope`

RLS notes:
- enable RLS with same tenant semantics as other `_system` telemetry tables
- policy requires explicit `app.operating_company_id` context match
- service/bypass role permitted for scheduler ticks and system reconciliation

<span style="color:#c62828"><strong>DECISION POINT (Schema)</strong></span>  
Approve single-table schema above as the canonical findings contract for DS-REMEDIATE-3 migration.

## 6) Cadence proposals (initial defaults)

<span style="color:#c62828"><strong>DECISION POINT (Cadence Defaults)</strong></span>

| Integration/category | Delta cadence | Full cadence | Rationale |
|---|---|---|---|
| QBO refdata (accounts/classes/items/customers/vendors) | every 6 hours | every 24 hours | slow-changing; remote collector dependency; reduce noise |
| QBO transactional (invoices/bills/payments) | every 60 minutes | every 12 hours | operational relevance but still conservative for week-1 baseline |
| Samsara static mirrors (drivers/vehicles) | every 12 hours | every 24 hours | low fleet cardinality and low churn |
| Samsara live event completeness (webhook ledger vs mirrors) | every 60 minutes | every 6 hours | verify ingest/projection lag, not polling raw telematics feeds |
| Plaid transactions | every 2 hours | every 24 hours | bursty financial ingress; avoid over-polling before baseline |
| FMCSA | n/a | n/a | control-plane lookup flow, not continuous mirror domain |

Retune rule:
- run these defaults for 7 days
- tighten only if false-positive rate is low and unresolved drift latency is unacceptable

## 7) Drift threshold proposals

<span style="color:#c62828"><strong>DECISION POINT (Threshold Defaults)</strong></span>

| Mirror category | Acceptable drift | Severity rule | Rationale |
|---|---|---|---|
| Static refdata (accounts/classes/items/tax codes) | `0` | any drift -> `important` (or `critical` if persists >24h) | static mirrors should not diverge |
| Customer/vendor mirrors | transient `<=1` count delta per company window | `>1` -> `important`; persistent `>1` over 2 runs -> `critical` | arrival-in-flight quirk allowed, not invariant |
| Transactional mirrors | abs delta `<=10` **and** pct delta `<=1.0%` | exceeding either -> `important`; exceeding both by 2x -> `critical` | combines volume sensitivity and relative drift |
| Samsara odometer/value drift | `<=10` miles per vehicle | `>10` -> `important`; `>100` -> `critical` | numeric telemetry drift handling (not count-based) |
| CAP-15 identity mappings (driver pivot) | `0` | any mismatch -> `critical` | wrong-identity financial routing risk |

Threshold evaluation rule:
- transactional domain must satisfy both absolute and percentage tolerance simultaneously
- identity and static domains are zero-tolerance invariants

## 8) Drift detection logic (pseudocode)

```typescript
for (const operatingCompanyId of ["TRK", "TRANSP"]) {
  runReconciliationForCompany(operatingCompanyId)
}

function runReconciliationForCompany(operatingCompanyId: string) {
  reconcileQboRefdata(operatingCompanyId)
  reconcileQboTransactional(operatingCompanyId)
  reconcileSamsaraStatic(operatingCompanyId)
  reconcileSamsaraWebhookCompleteness(operatingCompanyId)
  reconcilePlaidTransactional(operatingCompanyId)
  reconcileCap15Identity(operatingCompanyId)
}

function reconcileQboRefdata(oc: string) {
  for (const mirror of ["qbo_accounts", "qbo_classes", "qbo_items", "qbo_customers", "qbo_vendors"]) {
    const localCount = localCountForMirror(mirror, oc)
    const remoteCount = remoteCountCollectorValue(mirror, oc) // from accounting.qbo_remote_counts
    if (remoteCount == null) {
      recordFinding({ integration: "qbo", findingType: "remote_unavailable", severity: "cleanup", mirror })
      continue
    }
    const delta = Math.abs(localCount - remoteCount)
    if (delta !== 0) {
      recordFinding({ integration: "qbo", findingType: "count_drift", severity: "important", driftAbs: delta, mirror })
    }
  }
}

function reconcileQboTransactional(oc: string) {
  for (const mirror of ["invoices", "bills", "payments"]) {
    const localCount = localTxnCount(mirror, oc)
    const remoteCount = remoteTxnCountFromCollector(mirror, oc)
    if (remoteCount == null) {
      recordFinding({ integration: "qbo", findingType: "remote_unavailable", severity: "cleanup", mirror })
      continue
    }
    const absDelta = Math.abs(localCount - remoteCount)
    const pctDelta = percentDelta(localCount, remoteCount)
    if (absDelta > 10 || pctDelta > 0.01) {
      const severe = absDelta > 20 && pctDelta > 0.02
      recordFinding({
        integration: "qbo",
        findingType: "count_drift",
        severity: severe ? "critical" : "important",
        driftAbs: absDelta,
        driftPct: pctDelta,
        mirror,
      })
    }
  }
}

function reconcileSamsaraStatic(oc: string) {
  for (const mirror of ["samsara_drivers", "samsara_vehicles"]) {
    const ds5Ok = mirrorHasRequiredDs5Metadata(mirror)
    if (!ds5Ok) {
      recordFinding({ integration: "samsara", findingType: "schema_contract_gap", severity: "important", mirror })
    }
  }
}

function reconcileSamsaraWebhookCompleteness(oc: string) {
  const received = recentWebhookEntityIds("samsara", oc, lookbackHours = 24)
  const projected = mirroredEntityIdsFromLocalMirrors("samsara", oc)
  const missing = setDifference(received, projected)
  if (missing.size > 0) {
    recordFinding({
      integration: "samsara",
      findingType: "webhook_projection_gap",
      severity: missing.size > 50 ? "critical" : "important",
      localValue: { projected: projected.size },
      remoteValue: { received: received.size, missingIdsSample: [...missing].slice(0, 20) },
    })
  }
}

function reconcilePlaidTransactional(oc: string) {
  const activeItems = activePlaidItems(oc)
  for (const itemId of activeItems) {
    const localCount = localPlaidTxnCount(itemId, oc)
    const remoteCount = plaidRemoteTxnCount(itemId) // remote check executed only in scheduled worker context
    if (remoteCount == null) {
      recordFinding({ integration: "plaid", findingType: "remote_unavailable", severity: "cleanup", resource: itemId })
      continue
    }
    const absDelta = Math.abs(localCount - remoteCount)
    const pctDelta = percentDelta(localCount, remoteCount)
    if (absDelta > 10 || pctDelta > 0.01) {
      recordFinding({
        integration: "plaid",
        findingType: "count_drift",
        severity: absDelta > 20 && pctDelta > 0.02 ? "critical" : "important",
        driftAbs: absDelta,
        driftPct: pctDelta,
        resource: itemId,
      })
    }
  }
}

function reconcileCap15Identity(oc: string) {
  const mismatches = cap15IdentityMismatches(oc) // TMS driver pivot vs samsara_driver_id vs qbo_vendor_id
  for (const mismatch of mismatches) {
    recordFinding({
      integration: "samsara",
      mirrorCategory: "identity_mapping",
      findingType: "identity_mismatch",
      severity: "critical",
      localValue: mismatch.local,
      remoteValue: mismatch.remote,
    })
  }
}
```

## 9) Outage degradation pseudocode (MUST-DS-4)

```typescript
function reconciliationTick(integration: Integration, operatingCompanyId: string) {
  return wrapBackgroundJobTick(`reconciliation.${integration}`, async () => {
    assertOperatingCompanyScope(operatingCompanyId) // fail fast if missing/invalid

    try {
      auditAppend("reconciliation_tick_started", { integration, operatingCompanyId })
      runIntegrationReconciliation(integration, operatingCompanyId)
      resetConsecutiveFailureCounter(integration, operatingCompanyId)
      auditAppend("reconciliation_tick_succeeded", { integration, operatingCompanyId })

      if (wasPreviouslyOutage(integration, operatingCompanyId)) {
        const duration = outageDuration(integration, operatingCompanyId)
        auditAppend("outage_recovered", { integration, operatingCompanyId, duration })
        runFullCatchUpReconciliation(integration, operatingCompanyId)
      }
    } catch (err) {
      markOutageIfFirstFailure(integration, operatingCompanyId, err)
      const failures = incrementConsecutiveFailureCounter(integration, operatingCompanyId)

      auditAppend("outage_started_or_continued", {
        integration,
        operatingCompanyId,
        consecutiveFailures: failures,
        error: safeError(err),
      })

      // Degrade gracefully: no request-path impact, no queue poison.
      if (failures >= 3) {
        enqueueCriticalAlertOutbox({
          channel: "sms",
          eventType: "reconciliation.outage.critical",
          integration,
          operatingCompanyId,
          consecutiveFailures: failures,
        })
      }

      // Skip this run; retry on next scheduled cadence.
      return
    }
  })
}
```

## 10) Alert routing

| Severity | Route | Behavior |
|---|---|---|
| `critical` | Outbox SMS + audit event | immediate operator attention |
| `important` | Audit event + reconciliation dashboard | review in daily operations |
| `cleanup` | Audit event only | low urgency hygiene backlog |

Routing implementation note:
- use existing outbox dispatch path (`accounting.outbox_events` + outbox handlers) for critical notifications
- include `operating_company_id`, integration, finding id, and concise drift summary in alert payload

## 11) Migration plan and DS-REMEDIATE sequencing

1. **DS-REMEDIATE-2 first:** implement remote count collector (B-010) and backfill `accounting.qbo_remote_counts`.
2. **DS-REMEDIATE-3:** add `_system.reconciliation_findings` table and indexes.
3. **DS-REMEDIATE-4:** implement reconciliation worker service + tick logic, wrapped with `wrapBackgroundJobTick`.
4. **DS-REMEDIATE-4.1:** register scheduler entries and startup initialization using existing cron pattern.
5. **DS-REMEDIATE-5:** wire critical alert routing through outbox SMS handler.
6. **DS-REMEDIATE-1 in parallel track:** refactor DS-1 admin route violations to queued/background pattern.
7. **DS-REMEDIATE-6:** fix empty-UUID scope failures (B-017) across existing cron surfaces.
8. **Follow-on:** DS-5 alignment, Samsara projection worker, CAP-13 materialization, CAP-15 formal checks.

## 12) Open questions / deferred designs

- **Deferred (explicitly out of scope):** B-016 control-plane route annotations table.  
  Reason: not required for reconciliation worker DS-3/DS-4 satisfaction; needs separate route-policy design block for allow-list semantics and enforcement location.
- Should `reconciliation_run_id` reference a future dedicated run ledger table, or remain nullable/free-form until such a ledger exists?
- Should unresolved critical findings auto-open tasks/tickets in addition to outbox SMS, or remain audit/outbox-only in v1?

## 13) Mapping to DS-IMPL-4 Section 8 master remediation sequence

| Master item | Covered by DS-IMPL-3 design? | Notes |
|---|---|---|
| B-009 DS-1 route refactor | Partial | covered as dependency and worker-compatible invocation pattern; implemented in DS-REMEDIATE-1 |
| B-010 remote-count collector | Partial | worker consumes this; implementation is DS-REMEDIATE-2 prerequisite |
| B-011 DS-5 metadata contract alignment | Partial | schema contract shape defined; table-by-table migration deferred |
| B-012 Samsara projection worker | Partial | reconciliation checks projection completeness; projection implementation deferred |
| B-013 Samsara master-sync activation/retire | Partial | dependency called out; implementation deferred |
| B-014 CAP-13 schema materialization | Deferred | out of reconciliation core; separate remediation block |
| B-015 CAP-15 formalization | Covered | zero-threshold identity mismatch logic designed |
| B-016 boundary annotations | Deferred | explicitly out-of-scope (Section 12) |
| B-017 empty-UUID context hardening | Covered | fail-fast tenancy decision + outage path |
| B-018 observability expansion | Covered | findings table + lifecycle audit + severity routing |

