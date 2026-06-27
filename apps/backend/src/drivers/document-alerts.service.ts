export const DOCUMENT_ALERT_ENGINE_VERSION = "a24-9-v1";

export type DocumentAlertRule = {
  id: string;
  operating_company_id: string;
  document_type: string;
  rule_name: string;
  days_before_expiry: number[];
  severity: string;
  notify_email: boolean;
  notify_in_app: boolean;
  enabled: boolean;
};

export type DocumentExpiryCandidate = {
  driver_id: string | null;
  driver_name: string;
  document_type: string;
  source_id: string;
  label: string;
  expiry_date: string;
  days_until_expiry: number;
};

type QueryableClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

function subjectKey(candidate: DocumentExpiryCandidate) {
  return `${candidate.document_type}:${candidate.driver_id ?? "company"}:${candidate.source_id}`;
}

export async function listDocumentAlertRules(client: QueryableClient, operatingCompanyId: string) {
  const res = await client.query<DocumentAlertRule>(
    `
      SELECT
        id::text,
        operating_company_id::text,
        document_type,
        rule_name,
        days_before_expiry,
        severity,
        notify_email,
        notify_in_app,
        enabled
      FROM safety.document_alert_rules
      WHERE operating_company_id = $1::uuid
      ORDER BY rule_name ASC
    `,
    [operatingCompanyId]
  );
  return res.rows;
}

export async function updateDocumentAlertRule(
  client: QueryableClient,
  operatingCompanyId: string,
  ruleId: string,
  patch: Partial<{
    rule_name: string;
    days_before_expiry: number[];
    severity: string;
    notify_email: boolean;
    notify_in_app: boolean;
    enabled: boolean;
  }>
) {
  const res = await client.query<DocumentAlertRule>(
    `
      UPDATE safety.document_alert_rules
      SET
        rule_name = COALESCE($3, rule_name),
        days_before_expiry = COALESCE($4::integer[], days_before_expiry),
        severity = COALESCE($5, severity),
        notify_email = COALESCE($6, notify_email),
        notify_in_app = COALESCE($7, notify_in_app),
        enabled = COALESCE($8, enabled),
        updated_at = now()
      WHERE id = $2::uuid
        AND operating_company_id = $1::uuid
      RETURNING
        id::text,
        operating_company_id::text,
        document_type,
        rule_name,
        days_before_expiry,
        severity,
        notify_email,
        notify_in_app,
        enabled
    `,
    [
      operatingCompanyId,
      ruleId,
      patch.rule_name ?? null,
      patch.days_before_expiry ?? null,
      patch.severity ?? null,
      patch.notify_email ?? null,
      patch.notify_in_app ?? null,
      patch.enabled ?? null,
    ]
  );
  return res.rows[0] ?? null;
}

export async function listOpenDocumentAlertEvents(client: QueryableClient, operatingCompanyId: string) {
  const res = await client.query(
    `
      SELECT
        e.id::text,
        e.driver_id::text,
        CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
        e.document_type,
        e.source_id,
        e.expiry_date::text,
        e.days_until_expiry,
        e.detection_summary,
        e.event_status,
        e.detected_at::text,
        e.notified_at::text,
        r.rule_name,
        r.severity
      FROM safety.document_alert_events e
      JOIN safety.document_alert_rules r ON r.id = e.rule_id
      LEFT JOIN mdata.drivers d ON d.id = e.driver_id
      WHERE e.operating_company_id = $1::uuid
        AND e.event_status = 'open'
      ORDER BY e.days_until_expiry ASC, e.detected_at DESC
      LIMIT 500
    `,
    [operatingCompanyId]
  );
  return res.rows;
}

