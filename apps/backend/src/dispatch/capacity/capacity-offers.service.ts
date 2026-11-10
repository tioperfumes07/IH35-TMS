/**
 * CAPACITY OFFERS — the daily available-trucks email (owner 10-26; Lead recommendation accepted 11-10).
 *   • Audience: ONLY customer contacts flagged "Receives truck offers" (mdata.customer_contacts.receives_truck_offers), active,
 *     with an email, of an active customer of the company, and NOT in dispatch.capacity_offer_suppressions (unsubscribe/bounce).
 *   • Lane match: a recipient gets only trucks available in a state where that customer has had a pickup or delivery in the
 *     company's own load history. No matching truck → no email that day (never empty or irrelevant offers).
 *   • 07:00 CT 'morning' digest; 12:30 CT 'change' alert ONLY for trucks new (or moved) since that recipient's morning send.
 *     dispatch.capacity_offer_sends has ONE row per (company, email, day, kind) → at most 2 offer emails per recipient per day.
 *   • Company switch dispatch.capacity_settings.send_truck_offers is OFF by default; nothing sends while it is off.
 *   • Every email carries the company legal name + address + one-click unsubscribe (List-Unsubscribe + List-Unsubscribe-Post).
 * Replies go to dispatch (Reply-To). A person books every load with a rate confirmation — nothing here books anything.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { enqueueEmailWithClient } from "../../email/queue.service.js";
import { canonicalHappenedNotVoidedLoadClause, canonicalRealLoadRowClause } from "../canonical-active-load-set.js";
import { computeCapacity, type CapacityRow, type Queryable } from "./capacity.service.js";

export type OfferKind = "morning" | "change";

/** How far ahead an offer reaches: a truck free more than this many hours from now is not offered yet. */
export const OFFER_HORIZON_HOURS = 96;
export const MAX_OFFER_EMAILS_PER_DAY = 2;

export type OfferRecipient = {
  contact_uuid: string;
  email: string;
  contact_name: string | null;
  customer_id: string;
  customer_name: string | null;
};

export type OfferTruck = {
  unit_id: string;
  unit_number: string;
  city: string;
  state: string;
  available_at: string;
  equipment: string;
};

export type PlannedOffer = { recipient: OfferRecipient; trucks: OfferTruck[] };

/** Pure: trucks a recipient may be offered — offerable, in one of the customer's lane states, inside the horizon. */
export function trucksForRecipient(rows: CapacityRow[], laneStates: ReadonlySet<string>, now: Date): OfferTruck[] {
  const limit = now.getTime() + OFFER_HORIZON_HOURS * 3_600_000;
  return rows
    .filter((r) => r.offerable && r.available_city && r.available_state && r.available_at && r.equipment)
    .filter((r) => laneStates.has(String(r.available_state).trim().toUpperCase()))
    .filter((r) => new Date(String(r.available_at)).getTime() <= limit)
    .map((r) => ({
      unit_id: r.unit_id,
      unit_number: r.unit_number,
      city: String(r.available_city),
      state: String(r.available_state).toUpperCase(),
      available_at: String(r.available_at),
      equipment: String(r.equipment),
    }))
    .sort((a, b) => a.available_at.localeCompare(b.available_at) || a.unit_number.localeCompare(b.unit_number));
}

/** A truck is "the same offer" when the unit, city and state match. */
export function truckKey(t: Pick<OfferTruck, "unit_id" | "city" | "state">): string {
  return `${t.unit_id}|${t.city.trim().toUpperCase()}|${t.state.trim().toUpperCase()}`;
}

/**
 * Pure: plan one kind of send.
 *   morning → every recipient with ≥1 matching truck that has no morning send today.
 *   change  → only trucks NEW (or moved) since that recipient's morning send today, and only if no change send today.
 */
export function planOffers(args: {
  kind: OfferKind;
  recipients: OfferRecipient[];
  laneStatesByCustomer: ReadonlyMap<string, ReadonlySet<string>>;
  capacity: CapacityRow[];
  sentToday: ReadonlyMap<string, { morning?: OfferTruck[]; change?: boolean }>;
  now: Date;
}): PlannedOffer[] {
  const out: PlannedOffer[] = [];
  for (const recipient of args.recipients) {
    const lanes = args.laneStatesByCustomer.get(recipient.customer_id);
    if (!lanes || lanes.size === 0) continue;
    const sent = args.sentToday.get(recipient.email.trim().toLowerCase());
    let trucks = trucksForRecipient(args.capacity, lanes, args.now);
    if (args.kind === "morning") {
      if (sent?.morning) continue;
    } else {
      if (sent?.change) continue;
      const seen = new Set((sent?.morning ?? []).map(truckKey));
      trucks = trucks.filter((t) => !seen.has(truckKey(t)));
    }
    if (trucks.length === 0) continue;
    out.push({ recipient, trucks });
  }
  return out;
}

