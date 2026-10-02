// Follow-up to AUTH-203 (22 duplicate load-stop fences deactivated). What those duplicates already produced downstream:
//   * safety.geofence_breach_events on a deactivated duplicate fence that has an exact twin on the KEPT fence (same
//     vehicle, same event type, within 5 minutes) -> ACKNOWLEDGED (breach events are append-only evidence: a trigger
//     blocks DELETE and allows only acknowledged_at / acknowledged_by to change; the twin leaves the open queue, the
//     record stays). Attributed to the owner as approver of the AUTH (no system user exists; same as AUTH-202);
//   * safety.integrity_findings anomaly_class 'duplicate_fire' on a deactivated duplicate fence -> RESOLVED with a note
//     naming the fix (the finding was right; its cause is closed).
// Odometer captures / mileage are NOT touched: both mileage engines pair or pick a single capture, so a twin cannot
// double a mile. Dry run (default) only SELECTs. --apply requires --auth AUTH-NNN verified OPEN on main.
import { run, USMCA } from "./2026-10-01-cc3-lib.mjs";

const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const OWNER_NOTE = "Cause fixed: duplicate load-stop fence (unserialised auto_dispatch bind) — binds serialised #24177, duplicate deactivated under AUTH-203.";

await run("stop_fence_twins", async (c: any, { apply, authId }: { apply: boolean; authId: string | null }) => {
  const dups = `(SELECT jsonb_array_elements_text(payload->'ids')::uuid AS id FROM audit.audit_events WHERE event_class = 'cc3.dedupe_stop_fences')`;
  const pairs = `(SELECT d.id AS dup_id, k.id AS keep_id FROM geo.geofences d JOIN ${dups} x ON x.id = d.id
                    JOIN geo.geofences k ON k.label = d.label AND k.operating_company_id = d.operating_company_id AND k.is_active
                   WHERE d.operating_company_id = $1::uuid)`;
  const breaches = (await c.query(
    `SELECT b.id::text FROM safety.geofence_breach_events b JOIN ${pairs} p ON p.dup_id = b.geofence_id
      WHERE b.operating_company_id = $1::uuid AND b.acknowledged_at IS NULL
        AND EXISTS (SELECT 1 FROM safety.geofence_breach_events s WHERE s.geofence_id = p.keep_id AND s.vehicle_id = b.vehicle_id
                     AND s.event_type = b.event_type AND abs(extract(epoch FROM s.event_at - b.event_at)) < 300)`, [USMCA])).rows.map((r: any) => r.id);
  const findings = (await c.query(
    `SELECT f.uuid::text AS id FROM safety.integrity_findings f JOIN ${pairs} p ON p.dup_id::text = f.geofence_id::text
      WHERE f.operating_company_id = $1::uuid AND f.anomaly_class = 'duplicate_fire' AND NOT f.resolved`, [USMCA])).rows.map((r: any) => r.id);
  let acknowledged = 0, resolved = 0;
  if (apply) {
    acknowledged = (await c.query(
      `UPDATE safety.geofence_breach_events SET acknowledged_at = now(), acknowledged_by = $3::uuid
        WHERE operating_company_id = $1::uuid AND id = ANY($2::uuid[]) AND acknowledged_at IS NULL`, [USMCA, breaches, OWNER_USER_ID])).rowCount ?? 0;
    resolved = (await c.query(
      `UPDATE safety.integrity_findings SET resolved = true, resolved_at = now(), resolution_note = $3
        WHERE operating_company_id = $1::uuid AND uuid = ANY($2::uuid[]) AND NOT resolved`, [USMCA, findings, `${OWNER_NOTE} (${authId})`])).rowCount ?? 0;
    if (acknowledged !== breaches.length || resolved !== findings.length) throw new Error(`plan ${breaches.length}/${findings.length} vs applied ${acknowledged}/${resolved}`);
  }
  return { twin_breaches: breaches.length, duplicate_fire_findings: findings.length, acknowledged, resolved, breach_ids: breaches, finding_ids: findings };
}, { asTableOwner: true });
