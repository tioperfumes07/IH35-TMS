import { apiRequest } from "./client";

function q(operatingCompanyId: string) {
  return `operating_company_id=${encodeURIComponent(operatingCompanyId)}`;
}

export type DocumentAlertEvent = {
  id: string;
  driver_id: string | null;
  driver_name: string;
  document_type: string;
  source_id: string;
  expiry_date: string;
  days_until_expiry: number;
  detection_summary: string;
  event_status: string;
  detected_at: string;
  rule_name: string;
  severity: string;
};

export type DocumentAlertRule = {
  id: string;
  document_type: string;
  rule_name: string;
  days_before_expiry: number[];
  severity: string;
  notify_email: boolean;
  notify_in_app: boolean;
  enabled: boolean;
};

export function getDocumentAlertsInbox(operatingCompanyId: string) {
  return apiRequest<{ events: DocumentAlertEvent[]; pending_count: number }>(
    `/api/v1/drivers/document-alerts/inbox?${q(operatingCompanyId)}`
  );
}

export function getDocumentAlertRules(operatingCompanyId: string) {
  return apiRequest<{ document_alert_rules: DocumentAlertRule[] }>(
    `/api/v1/drivers/document-alert-rules?${q(operatingCompanyId)}`
  );
}

export function updateDocumentAlertRule(
  ruleId: string,
  operatingCompanyId: string,
  body: Partial<{
    rule_name: string;
    days_before_expiry: number[];
    severity: string;
    notify_email: boolean;
    notify_in_app: boolean;
    enabled: boolean;
  }>
) {
  return apiRequest<{ document_alert_rule: DocumentAlertRule }>(
    `/api/v1/drivers/document-alert-rules/${ruleId}?${q(operatingCompanyId)}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

export function acknowledgeDocumentAlert(eventId: string, operatingCompanyId: string, note?: string) {
  return apiRequest<{ event: { id: string } }>(
    `/api/v1/drivers/document-alerts/${eventId}/acknowledge?${q(operatingCompanyId)}`,
    { method: "POST", body: JSON.stringify({ note: note ?? "" }) }
  );
}

export function evaluateDocumentAlerts(operatingCompanyId: string) {
  return apiRequest<{ rules_scanned: number; events_upserted: number; notifications_sent: number }>(
    `/api/v1/drivers/document-alerts/evaluate?${q(operatingCompanyId)}`,
    { method: "POST" }
  );
}