const CT = "America/Chicago";

export function availableLabel(iso: string, now: Date): string {
  const at = new Date(iso);
  if (at.getTime() <= now.getTime()) return "Available now";
  const day = at.toLocaleDateString("en-US", { timeZone: CT, weekday: "short", month: "short", day: "numeric" });
  const time = at.toLocaleTimeString("en-US", { timeZone: CT, hour: "numeric", minute: "2-digit" });
  return `${day}, ${time} CT`;
}

/** e.g. "USMCA Freight — 4 trucks available Tue–Thu (Chicago, Dallas, Laredo)". */
export function offerSubject(companyShortName: string, trucks: OfferTruck[], kind: OfferKind, now: Date): string {
  const days = [...new Set(trucks.map((t) => {
    const at = new Date(t.available_at);
    const d = at.getTime() <= now.getTime() ? now : at;
    return d.toLocaleDateString("en-US", { timeZone: CT, weekday: "short" });
  }))];
  const dayLabel = days.length > 1 ? `${days[0]}–${days[days.length - 1]}` : days[0];
  const cities = [...new Set(trucks.map((t) => t.city))].slice(0, 3).join(", ");
  const n = trucks.length;
  const lead = kind === "change" ? "Just opened: " : "";
  return `${companyShortName} — ${lead}${n} truck${n === 1 ? "" : "s"} available ${dayLabel} (${cities})`;
}

// ---------------------------------------------------------------- unsubscribe token (HMAC, no expiry: an unsubscribe link
// must keep working). Token = base64url("<companyId>|<email>") + "." + base64url(hmac).
function unsubscribeSecret(): string {
  const s = String(process.env.CAPACITY_UNSUBSCRIBE_SECRET ?? "").trim();
  if (s.length < 16) throw new Error("capacity_unsubscribe_secret_missing: set CAPACITY_UNSUBSCRIBE_SECRET (>=16 chars)");
  return s;
}