async function loadExpiryCandidates(
  client: QueryableClient,
  operatingCompanyId: string,
  documentType: string
): Promise<DocumentExpiryCandidate[]> {
  if (documentType === "cdl") {
    const res = await client.query<DocumentExpiryCandidate>(
      `
        SELECT
          d.id::text AS driver_id,
          CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
          'cdl'::text AS document_type,
          d.id::text AS source_id,
          'CDL'::text AS label,
          d.cdl_expires_at::text AS expiry_date,
          (d.cdl_expires_at - CURRENT_DATE)::int AS days_until_expiry
        FROM mdata.drivers d
        WHERE d.operating_company_id = $1::uuid
          AND d.cdl_expires_at IS NOT NULL
          AND d.deactivated_at IS NULL
      `,
      [operatingCompanyId]
    );
    return res.rows.filter((r) => r.days_until_expiry !== null);
  }

  if (documentType === "medical_card") {
    const res = await client.query<DocumentExpiryCandidate>(
      `
        SELECT
          d.id::text AS driver_id,
          CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
          'medical_card'::text AS document_type,
          COALESCE(mc.id::text, d.id::text) AS source_id,
          'DOT medical card'::text AS label,
          COALESCE(mc.expiry_date, d.dot_medical_expires_at)::text AS expiry_date,
          (COALESCE(mc.expiry_date, d.dot_medical_expires_at) - CURRENT_DATE)::int AS days_until_expiry
        FROM mdata.drivers d
        LEFT JOIN LATERAL (
          SELECT id, expiry_date
          FROM safety.medical_cards
          WHERE driver_id = d.id
            AND operating_company_id = $1::uuid
            AND voided_at IS NULL
          ORDER BY expiry_date DESC
          LIMIT 1
        ) mc ON true
        WHERE d.operating_company_id = $1::uuid
          AND COALESCE(mc.expiry_date, d.dot_medical_expires_at) IS NOT NULL
          AND d.deactivated_at IS NULL
      `,
      [operatingCompanyId]
    );
    return res.rows;
  }

  if (documentType === "training") {
    const res = await client.query<DocumentExpiryCandidate>(
      `
        SELECT
          tr.driver_id::text,
          CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
          'training'::text AS document_type,
          tr.id::text AS source_id,
          tr.training_name AS label,
          tr.expiry_date::text AS expiry_date,
          (tr.expiry_date - CURRENT_DATE)::int AS days_until_expiry
        FROM safety.training_records tr
        JOIN mdata.drivers d ON d.id = tr.driver_id
        WHERE tr.operating_company_id = $1::uuid
          AND tr.expiry_date IS NOT NULL
          AND tr.voided_at IS NULL
          AND d.deactivated_at IS NULL
      `,
      [operatingCompanyId]
    );
    return res.rows;
  }

  if (documentType === "dqf") {
    const res = await client.query<DocumentExpiryCandidate>(
      `
        SELECT
          q.driver_id::text,
          CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
          'dqf'::text AS document_type,
          q.id::text AS source_id,
          q.item_name AS label,
          q.expiry_date::text AS expiry_date,
          (q.expiry_date - CURRENT_DATE)::int AS days_until_expiry
        FROM safety.driver_qualification_files q
        JOIN mdata.drivers d ON d.id = q.driver_id
        WHERE q.operating_company_id = $1::uuid
          AND q.expiry_date IS NOT NULL
          AND q.voided_at IS NULL
          AND d.deactivated_at IS NULL
      `,
      [operatingCompanyId]
    );
    return res.rows;
  }

  if (documentType === "doc_file") {
    const res = await client.query<DocumentExpiryCandidate>(
      `
        SELECT
          fl.entity_id::text AS driver_id,
          CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
          'doc_file'::text AS document_type,
          f.id::text AS source_id,
          COALESCE(f.original_filename, 'Document') AS label,
          f.expiration_date::text AS expiry_date,
          (f.expiration_date - CURRENT_DATE)::int AS days_until_expiry
        FROM docs.file_links fl
        JOIN docs.files f ON f.id = fl.file_id
        JOIN mdata.drivers d ON d.id = fl.entity_id
        WHERE fl.entity_type = 'driver'
          AND fl.deleted_at IS NULL
          AND f.deleted_at IS NULL
          AND f.upload_completed_at IS NOT NULL
          AND f.operating_company_id = $1::uuid
          AND f.expiration_date IS NOT NULL
          AND d.deactivated_at IS NULL
      `,
      [operatingCompanyId]
    );
    return res.rows;
  }

  if (documentType === "permit") {
    const res = await client.query<DocumentExpiryCandidate>(
      `
        SELECT
          NULL::text AS driver_id,
          COALESCE(NULLIF(p.holder_name, ''), p.permit_number, 'Operating permit') AS driver_name,
          'permit'::text AS document_type,
          p.id::text AS source_id,
          COALESCE(p.issuing_state, 'Permit') || ' ' || p.permit_type AS label,
          p.expiry_date::text AS expiry_date,
          (p.expiry_date - CURRENT_DATE)::int AS days_until_expiry
        FROM safety.permits p
        WHERE p.operating_company_id = $1::uuid
          AND p.expiry_date IS NOT NULL
          AND p.archived_at IS NULL
      `,
      [operatingCompanyId]
    );
    return res.rows;
  }

  if (documentType === "hazmat") {
    const res = await client.query<DocumentExpiryCandidate>(
      `
        SELECT
          d.id::text AS driver_id,
          CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
          'hazmat'::text AS document_type,
          d.id::text AS source_id,
          'Hazmat endorsement'::text AS label,
          d.hazmat_endorsement_expires_at::text AS expiry_date,
          (d.hazmat_endorsement_expires_at - CURRENT_DATE)::int AS days_until_expiry
        FROM mdata.drivers d
        WHERE d.operating_company_id = $1::uuid
          AND d.hazmat_endorsement_expires_at IS NOT NULL
          AND d.deactivated_at IS NULL
      `,
      [operatingCompanyId]
    );
    return res.rows;
  }

  return [];
}

