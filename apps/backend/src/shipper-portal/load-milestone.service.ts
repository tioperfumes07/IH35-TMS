import path from "node:path";
import { fileURLToPath } from "node:url";
import { Eta } from "eta";
import { sendEmail } from "../notifications/email.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type MilestoneType =
  | "tendered"
  | "accepted"
  | "dispatched"
  | "en_route_to_pickup"
  | "arrived_at_pickup"
  | "loaded"
  | "en_route_to_delivery"
  | "arrived_at_delivery"
  | "unloaded"
  | "delivered"
  | "pod_uploaded"
  | "invoiced";

const LOAD_STATUS_TO_MILESTONES: Record<string, MilestoneType[]> = {
  assigned: ["accepted"],
  dispatched: ["dispatched"],
  at_pickup: ["arrived_at_pickup"],
  in_transit: ["loaded", "en_route_to_delivery"],
  at_delivery: ["arrived_at_delivery"],
  delivered: ["unloaded", "delivered"],
  invoiced: ["invoiced"],
  paid: ["invoiced"],
  closed: ["invoiced"],
};

const MILESTONE_ORDER: MilestoneType[] = [
  "tendered",
  "accepted",
  "dispatched",
  "en_route_to_pickup",
  "arrived_at_pickup",
  "loaded",
  "en_route_to_delivery",
  "arrived_at_delivery",
  "unloaded",
  "delivered",
  "pod_uploaded",
  "invoiced",
];

const templatesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../email/templates");
const eta = new Eta({ views: templatesDir, cache: process.env.NODE_ENV === "production" });

function getFrontendBaseUrl(): string {
  return (process.env.FRONTEND_BASE_URL || "https://app.ih35dispatch.com").replace(/\/$/, "");
}

function portalTrackingUrl(loadId: string): string {
  return `${getFrontendBaseUrl()}/portal/loads/${encodeURIComponent(loadId)}`;
}

function templateKeyForMilestone(type: MilestoneType): string | null {
  if (type === "dispatched") return "portal-dispatched";
  if (type === "arrived_at_pickup") return "portal-arrived-pickup";
  if (type === "delivered") return "portal-delivered";
  if (type === "pod_uploaded") return "portal-pod-available";
  return null;
}

function shouldNotify(user: {
  notify_on_dispatch: boolean;
  notify_on_arrival: boolean;
  notify_on_delivery: boolean;
  notify_on_pod: boolean;
}, type: MilestoneType): boolean {
  if (type === "dispatched") return user.notify_on_dispatch;
  if (type === "arrived_at_pickup" || type === "arrived_at_delivery") return user.notify_on_arrival;
  if (type === "delivered") return user.notify_on_delivery;
  if (type === "pod_uploaded") return user.notify_on_pod;
  return false;
}

export async function recordMilestone(
  client: DbClient,
  input: {
    operating_company_id: string;
    load_id: string;
    milestone_type: MilestoneType;
    occurred_at?: string;
    notes?: string | null;
    auto_generated?: boolean;
    created_by_user_id?: string | null;
  }
): Promise<{ id: string; created: boolean }> {
  const res = await client.query<{ id: string }>(
    `
      INSERT INTO shipper_portal.load_milestones (
        operating_company_id, load_id, milestone_type, occurred_at, notes, auto_generated, created_by_user_id
      )
      VALUES ($1::uuid, $2::uuid, $3, COALESCE($4::timestamptz, NOW()), $5, $6, $7::uuid)
      ON CONFLICT (load_id, milestone_type) DO NOTHING
      RETURNING id::text
    `,
    [
      input.operating_company_id,
      input.load_id,
      input.milestone_type,
      input.occurred_at ?? null,
      input.notes ?? null,
      input.auto_generated ?? false,
      input.created_by_user_id ?? null,
    ]
  );
  const row = res.rows[0];
  return { id: row?.id ?? "", created: Boolean(row?.id) };
}

export async function syncMilestonesFromLoadStatus(
  client: DbClient,
  input: { operating_company_id: string; load_id: string; status: string; updated_at?: string | null }
): Promise<void> {
  const types = LOAD_STATUS_TO_MILESTONES[input.status] ?? [];
  for (const milestone_type of types) {
    await recordMilestone(client, {
      operating_company_id: input.operating_company_id,
      load_id: input.load_id,
      milestone_type,
      occurred_at: input.updated_at ?? undefined,
      auto_generated: true,
    });
  }
}

