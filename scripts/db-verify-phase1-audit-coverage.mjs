import dotenv from "dotenv";
import pg from "pg";
import crypto from "node:crypto";

dotenv.config();

const { Pool } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL;

if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL in environment.");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const suffix = crypto.randomUUID().slice(0, 8);
const coverageRunId = `phase1-audit-${suffix}`;
const createdUserIds = [];
const createdDriverIds = [];

const EVENT_CLASSES = [
  "identity.users.created",
  "identity.users.updated",
  "identity.users.deactivated",
  "mdata.drivers.created",
  "mdata.drivers.updated",
  "mdata.drivers.deactivated",
  "mdata.units.created",
  "mdata.units.updated",
  "mdata.units.deactivated",
  "mdata.customers.created",
  "mdata.customers.updated",
  "mdata.customers.profile_updated",
  "mdata.customers.detention_config_updated",
  "mdata.customers.status_changed",
  "mdata.customers.deactivated",
  "mdata.customer_contacts.created",
  "mdata.customer_contacts.updated",
  "mdata.customer_contacts.set_primary",
  "mdata.customer_contacts.deactivated",
  "mdata.customer_contacts.reactivated",
  "mdata.vendors.created",
  "mdata.vendors.updated",
  "mdata.vendors.deactivated",
  "mdata.locations.created",
  "mdata.locations.updated",
  "mdata.locations.deactivated",
  "mdata.equipment.created",
  "mdata.equipment.updated",
  "mdata.equipment.deactivated",
  "mdata.equipment_log.created",
  "catalogs.accounts.created",
  "catalogs.accounts.updated",
  "catalogs.accounts.deactivated",
  "catalogs.classes.created",
  "catalogs.classes.updated",
  "catalogs.classes.deactivated",
  "catalogs.items.created",
  "catalogs.items.updated",
  "catalogs.items.deactivated",
  "catalogs.payment_terms.created",
  "catalogs.payment_terms.updated",
  "catalogs.payment_terms.deactivated",
  "catalogs.posting_templates.created",
  "catalogs.posting_templates.updated",
  "catalogs.posting_templates.is_active_changed",
  "catalogs.account_role_bindings.created",
  "catalogs.account_role_bindings.updated",
  "auth.phone.verification_started",
  "auth.phone.verification_fallback_sms",
  "auth.phone.verified",
  "identity.users.deactivated_via_driver_deactivation",
  "org.companies.updated",
  "org.user_company_access.granted",
  "catalogs.equipment_types.created",
  "catalogs.equipment_types.updated",
  "catalogs.equipment_line_item_templates.created",
  "catalogs.equipment_line_item_templates.updated",
  "catalogs.driver_load_statuses.created",
  "catalogs.driver_load_statuses.updated",
  "catalogs.catalog_registry.created",
  "catalogs.catalog_registry.updated",
  "mdata.driver_equipment_qualifications.created",
  "mdata.driver_equipment_qualifications.updated",
  "mdata.driver_equipment_qualifications.deactivated",
  "mdata.driver_equipment_qualifications.reactivated",
  "mdata.driver_pay_rates.created",
  "mdata.driver_pay_rates.changed",
  "mdata.driver_company_authorizations.granted",
  "mdata.driver_company_authorizations.revoked",
  "mdata.driver_company_authorizations.updated",
  "mdata.driver_safety_events.created",
  "mdata.driver_safety_events.updated",
  "mdata.driver_safety_events.voided",
  "mdata.drivers.returning_driver_detected",
  "mdata.drivers.returning_driver_override",
  "mdata.drivers.rehired",
  "mdata.dispatcher_safety_events.created",
  "mdata.dispatcher_safety_events.updated",
  "mdata.dispatcher_safety_events.voided",
  "mdata.dispatcher_safety_events.returning_dispatcher_override",
  "mdata.customer_quality_events.created",
  "mdata.customer_quality_events.updated",
  "mdata.customer_quality_events.voided",
  "mdata.customers.quality_flag_changed",
  "docs.files.uploaded",
  "docs.files.viewed",
  "docs.files.categorized",
  "docs.files.linked_to_entity",
  "docs.files.unlinked_from_entity",
  "docs.files.soft_deleted",
  "docs.files.restored",
  "docs.files.version_uploaded",
  "outbox.event.delivered",
  "outbox.event.retried",
  "outbox.event.failed",
  "catalogs.fmcsa_lookup.executed",
  "mdata.customer.fmcsa_verified",
  "maintenance.wo.section_a_line_added",
  "maintenance.wo.section_b_line_added",
  "maintenance.wo.parts_subrow_added",
  "maintenance.wo.part_location_set",
  "maintenance.work_order.opened",
  "maintenance.work_order.closed",
  "maintenance.wo.in_house_allocated",
  "accounting.bill.auto_created_from_wo",
  "accounting.bill.created",
  "accounting.bill.voided",
  "accounting.bill_payment.created",
  "accounting.bill_payment.voided",
  "accounting.expense.auto_created_from_wo",
  "accounting.expense_line.load_linked",
  "accounting.expense_line.load_exempted",
  "fuel.transaction.load_linked",
  "fuel.transaction.load_exempted",
  "safety.hos_violation.created",
  "safety.hos_violation.voided",
  "safety.dot_inspection.created",
  "safety.dot_inspection.oos_spawned_wo",
  "safety.dot_inspection.voided",
  "safety.dot_inspection.spawned_wo",
  "safety.csa_score.computed",
  "safety.csa_score.fmcsa_pulled",
  "safety.internal_fine.created",
  "safety.internal_fine.converted_to_liability",
  "safety.complaint.filed",
  "safety.complaint.status_changed",
  "safety.complaint.created",
  "safety.complaint.resolved",
  "safety.complaint.voided",
  "safety.integrity.observation_created",
  "safety.integrity.observation_reviewed",
  "safety.company_violation.repurposed",
  "banking.bank_account.created",
  "banking.bank_account.updated",
  "banking.bank_account.deactivated",
  "banking.bank_account.reauthenticated",
  "banking.transaction.imported",
  "banking.transaction.matched",
  "banking.transaction.unmatched",
  "banking.transaction.qbo_synced",
  "banking.categorization_rule.created",
  "banking.categorization_rule.updated",
  "banking.categorization_rule.deactivated",
  "banking.categorization_rule.apply_historical",
  "banking.qbo_sync.enqueued",
  "banking.reconciliation.started",
  "banking.reconciliation.completed",
  "banking.plaid.link_token_created",
  "banking.plaid.token_exchanged",
  "banking.plaid.webhook_received",
  "banking.plaid.webhook_invalid",
  "banking.plaid.manual_sync",
  "banking.plaid.error",
  "driver_pay.settlement.payment_queued",
  "driver_pay.settlement.payment_sent",
  "driver_pay.settlement.payment_cleared",
  "driver_pay.settlement.payment_bounced",
  "driver_pay.settlement.marked_paid_manually",
  "banking.transfer.created",
  "banking.transfer.revoked",
  "qbo_archive.import_started",
  "qbo_archive.import_paused",
  "qbo_archive.import_resumed",
  "qbo_archive.import_completed",
  "qbo_archive.import_failed",
  "qbo_archive.report.generated",
  "forensic.anomaly.reviewed",
  "driver.qbo_vendor.linked",
  "driver.qbo_vendor.unlinked",
  "asset.qbo_class.linked",
  "asset.qbo_class.unlinked",
  "accounting.journal_entry.created",
  "accounting.journal_entry.voided",
  "dispatch.load.abandoned",
  "driver_finance.escrow.auto_deduct_proposed",
  "driver_finance.escrow.auto_deduct_approved",
  "driver_finance.escrow.auto_deduct_rejected",
  "maintenance.unit.marked_oos",
  "maintenance.unit.returned_to_service",
  "maintenance.severe_repair.estimate_generated",
  "driver_finance.dispute.opened",
  "driver_finance.dispute.under_review",
  "driver_finance.dispute.resolved",
  "driver_finance.dispute.withdrawn",
  "mdata.driver_team.created",
  "mdata.driver_team.split_changed",
  "mdata.driver_team.deactivated",
  "maintenance.work_order.bucket_changed",
  "dispatch.load.quick_assigned",
  "dispatch.load.cancellation_requested",
  "dispatch.load.cancellation_approved",
  "mdata.equipment_transfer.initiated",
  "mdata.equipment_transfer.confirmed",
  "mdata.equipment_transfer.rejected",
  "integrations.qbo.vendor_merge.executed",
  "factoring.faro_import.batch_upserted",
  "banking.equipment_loan.created",
  "banking.equipment_loan.attribution_created",
  "banking.equipment_loan.payment_recorded",
  "integrations.qbo.oauth_initiated",
  "integrations.qbo.oauth_callback",
  "integrations.qbo.authorized",
  "integrations.qbo.token_refreshed",
  "integrations.qbo.revoked",
  "integrations.qbo.refresh_failed",
  "integrations.qbo_sync.synced",
  "integrations.qbo_sync.failed",
  "integrations.qbo_sync.blocked",
  "integrations.qbo_sync.retry_requested",
  "integrations.qbo_sync.skipped",
];