async function upsertDocumentAlertEvent(
  client: QueryableClient,
  operatingCompanyId: string,
  rule: DocumentAlertRule,
  candidate: DocumentExpiryCandidate
): Promise<{ inserted: boolean; eventId: string | null }> {
  const summary = `${candidate.label} for ${candidate.driver_name} expires in ${candidate.days_until_expiry} days (${candidate.expiry_date})`;
  const res = await client.query<{ id: string }>(
    `
      INSERT INTO safety.document_alert_events (
        operating_company_id,
        rule_id,
        driver_id,
        document_type,
        source_id,
        subject_key,
        expiry_date,
        days_until_expiry,
        detection_summary,
        detection_metric,
        event_status,
        detected_at
      ) VALUES (
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4,
        $5,
        $6,
        $7::date,
        $8,
        $9,
        $10::jsonb,
        'open',
        now()
      )
      ON CONFLICT (operating_company_id, rule_id, subject_key, days_until_expiry)
      DO UPDATE SET
        detection_summary = EXCLUDED.detection_summary,
        detection_metric = EXCLUDED.detection_metric,
        detected_at = now(),
        updated_at = now(),
        event_status = CASE
          WHEN safety.document_alert_events.event_status = 'resolved' THEN 'open'
          ELSE safety.document_alert_events.event_status
        END
      RETURNING id::text
    `,
    [
      operatingCompanyId,
      rule.id,
      candidate.driver_id ?? null,
      candidate.document_type,
      candidate.source_id,
      subjectKey(candidate),
      candidate.expiry_date,
      candidate.days_until_expiry,
      summary,
      JSON.stringify(candidate),
    ]
  );
  return { inserted: (res.rowCount ?? 0) > 0, eventId: res.rows[0]?.id ?? null };
}

export async function acknowledgeDocumentAlertEvent(
  client: QueryableClient,
  operatingCompanyId: string,
  eventId: string,
  userId: string,
  note?: string | null
) {
  const res = await client.query(
    `
      UPDATE safety.document_alert_events
      SET
        event_status = 'acknowledged',
        acknowledged_by_user_id = $3::uuid,
        acknowledged_at = now(),
        acknowledgment_note = $4,
        updated_at = now()
      WHERE id = $2::uuid
        AND operating_company_id = $1::uuid
        AND event_status = 'open'
      RETURNING id::text
    `,
    [operatingCompanyId, eventId, userId, note ?? null]
  );
  return res.rows[0] ?? null;
}

