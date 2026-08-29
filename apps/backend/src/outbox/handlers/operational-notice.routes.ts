/**
 * OPERATIONAL NOTICE ROUTES — the consumers for the events that had none.
 *
 * CONTEXT (prod 2026-08-03, positive control mdata.vendors = 2,828): seven event types were being
 * produced into `outbox.outbox_queue` — a table nothing reads — and had no registered handler either.
 * Repointing them without building consumers would have converted a silent no-op into a failure loop,
 * so the consumers come first. This file is the routing table; operational-notice.handler.ts is the
 * single factory that turns each entry into a registered handler.
 *
 * WHY A TABLE AND NOT SEVEN CLASSES. Every one of these events means the same thing operationally:
 * "something happened that a specific human must know about." Seven hand-written classes would be
 * seven copies of the same recipient-resolution, notification-write and fail-loud logic, and the
 * eighth event would quietly get none of it. A declarative table makes the routing auditable at a
 * glance — which is how NetSuite and McLeod model notification routing — and makes adding an event a
 * one-entry change rather than a new component.
 *
 * WHAT THESE DELIVER, AND WHAT THEY HONESTLY DO NOT. Each writes an in-app notification through
 * notifications.user_notifications — the surface these roles actually see. None of them send email or
 * SMS: no provider is wired for these paths, and claiming delivery through an unwired channel is
 * exactly the silent-success this whole effort is removing.
 *
 * THE DRIVER-REACHABILITY PROBLEM, STATED PLAINLY. Only 6 of 183 drivers (88 active) carry an
 * `identity_user_id`, so a driver-targeted in-app notice reaches almost nobody today. Driver routes
 * therefore resolve the driver's login and, when there is none, notify the operational fallback
 * audience with an explicit "driver could not be reached in-app" line. That converts a hidden data
 * gap into a visible, actionable one instead of a green delivery to no one.
 */

import type { NotificationSeverity } from "../../notifications/notification.service.js";

export type NoticeAudience =
  | { kind: "roles"; roles: string[] }
  | { kind: "driver"; driverIdKey: string; fallbackRoles: string[] };

export type NoticePayload = Record<string, unknown>;

export type NoticeRoute = {
  eventType: string;
  /** Must be a NotificationSeverity: info | low | medium | high | critical. */
  severity: NotificationSeverity;
  /** entity_type written on the notification, for drill-through. */
  entityType: string;
  /** payload key holding the id this notice is about. */
  entityIdKey: string;
  audience: NoticeAudience;
  /** Roles that also receive preference-aware email/SMS delivery through the durable event. */
  multiChannelRoles?: string[];
  sourceBlock: string;
  title: (p: NoticePayload) => string;
  body: (p: NoticePayload) => string;
  actionLink: (p: NoticePayload) => string;
};