export function signUnsubscribeToken(operatingCompanyId: string, email: string, secret = unsubscribeSecret()): string {
  const payload = Buffer.from(`${operatingCompanyId}|${email.trim().toLowerCase()}`, "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyUnsubscribeToken(token: string, secret = unsubscribeSecret()): { operatingCompanyId: string; email: string } | null {
  const [payload, sig] = String(token ?? "").split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [operatingCompanyId, email] = Buffer.from(payload, "base64url").toString("utf8").split("|");
  if (!operatingCompanyId || !email) return null;
  return { operatingCompanyId, email };
}

/**
 * The unsubscribe route lives on the API host (the web host is a static SPA that rewrites every path to index.html).
 * Production API host per render.yaml VITE_API_BASE_URL = https://api.ih35dispatch.com; API_PUBLIC_BASE_URL overrides.
 */
export const DEFAULT_API_PUBLIC_BASE_URL = "https://api.ih35dispatch.com";
export function unsubscribeUrl(token: string): string {
  const base = String(process.env.API_PUBLIC_BASE_URL ?? DEFAULT_API_PUBLIC_BASE_URL).trim().replace(/\/+$/, "");
  return `${base}/api/v1/public/capacity/unsubscribe?t=${encodeURIComponent(token)}`;
}

/** Record an unsubscribe (idempotent). Caller runs under the lucia bypass (public route, no user). */
export async function recordUnsubscribe(client: Queryable, operatingCompanyId: string, email: string): Promise<void> {
  await client.query(
    `INSERT INTO dispatch.capacity_offer_suppressions (operating_company_id, email_lower, reason)
     VALUES ($1::uuid, lower(btrim($2)), 'unsubscribe')
     ON CONFLICT (operating_company_id, email_lower) DO NOTHING`,
    [operatingCompanyId, email]
  );
}

// ---------------------------------------------------------------- readers (caller sets company scope or lucia bypass)
export type CapacitySettings = { send_truck_offers: boolean; reply_to_email: string | null };

export async function readCapacitySettings(client: Queryable, operatingCompanyId: string): Promise<CapacitySettings> {
  const res = await client.query<CapacitySettings>(
    `SELECT send_truck_offers, reply_to_email FROM dispatch.capacity_settings WHERE operating_company_id = $1::uuid`,
    [operatingCompanyId]
  );
  return res.rows[0] ?? { send_truck_offers: false, reply_to_email: null };
}

export async function listOfferRecipients(client: Queryable, operatingCompanyId: string): Promise<OfferRecipient[]> {
  const res = await client.query<OfferRecipient>(
    `SELECT cc.uuid::text AS contact_uuid, btrim(cc.email) AS email, NULLIF(btrim(cc.name), '') AS contact_name,
            c.id::text AS customer_id, c.customer_name
       FROM mdata.customer_contacts cc
       JOIN mdata.customers c ON c.id = cc.customer_uuid AND c.operating_company_id = $1::uuid
      WHERE cc.receives_truck_offers
        AND cc.deactivated_at IS NULL AND c.deactivated_at IS NULL
        AND btrim(coalesce(cc.email, '')) ~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'
        AND NOT EXISTS (
          SELECT 1 FROM dispatch.capacity_offer_suppressions sp
           WHERE sp.operating_company_id = $1::uuid AND sp.email_lower = lower(btrim(cc.email))
        )
      ORDER BY c.customer_name, cc.name`,
    [operatingCompanyId]
  );
  return res.rows;
}

/** States where each customer had a pickup or delivery in this company's real load history. */
export async function readLaneStatesByCustomer(
  client: Queryable,
  operatingCompanyId: string,
  customerIds: string[]
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (customerIds.length === 0) return out;
  const res = await client.query<{ customer_id: string; state: string }>(
    `SELECT DISTINCT l.customer_id::text AS customer_id, upper(btrim(COALESCE(NULLIF(s.state, ''), loc.state))) AS state
       FROM mdata.loads l
       JOIN mdata.load_stops s ON s.load_id = l.id AND s.soft_deleted_at IS NULL
       LEFT JOIN mdata.locations loc ON loc.id = s.location_id AND loc.operating_company_id = $1::uuid
      WHERE l.operating_company_id = $1::uuid AND l.customer_id = ANY($2::uuid[])
        AND ${canonicalHappenedNotVoidedLoadClause("l")} AND ${canonicalRealLoadRowClause("l")}
        AND btrim(COALESCE(NULLIF(s.state, ''), loc.state, '')) <> ''`,
    [operatingCompanyId, customerIds]
  );
  for (const r of res.rows) {
    if (!out.has(r.customer_id)) out.set(r.customer_id, new Set());
    out.get(r.customer_id)!.add(r.state);
  }
  return out;
}

/** Today's (CT) sends keyed by lower(email): the morning truck snapshot and whether a change alert went. */
export async function readSentToday(client: Queryable, operatingCompanyId: string, sendDate: string) {
  const res = await client.query<{ email: string; kind: OfferKind; units: OfferTruck[] }>(
    `SELECT lower(email) AS email, kind, units FROM dispatch.capacity_offer_sends
      WHERE operating_company_id = $1::uuid AND send_date = $2::date`,
    [operatingCompanyId, sendDate]
  );
  const out = new Map<string, { morning?: OfferTruck[]; change?: boolean }>();
  for (const r of res.rows) {
    const e = out.get(r.email) ?? {};
    if (r.kind === "morning") e.morning = r.units ?? [];
    else e.change = true;
    out.set(r.email, e);
  }
  return out;
}

export function centralDate(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: CT }); // YYYY-MM-DD
}

export type CompanyFooter = { legal_name: string; short_name: string; address: string; mc: string | null; dot: string | null };