const WARNING_EVENTS = new Set([
  "identity.users.updated",
  "identity.users.deactivated_via_driver_deactivation",
  "mdata.customers.status_changed",
  "catalogs.posting_templates.is_active_changed",
  "catalogs.account_role_bindings.created",
  "catalogs.account_role_bindings.updated",
  "auth.phone.verification_fallback_sms",
  "mdata.dispatcher_safety_events.returning_dispatcher_override",
  "mdata.customers.quality_flag_changed",
  "docs.files.unlinked_from_entity",
  "docs.files.soft_deleted",
  "outbox.event.retried",
  "outbox.event.failed",
  "safety.hos_violation.created",
  "safety.dot_inspection.spawned_wo",
  "safety.dot_inspection.oos_spawned_wo",
  "safety.internal_fine.converted_to_liability",
  "safety.complaint.filed",
  "safety.complaint.status_changed",
  "safety.complaint.created",
  "safety.complaint.resolved",
  "safety.complaint.voided",
  "safety.company_violation.repurposed",
  "accounting.expense_line.load_exempted",
  "fuel.transaction.load_exempted",
  "banking.bank_account.deactivated",
  "banking.categorization_rule.deactivated",
  "banking.plaid.webhook_invalid",
  "banking.plaid.error",
  "driver_pay.settlement.payment_bounced",
  "banking.transfer.revoked",
  "dispatch.load.abandoned",
  "driver_finance.escrow.auto_deduct_proposed",
  "driver_finance.escrow.auto_deduct_approved",
  "maintenance.unit.marked_oos",
  "driver_finance.dispute.opened",
  "driver_finance.dispute.resolved",
  "mdata.driver_team.split_changed",
  "mdata.driver_team.deactivated",
  "dispatch.load.cancellation_requested",
  "dispatch.load.cancellation_approved",
  "mdata.equipment_transfer.rejected",
  "qbo_archive.import_paused",
  "qbo_archive.import_failed",
  "integrations.qbo.revoked",
  "integrations.qbo.refresh_failed",
  "integrations.qbo_sync.failed",
  "integrations.qbo_sync.blocked",
  "integrations.qbo_sync.skipped",
]);

