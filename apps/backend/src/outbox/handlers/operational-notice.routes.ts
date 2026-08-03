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
  sourceBlock: string;
  title: (p: NoticePayload) => string;
  body: (p: NoticePayload) => string;
  actionLink: (p: NoticePayload) => string;
};

function text(p: NoticePayload, key: string): string | null {
  const v = p[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** A short human label for the subject of the notice — never a bare UUID if something better exists. */
function label(p: NoticePayload, preferredKey: string, idKey: string): string {
  return text(p, preferredKey) ?? text(p, idKey) ?? "(unidentified)";
}

export const NOTICE_ROUTES: NoticeRoute[] = [
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
    actionLink: (p) => `/dispatch/intransit?issue_id=${text(p, "issue_id") ?? ""}`,
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
    actionLink: (p) => `/drivers/liabilities?liability_id=${text(p, "liability_id") ?? ""}`,
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
];