export async function readCompanyFooter(client: Queryable, operatingCompanyId: string): Promise<CompanyFooter> {
  const res = await client.query<{
    legal_name: string | null; short_name: string | null; address_line1: string | null; address_line2: string | null;
    city: string | null; state: string | null; postal_code: string | null; mc_number: string | null; usdot_number: string | null;
  }>(
    `SELECT legal_name, short_name, address_line1, address_line2, city, state, postal_code, mc_number, usdot_number
       FROM org.companies WHERE id = $1::uuid`,
    [operatingCompanyId]
  );
  const c = res.rows[0];
  const legal = c?.legal_name?.trim();
  const street = [c?.address_line1, c?.address_line2].map((v) => v?.trim()).filter(Boolean).join(", ");
  const cityLine = [c?.city?.trim(), [c?.state?.trim(), c?.postal_code?.trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const address = [street, cityLine].filter(Boolean).join(", ");
  // A commercial email must carry the sender's legal name and physical address — refuse rather than send without them.
  if (!legal || !address) throw new Error("capacity_offers_company_footer_incomplete: org.companies legal_name/address missing");
  return { legal_name: legal, short_name: c?.short_name?.trim() || legal, address, mc: c?.mc_number ?? null, dot: c?.usdot_number ?? null };
}

/** The template vars of one offer email — ONE builder for the send and the "Preview today's email" drawer. */
export function buildOfferTemplateVars(args: {
  recipient: OfferRecipient; trucks: OfferTruck[]; kind: OfferKind; footer: CompanyFooter; unsubscribeUrl: string; now: Date;
}): Record<string, unknown> {
  const { recipient, trucks, kind, footer, now } = args;
  return {
    contactName: recipient.contact_name,
    intro: kind === "change"
      ? "These trucks just opened up near lanes you run with us:"
      : "Here are our trucks available near lanes you run with us:",
    trucks: trucks.map((t) => ({ unitNumber: t.unit_number, city: t.city, state: t.state, equipment: t.equipment, availableLabel: availableLabel(t.available_at, now) })),
    companyLegalName: footer.legal_name,
    companyAddress: footer.address,
    companyMc: footer.mc,
    companyDot: footer.dot,
    unsubscribeUrl: args.unsubscribeUrl,
  };
}

export type RunOffersResult =
  | { status: "switch_off" }
  | { status: "ran"; kind: OfferKind; planned: number; queued: number; skipped_already_sent: number };

/**
 * Plan and queue one kind of send for one company. `client` runs under the lucia bypass with the company GUC set (cron)
 * or the caller's scope (preview with dryRun). dryRun returns the plan and writes nothing.
 */
export async function runCapacityOffers(
  client: Queryable,
  operatingCompanyId: string,
  kind: OfferKind,
  now: Date = new Date(),
  opts: { dryRun?: boolean } = {}
): Promise<RunOffersResult & { plan?: PlannedOffer[] }> {
  const settings = await readCapacitySettings(client, operatingCompanyId);
  const capacity = await computeCapacity(client, operatingCompanyId);
  const recipients = await listOfferRecipients(client, operatingCompanyId);
  const lanes = await readLaneStatesByCustomer(client, operatingCompanyId, [...new Set(recipients.map((r) => r.customer_id))]);
  const sendDate = centralDate(now);
  const sentToday = await readSentToday(client, operatingCompanyId, sendDate);
  const plan = planOffers({ kind, recipients, laneStatesByCustomer: lanes, capacity, sentToday, now });
  if (opts.dryRun) return { status: "ran", kind, planned: plan.length, queued: 0, skipped_already_sent: 0, plan };
  if (!settings.send_truck_offers) return { status: "switch_off" };

  const footer = await readCompanyFooter(client, operatingCompanyId);
  const replyTo = settings.reply_to_email?.trim() || String(process.env.EMAIL_FROM_DISPATCH ?? "").trim() || null;
  let queued = 0;
  let skipped = 0;
  for (const { recipient, trucks } of plan) {
    // Claim first: the unique (company, email, day, kind) index makes this the single-send / 2-per-day control.
    const claim = await client.query<{ id: string }>(
      `INSERT INTO dispatch.capacity_offer_sends
         (operating_company_id, customer_id, contact_uuid, email, kind, send_date, units)
       VALUES ($1::uuid, $2::uuid, $3::uuid, btrim($4), $5, $6::date, $7::jsonb)
       ON CONFLICT DO NOTHING RETURNING id::text`,
      [operatingCompanyId, recipient.customer_id, recipient.contact_uuid, recipient.email, kind, sendDate, JSON.stringify(trucks)]
    );
    const sendId = claim.rows[0]?.id;
    if (!sendId) { skipped += 1; continue; }
    const token = signUnsubscribeToken(operatingCompanyId, recipient.email);
    const unsubUrl = unsubscribeUrl(token);
    const subject = offerSubject(footer.short_name, trucks, kind, now);
    const { queueId } = await enqueueEmailWithClient(client, {
      operatingCompanyId,
      toAddresses: [recipient.email],
      subject,
      templateKey: "capacity-offer",
      templateVars: buildOfferTemplateVars({ recipient, trucks, kind, footer, unsubscribeUrl: unsubUrl, now }),
      replyTo,
      headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    await client.query(`UPDATE dispatch.capacity_offer_sends SET email_queue_id = $2::uuid WHERE id = $1::uuid`, [sendId, queueId]);
    queued += 1;
  }
  return { status: "ran", kind, planned: plan.length, queued, skipped_already_sent: skipped };
}