export async function dispatchDocumentAlertNotifications(
  client: QueryableClient,
  operatingCompanyId: string,
  rule: DocumentAlertRule,
  eventId: string,
  candidate: DocumentExpiryCandidate
) {
  const { createNotification, listCompanyNotifyUserIds } = await import("../notifications/notification.service.js");
  const { sendEmail } = await import("../notifications/email.service.js");

  const severity =
    candidate.days_until_expiry <= 0
      ? "critical"
      : candidate.days_until_expiry <= 7
        ? "high"
        : candidate.days_until_expiry <= 30
          ? "medium"
          : "info";
  const notifType = candidate.days_until_expiry <= 0 ? "compliance_expired" : "compliance_expiring";
  const title = `Driver document: ${candidate.label}`;
  const body = `${candidate.driver_name} — ${candidate.label} expires ${candidate.expiry_date} (${candidate.days_until_expiry} days).`;
  const actionLink = candidate.driver_id
    ? `/drivers/${candidate.driver_id}/profile`
    : `/safety/permits`;

  if (rule.notify_in_app) {
    const userIds = await listCompanyNotifyUserIds(client, operatingCompanyId);
    for (const userId of userIds) {
      await createNotification(
        {
          operating_company_id: operatingCompanyId,
          user_id: userId,
          type: notifType,
          severity,
          title,
          body,
          action_link: actionLink,
          entity_type: "driver",
          entity_id: candidate.driver_id,
          source_block: "a24-9-document-expiry",
        },
        client
      );
    }
  }

  if (rule.notify_email) {
    try {
      await sendEmail({
        to: process.env.DOCUMENT_ALERT_OPS_EMAIL ?? "ops@ih35dispatch.com",
        subject: title,
        html: `<p>${body}</p><p><a href="${actionLink}">Open driver profile</a></p>`,
        sender: "noreply",
        eventClass: "driver.document_expiry",
      });
    } catch {
      /* email best-effort */
    }
  }

  await client.query(
    `
      UPDATE safety.document_alert_events
      SET notified_at = now(), updated_at = now()
      WHERE id = $2::uuid AND operating_company_id = $1::uuid
    `,
    [operatingCompanyId, eventId]
  );
}

export async function evaluateDocumentAlertsForTenant(
  client: QueryableClient,
  operatingCompanyId: string
): Promise<{ rules_scanned: number; events_upserted: number; notifications_sent: number }> {
  const rules = await listDocumentAlertRules(client, operatingCompanyId);
  const enabled = rules.filter((r) => r.enabled);
  let eventsUpserted = 0;
  let notificationsSent = 0;

  for (const rule of enabled) {
    const thresholdSet = new Set((rule.days_before_expiry ?? []).map((d) => Number(d)));
    const candidates = await loadExpiryCandidates(client, operatingCompanyId, rule.document_type);
    for (const candidate of candidates) {
      if (!thresholdSet.has(candidate.days_until_expiry)) continue;
      const { inserted, eventId } = await upsertDocumentAlertEvent(client, operatingCompanyId, rule, candidate);
      if (inserted) eventsUpserted += 1;
      if (eventId && (rule.notify_email || rule.notify_in_app)) {
        const notifyRes = await client.query<{ notified_at: string | null }>(
          `
            SELECT notified_at::text
            FROM safety.document_alert_events
            WHERE id = $2::uuid AND operating_company_id = $1::uuid
          `,
          [operatingCompanyId, eventId]
        );
        if (!notifyRes.rows[0]?.notified_at) {
          await dispatchDocumentAlertNotifications(client, operatingCompanyId, rule, eventId, candidate);
          notificationsSent += 1;
        }
      }
    }
  }

  return { rules_scanned: enabled.length, events_upserted: eventsUpserted, notifications_sent: notificationsSent };
}

export async function runDocumentAlertEngineForTenant(client: QueryableClient, operatingCompanyId: string) {
  return evaluateDocumentAlertsForTenant(client, operatingCompanyId);
}