async function runWithBypass(client, fn) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function pass(name, fn) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
    return true;
  } catch (err) {
    console.error(`FAIL: ${name} -> ${String(err?.message || err)}`);
    return false;
  }
}

const client = await pool.connect();
const results = [];

try {
  await client.query("SET ROLE ih35_app");

  const { ownerId } = await runWithBypass(client, async () => {
    const ownerRes = await client.query(
      `
        INSERT INTO identity.users (email, google_user_id, role)
        VALUES ($1, $2, 'Owner')
        RETURNING id
      `,
      [`phase1-audit-owner-${suffix}@example.com`, `phase1-audit-owner-${suffix}`]
    );
    const ownerId = String(ownerRes.rows[0].id);
    createdUserIds.push(ownerId);

    const driverRes = await client.query(
      `
        INSERT INTO mdata.drivers (
          first_name, last_name, phone, status, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, $3, 'Active', $4, $4)
        RETURNING id
      `,
      [`Audit-${suffix}`, "Fixture", `555-${suffix.slice(0, 4)}`, ownerId]
    );
    createdDriverIds.push(String(driverRes.rows[0].id));

    return { ownerId };
  });

  results.push(
    await pass(`All ${EVENT_CLASSES.length} CRUD event classes append successfully`, async () => {
      await runWithBypass(client, async () => {
        for (const eventClass of EVENT_CLASSES) {
          const severity = WARNING_EVENTS.has(eventClass) ? "warning" : "info";
          await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
            eventClass,
            severity,
            JSON.stringify({
              coverage_run_id: coverageRunId,
              event_class: eventClass,
              resource_id: createdDriverIds[0],
              resource_type: "coverage.check",
            }),
            ownerId,
            "BT-1-PHASE1-AUDIT",
          ]);
        }
      });
    })
  );

  results.push(
    await pass(`Coverage run wrote all ${EVENT_CLASSES.length} expected audit rows`, async () => {
      await client.query("RESET ROLE");
      await client.query("BEGIN");
      try {
        const countRes = await client.query(
          `
            SELECT count(*)::int AS cnt
            FROM audit.audit_events
            WHERE source = 'BT-1-PHASE1-AUDIT'
              AND payload ->> 'coverage_run_id' = $1
          `,
          [coverageRunId]
        );
        const count = Number(countRes.rows[0]?.cnt ?? 0);
        if (count !== EVENT_CLASSES.length) {
          throw new Error(`expected ${EVENT_CLASSES.length} rows, got ${count}`);
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        await client.query("SET ROLE ih35_app");
      }
    })
  );
} catch (err) {
  console.error(`FAIL: setup/flow failed -> ${String(err?.message || err)}`);
  results.push(false);
} finally {
  try {
    await client.query("RESET ROLE");
    await client.query("BEGIN");
    try {
      if (createdDriverIds.length > 0) {
        await client.query(`DELETE FROM mdata.drivers WHERE id = ANY($1::uuid[])`, [createdDriverIds]);
      }
      if (createdUserIds.length > 0) {
        await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    console.log("PASS: cleanup phase1 audit coverage fixtures");
  } catch (err) {
    console.error(`FAIL: cleanup phase1 audit coverage fixtures -> ${String(err?.message || err)}`);
    results.push(false);
  }

  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: phase1 audit coverage verification complete.");
  process.exit(0);
}

console.error("FAIL: phase1 audit coverage verification failed.");
process.exit(1);