export async function ensurePodMilestone(
  client: DbClient,
  input: { operating_company_id: string; load_id: string }
): Promise<void> {
  const podRes = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM documents.attachments
      WHERE operating_company_id = $1::uuid
        AND entity_type = 'load'
        AND entity_id = $2::uuid
        AND category = 'pod'
        AND is_deleted = false
      LIMIT 1
    `,
    [input.operating_company_id, input.load_id]
  );
  if (!podRes.rows[0]) return;
  await recordMilestone(client, {
    operating_company_id: input.operating_company_id,
    load_id: input.load_id,
    milestone_type: "pod_uploaded",
    auto_generated: true,
  });
}

export async function processPendingMilestoneEmails(client: DbClient, input: { load_id: string; customer_id: string }): Promise<void> {
  const usersRes = await client.query<{
    id: string;
    email: string;
    notify_on_dispatch: boolean;
    notify_on_arrival: boolean;
    notify_on_delivery: boolean;
    notify_on_pod: boolean;
  }>(
    `
      SELECT id::text, email, notify_on_dispatch, notify_on_arrival, notify_on_delivery, notify_on_pod
      FROM shipper_portal.portal_users
      WHERE customer_id = $1::uuid
        AND active = TRUE
        AND archived_at IS NULL
    `,
    [input.customer_id]
  );
  if (usersRes.rows.length === 0) return;

  const loadRes = await client.query<{
    load_number: string;
    pickup_city: string | null;
    pickup_state: string | null;
    delivery_city: string | null;
    delivery_state: string | null;
  }>(
    `
      SELECT
        l.load_number,
        sp.city AS pickup_city,
        sp.state AS pickup_state,
        sd.city AS delivery_city,
        sd.state AS delivery_state
      FROM mdata.loads l
      LEFT JOIN LATERAL (
        SELECT city, state FROM mdata.load_stops WHERE load_id = l.id AND stop_type = 'pickup' ORDER BY sequence_number ASC LIMIT 1
      ) sp ON true
      LEFT JOIN LATERAL (
        SELECT city, state FROM mdata.load_stops WHERE load_id = l.id AND stop_type = 'delivery' ORDER BY sequence_number DESC LIMIT 1
      ) sd ON true
      WHERE l.id = $1::uuid
      LIMIT 1
    `,
    [input.load_id]
  );
  const load = loadRes.rows[0];
  if (!load) return;

  const routeLabel = [load.pickup_city, load.pickup_state].filter(Boolean).join(", ") + " → " + [load.delivery_city, load.delivery_state].filter(Boolean).join(", ");
  const trackingUrl = portalTrackingUrl(input.load_id);

  const pendingRes = await client.query<{ id: string; milestone_type: MilestoneType }>(
    `
      SELECT id::text, milestone_type
      FROM shipper_portal.load_milestones
      WHERE load_id = $1::uuid
        AND email_notified_at IS NULL
        AND milestone_type IN ('dispatched', 'arrived_at_pickup', 'delivered', 'pod_uploaded')
    `,
    [input.load_id]
  );

  for (const milestone of pendingRes.rows) {
    const templateKey = templateKeyForMilestone(milestone.milestone_type);
    if (!templateKey) continue;

    for (const user of usersRes.rows) {
      if (!shouldNotify(user, milestone.milestone_type)) continue;
      const title = `Load ${load.load_number} update`;
      const html = eta.render(templateKey, {
        title,
        loadNumber: load.load_number,
        route: routeLabel,
        trackingUrl,
        etaNote: "Check the portal for live ETA.",
      });
      try {
        await sendEmail({
          to: user.email,
          subject: title,
          html,
          sender: "noreply",
          eventClass: `shipper_portal.milestone.${milestone.milestone_type}`,
          recipientUserUuid: null,
          actorUserId: null,
          tags: [
            { name: "type", value: "shipper_portal_milestone" },
            { name: "load_id", value: input.load_id },
            { name: "milestone", value: milestone.milestone_type },
          ],
        });
      } catch {
        // best-effort; leave email_notified_at null for retry
        continue;
      }
    }

    await client.query(
      `UPDATE shipper_portal.load_milestones SET email_notified_at = NOW() WHERE id = $1::uuid`,
      [milestone.id]
    );
  }
}

export function sortMilestones<T extends { milestone_type: string; occurred_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ai = MILESTONE_ORDER.indexOf(a.milestone_type as MilestoneType);
    const bi = MILESTONE_ORDER.indexOf(b.milestone_type as MilestoneType);
    if (ai !== bi) return ai - bi;
    return new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime();
  });
}