function text(p: NoticePayload, key: string): string | null {
  const v = p[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function value(p: NoticePayload, key: string): string | null {
  const v = p[key];
  return typeof v === "number" && Number.isFinite(v) ? String(v) : text(p, key);
}

/** A short human label for the subject of the notice — never a bare UUID if something better exists. */
function label(p: NoticePayload, preferredKey: string, idKey: string): string {
  return text(p, preferredKey) ?? text(p, idKey) ?? "(unidentified)";
}

export const NOTICE_ROUTES: NoticeRoute[] = [
  {
    eventType: "admin.carrier.launched",
    severity: "high",
    entityType: "org.companies",
    entityIdKey: "aggregate_id",
    audience: { kind: "roles", roles: ["Owner"] },
    sourceBlock: "ADMIN-CARRIER-LAUNCHED",
    title: (p) => `Carrier launched — ${label(p, "company_code", "aggregate_id")}`,
    body: (p) => `Carrier ${label(p, "company_code", "aggregate_id")} is now active. Review its launch controls and operating access.`,
    actionLink: () => "/admin/launch-toggles",
  },
  {
    eventType: "admin.carrier.rollback",
    severity: "critical",
    entityType: "org.companies",
    entityIdKey: "aggregate_id",
    audience: { kind: "roles", roles: ["Owner"] },
    sourceBlock: "ADMIN-CARRIER-ROLLBACK",
    title: (p) => `Carrier rolled back — ${label(p, "company_code", "aggregate_id")}`,
    body: (p) => `Carrier ${label(p, "company_code", "aggregate_id")} was rolled back and hidden. Review the recorded reason and operating impact.`,
    actionLink: () => "/admin/launch-toggles",
  },
  {
    eventType: "compliance.drug_alcohol.random_selections_drawn",
    severity: "high",
    entityType: "compliance.drug_alcohol_random_draws",
    entityIdKey: "draw_id",
    audience: { kind: "roles", roles: ["Owner", "Administrator", "Safety", "Manager"] },
    sourceBlock: "COMPLIANCE-DRUG-ALCOHOL-RANDOM-DRAW",
    title: (p) =>
      `Random drug/alcohol draw completed — ${value(p, "year") ?? "?"} Q${value(p, "quarter") ?? "?"}`,
    body: (p) =>
      `${value(p, "selection_count") ?? "0"} drivers were selected for random testing ` +
      `(${value(p, "drug_count") ?? "0"} drug, ${value(p, "alcohol_count") ?? "0"} alcohol). ` +
      `Review the confidential selection roster and arrange testing promptly.`,
    actionLink: () => "/safety/drug-alcohol",
  },
  {
    eventType: "load.abandoned",
    severity: "critical",
    entityType: "mdata.loads",
    entityIdKey: "load_id",
    audience: { kind: "roles", roles: ["Owner", "Administrator", "Dispatcher"] },
    multiChannelRoles: ["Owner", "Administrator"],
    sourceBlock: "LOAD-ABANDONED",
    title: (p) => `Load abandoned — ${label(p, "load_number", "load_id")}`,
    body: (p) =>
      `Load ${label(p, "load_number", "load_id")} was moved to abandoned status. ` +
      `Contact the assigned driver, secure the freight, and record the recovery plan immediately.`,
    actionLink: (p) => `/dispatch?load_id=${text(p, "load_id") ?? ""}`,
  },
  {
    // The canonical PWA helper emits this only when its inbox relation is unavailable. Without a
    // consumer the fail-loud event itself retries forever and nobody learns that driver notices are
    // being lost. Route it to humans who can contact the driver while the PWA surface is repaired.
    eventType: "pwa.driver_notification.undelivered",
    severity: "high",
    entityType: "mdata.drivers",
    entityIdKey: "driver_id",
    audience: { kind: "roles", roles: ["Owner", "Administrator", "Dispatcher"] },
    sourceBlock: "PWA-DRIVER-NOTIFICATION-UNDELIVERED",
    title: (p) => `Driver notification could not be delivered — ${label(p, "driver_name", "driver_id")}`,
    body: (p) =>
      `The driver PWA inbox was unavailable, so this notice was not delivered: ` +
      `${text(p, "title") ?? "Untitled driver notice"}. Contact the driver directly and repair the PWA inbox.`,
    actionLink: (p) => `/drivers/${text(p, "driver_id") ?? ""}`,
  },
  {
    eventType: "load.assigned_to_driver",
    severity: "info",
    entityType: "mdata.loads",
    entityIdKey: "load_id",
    audience: { kind: "driver", driverIdKey: "driver_id", fallbackRoles: ["Dispatcher", "Owner"] },
    sourceBlock: "LOAD-ASSIGNED-TO-DRIVER",
    title: (p) => `New load assigned — ${label(p, "load_number", "load_id")}`,
    body: (p) => `You were assigned load ${label(p, "load_number", "load_id")}. Review the dispatch details before departure.`,
    actionLink: (p) => `/driver?load_id=${text(p, "load_id") ?? ""}`,
  },
  {
    eventType: "load.reassigned_away_from_driver",
    severity: "medium",
    entityType: "mdata.loads",
    entityIdKey: "load_id",
    audience: { kind: "driver", driverIdKey: "driver_id", fallbackRoles: ["Dispatcher", "Owner"] },
    sourceBlock: "LOAD-REASSIGNED-AWAY-FROM-DRIVER",
    title: (p) => `Load reassigned — ${label(p, "load_number", "load_id")}`,
    body: (p) => `Load ${label(p, "load_number", "load_id")} was reassigned to another driver. Stand down unless dispatch tells you otherwise.`,
    actionLink: (p) => `/driver?load_id=${text(p, "load_id") ?? ""}`,
  },
  {
    // Money-adjacent: a packet sitting un-submitted is cash not collected.
    eventType: "dispatch.factoring_packet_assembled",
    severity: "high",
    entityType: "mdata.loads",
    entityIdKey: "load_id",
    audience: { kind: "roles", roles: ["Owner", "Administrator"] },
    sourceBlock: "FACTORING-PACKET-ASSEMBLED",
    title: (p) => `Factoring packet ready — Load ${label(p, "load_number", "load_id")}`,
    body: (p) =>
      `The factoring packet for Load ${label(p, "load_number", "load_id")} has been assembled` +
      `${text(p, "invoice_id") ? ` (invoice ${text(p, "invoice_id")})` : ""} and is ready to submit. ` +
      `Nothing is submitted to the factor automatically — this is a prompt for a human to review and send.`,
    actionLink: (p) => `/factoring?load_id=${text(p, "load_id") ?? ""}`,
  },
  {
    eventType: "fuel.recommendation_sent_to_driver",
    severity: "info",
    entityType: "fuel.route_recommendations",
    entityIdKey: "recommendation_id",
    audience: { kind: "driver", driverIdKey: "driver_id", fallbackRoles: ["Dispatcher", "Owner"] },
    sourceBlock: "FUEL-RECOMMENDATION-SENT",
    title: () => "Fuel stop recommendation",
    body: (p) =>
      `A fuel routing recommendation was issued` +
      `${text(p, "load_id") ? ` for load ${text(p, "load_id")}` : ""}. ` +
      `Review the recommended stop before fuelling — buying off-route costs the company the spread.`,
    actionLink: (p) => `/fuel/planner?recommendation_id=${text(p, "recommendation_id") ?? ""}`,
  },
  {
    // The one genuinely time-critical route in this set.
    eventType: "dispatch.intransit_issue.critical",
    severity: "critical",
    entityType: "dispatch.intransit_issues",
    entityIdKey: "issue_id",
    audience: { kind: "roles", roles: ["Owner", "Dispatcher", "Safety"] },
    sourceBlock: "INTRANSIT-ISSUE-CRITICAL",
    title: (p) => `CRITICAL in-transit issue — Load ${label(p, "load_number", "load_id")}`,
    body: (p) =>
      `A critical in-transit issue was raised on load ${label(p, "load_number", "load_id")}` +
      `${text(p, "issue_type") ? ` (${text(p, "issue_type")})` : ""}. ` +
      `${text(p, "description") ?? "No description was recorded."} Respond now — the truck is moving.`,
    // NOTIFY-F6252 — the registered route is /dispatch/in-transit-issues (InTransitIssuesPage), not
    // /dispatch/intransit; the wrong path silently fell through the router catch-all to "/" on every
    // critical in-transit-issue notification's "Open" click.
    actionLink: (p) => `/dispatch/in-transit-issues?issue_id=${text(p, "issue_id") ?? ""}`,
  },
  {
    // A driver liability the driver has not acknowledged is not collectable with a clean record.
    eventType: "liability.ack_request_sent",
    severity: "medium",
    entityType: "driver_finance.driver_liabilities",
    entityIdKey: "liability_id",
    audience: { kind: "driver", driverIdKey: "driver_id", fallbackRoles: ["Owner", "Administrator"] },
    sourceBlock: "LIABILITY-ACK-REQUESTED",
    title: () => "Acknowledgement requested — driver liability",
    body: (p) =>
      `${text(p, "message") ?? "You have a liability on your account awaiting acknowledgement."} ` +
      `Acknowledging records your agreement; it does not by itself authorise any deduction.`,
    // NOTIFY-F6252 — the registered route is /liabilities (LiabilitiesHomePage), not
    // /drivers/liabilities; the wrong path silently fell through the router catch-all to "/" on
    // every liability-acknowledgement-requested notification's "Open" click.
    actionLink: (p) => `/liabilities?liability_id=${text(p, "liability_id") ?? ""}`,
  },
  {
    eventType: "maintenance.triage.converted_to_wo",
    severity: "info",
    entityType: "maintenance.work_orders",
    entityIdKey: "work_order_id",
    audience: { kind: "roles", roles: ["Owner", "Administrator"] },
    sourceBlock: "TRIAGE-CONVERTED-TO-WO",
    title: (p) => `Work order opened from triage — ${label(p, "work_order_display_id", "work_order_id")}`,
    body: (p) =>
      `An in-transit issue was triaged into a work order` +
      `${text(p, "issue_id") ? ` (from issue ${text(p, "issue_id")})` : ""}. ` +
      `Confirm the unit is scheduled and the cost is expected to land against the right load.`,
    actionLink: (p) => `/maintenance/work-orders?work_order_id=${text(p, "work_order_id") ?? ""}`,
  },
  {
    // Damage has a legal/insurance tail, so Safety is on this one and Administrator is not.
    eventType: "maintenance.triage.converted_to_damage",
    severity: "high",
    entityType: "maintenance.work_orders",
    entityIdKey: "issue_id",
    audience: { kind: "roles", roles: ["Owner", "Safety"] },
    sourceBlock: "TRIAGE-CONVERTED-TO-DAMAGE",
    title: () => "Triage converted to a damage claim",
    body: (p) =>
      `An in-transit issue${text(p, "issue_id") ? ` (${text(p, "issue_id")})` : ""} was triaged as DAMAGE. ` +
      `Damage carries an insurance and legal tail — capture evidence now, while it still exists.`,
    actionLink: (p) => `/maintenance/triage?issue_id=${text(p, "issue_id") ?? ""}`,
  },
  {
    eventType: "load.reassigned",
    severity: "medium",
    entityType: "mdata.loads",
    entityIdKey: "load_id",
    audience: { kind: "roles", roles: ["Owner", "Dispatcher"] },
    sourceBlock: "LOAD-REASSIGNED",
    title: (p) => `Load reassigned — ${label(p, "load_number", "load_id")}`,
    body: (p) =>
      `Load ${label(p, "load_number", "load_id")} was reassigned` +
      `${text(p, "from_driver_id") ? ` from driver ${text(p, "from_driver_id")}` : ""}` +
      `${text(p, "to_driver_id") ? ` to driver ${text(p, "to_driver_id")}` : ""}` +
      `${text(p, "reason_code") ? ` (${text(p, "reason_code")})` : ""}. ` +
      `Confirm the previous driver stood down and the new driver has the instructions.`,
    actionLink: (p) => `/dispatch?load_id=${text(p, "load_id") ?? ""}`,
  },
  {
    // LOAN-09 — a scheduled related-party loan payment is coming due.
    //
    // WHY THIS IS A NOTICE AND NOT A POSTING. The reminder's whole job is to put a human in front of
    // the payment before it is due. QuickBooks, NetSuite and McLeod all separate "a payment is due"
    // (an alert) from "a payment happened" (a posting), and for good reason: a system that posts on the
    // strength of a due date books money that may never have moved. Nothing here touches the ledger.
    //
    // AUDIENCE. Owner + Administrator, not the borrower. These are related-party loans — the
    // counterparty is frequently the owner or someone close to them, so routing the reminder to the
    // borrower alone would mean the only person told about an insider debt is the insider. The
    // borrower-facing prompt is the settlement-time deduct prompt, which is a separate surface.
    eventType: "accounting.related_party_loan.payment_due",
    severity: "high",
    entityType: "accounting.related_party_loan_entries",
    entityIdKey: "loan_id",
    audience: { kind: "roles", roles: ["Owner", "Administrator"] },
    sourceBlock: "LOAN-09-PAYMENT-DUE",
    title: (p) =>
      `Loan payment due ${text(p, "due_date") ?? "soon"} — ${label(p, "counterparty_name", "loan_id")}`,
    body: (p) =>
      `Payment ${text(p, "payment_number") ?? "?"} on the related-party loan with ` +
      `${label(p, "counterparty_name", "loan_id")} is due ${text(p, "due_date") ?? "shortly"}` +
      `${text(p, "payment_amount") ? ` for ${text(p, "payment_amount")}` : ""}` +
      `${text(p, "principal_amount") && text(p, "interest_amount")
        ? ` (${text(p, "principal_amount")} principal + ${text(p, "interest_amount")} interest)`
        : ""}. ` +
      `Nothing is deducted or posted automatically from this reminder — it exists so the payment is ` +
      `not missed. Related-party balances are separately disclosable (ASC 850), so a missed or ` +
      `undocumented payment on this loan is a disclosure problem as well as a cash one.`,
    actionLink: (p) => `/accounting/loans-advances?loan_id=${text(p, "loan_id") ?? ""}`,
  },
];
