import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  type: z.enum(["drivers", "assets"]),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

function canAccess(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function normalizePhoneDigits(raw: string | null | undefined) {
  return String(raw ?? "").replace(/\D/g, "");
}

function last4Phone(raw: string | null | undefined) {
  const digits = normalizePhoneDigits(raw);
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      if (a[i - 1] === b[j - 1]) dp[j] = prev;
      else dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function normalizeLabel(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

type VendorRow = {
  qbo_vendor_qbo_id: string;
  display_name: string;
  company_name: string | null;
  primary_phone: string | null;
  tax_id: string | null;
};

type ClassRow = {
  qbo_class_qbo_id: string;
  display_name: string;
};

type Match = {
  id: string;
  confidence: number;
  method: "exact" | "levenshtein" | "tax_id" | "phone" | "trgm";
};

function pickBetter(current: Match | null, next: Match | null): Match | null {
  if (!next) return current;
  if (!current) return next;
  if (next.confidence > current.confidence) return next;
  return current;
}

function bestVendorMatch(label: string, driverPhone: string | null, vendors: VendorRow[]): Match | null {
  const normLabel = normalizeLabel(label);
  let best: Match | null = null;
  const driverLast4 = last4Phone(driverPhone);

  for (const v of vendors) {
    const candidates = [v.display_name, v.company_name].filter(Boolean).map((x) => String(x));
    for (const cand of candidates) {
      const normCand = normalizeLabel(cand);
      if (!normCand.length) continue;
      if (normLabel === normCand) {
        best = pickBetter(best, { id: v.qbo_vendor_qbo_id, confidence: 1, method: "exact" });
        continue;
      }
      const dist = levenshtein(normLabel, normCand);
      if (dist <= 3) {
        const confidence = Math.max(0, 0.8 - dist * 0.05);
        best = pickBetter(best, { id: v.qbo_vendor_qbo_id, confidence, method: "levenshtein" });
      }
    }

    const vendorLast4 = last4Phone(v.primary_phone);
    if (driverLast4 && vendorLast4 && driverLast4 === vendorLast4) {
      best = pickBetter(best, { id: v.qbo_vendor_qbo_id, confidence: 0.7, method: "phone" });
    }
  }

  return best;
}

function bestClassMatch(label: string, classes: ClassRow[]): Match | null {
  const normLabel = normalizeLabel(label);
  let best: Match | null = null;
  for (const c of classes) {
    const normCand = normalizeLabel(c.display_name);
    if (!normCand.length) continue;
    if (normLabel === normCand) {
      best = pickBetter(best, { id: c.qbo_class_qbo_id, confidence: 1, method: "exact" });
      continue;
    }
    const dist = levenshtein(normLabel, normCand);
    if (dist <= 3) {
      const confidence = Math.max(0, 0.8 - dist * 0.05);
      best = pickBetter(best, { id: c.qbo_class_qbo_id, confidence, method: "levenshtein" });
    }
  }

  return best;
}

function bestAssetVendorMatch(tokens: string[], vendors: VendorRow[]): Match | null {
  let best: Match | null = null;
  const cleanedTokens = tokens.map(normalizeLabel).filter(Boolean);
  for (const v of vendors) {
    const blobs = [v.display_name, v.company_name].filter(Boolean).map((x) => normalizeLabel(String(x)));
    for (const blob of blobs) {
      for (const tok of cleanedTokens) {
        if (!tok.length) continue;
        if (blob.includes(tok) || tok.includes(blob)) {
          best = pickBetter(best, { id: v.qbo_vendor_qbo_id, confidence: 0.85, method: "trgm" });
        }
        const dist = levenshtein(tok, blob);
        if (dist <= 3) {
          const confidence = Math.max(0, 0.75 - dist * 0.05);
          best = pickBetter(best, { id: v.qbo_vendor_qbo_id, confidence, method: "levenshtein" });
        }
      }
    }
  }
  return best;
}

export async function registerQboUnlinkedEntitiesRoutes(app: FastifyInstance) {
  app.get("/api/v1/qbo/unlinked-entities", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccess(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const oc = parsed.data.operating_company_id;

    const payload = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [oc]);

      const vendorRes = await client.query<VendorRow>(
        `
          SELECT
            v.qbo_id AS qbo_vendor_qbo_id,
            v.display_name,
            v.company_name,
            v.primary_phone,
            NULLIF(trim(v.payload_json->>'TaxIdentifier'), '') AS tax_id
          FROM mdata.qbo_vendors v
          WHERE v.operating_company_id = $1::uuid
            AND v.active = true
          ORDER BY v.display_name ASC
          LIMIT 2000
        `,
        [oc]
      );
      const vendors = vendorRes.rows;

      const classRes = await client.query<ClassRow>(
        `
          SELECT DISTINCT ON (c.qbo_class_id)
            c.qbo_class_id AS qbo_class_qbo_id,
            c.class_name AS display_name
          FROM catalogs.classes c
          WHERE c.qbo_class_id IS NOT NULL
            AND trim(c.qbo_class_id) <> ''
            AND c.deactivated_at IS NULL
          ORDER BY c.qbo_class_id, c.updated_at DESC
          LIMIT 2000
        `
      );
      const classes = classRes.rows;

      const entities: Array<{
        id: string;
        name: string;
        suggested_qbo_vendor_id: string | null;
        suggested_qbo_class_id: string | null;
        match_confidence: number;
        match_method: "exact" | "levenshtein" | "tax_id" | "phone" | "trgm" | null;
      }> = [];

      if (parsed.data.type === "drivers") {
        const res = await client.query<{
          id: string;
          full_name: string;
          phone: string | null;
          qbo_vendor_id: string | null;
          qbo_class_id: string | null;
        }>(
          `
            SELECT
              id,
              trim(both ' ' FROM concat_ws(' ', first_name, last_name)) AS full_name,
              phone,
              qbo_vendor_id,
              qbo_class_id
            FROM mdata.drivers
            WHERE operating_company_id = $1::uuid
              AND deactivated_at IS NULL
              AND (
                qbo_vendor_id IS NULL OR trim(qbo_vendor_id) = ''
                OR qbo_class_id IS NULL OR trim(qbo_class_id) = ''
              )
            ORDER BY last_name, first_name
            LIMIT 500
          `,
          [oc]
        );

        for (const row of res.rows) {
          const needVendor = !row.qbo_vendor_id || String(row.qbo_vendor_id).trim() === "";
          const needClass = !row.qbo_class_id || String(row.qbo_class_id).trim() === "";

          const vMatch = needVendor ? bestVendorMatch(row.full_name, row.phone, vendors) : null;
          const cMatch = needClass ? bestClassMatch(row.full_name, classes) : null;

          const scored = [vMatch, cMatch].filter((m): m is Match => Boolean(m));
          const top = scored.sort((a, b) => b.confidence - a.confidence)[0] ?? null;

          entities.push({
            id: row.id,
            name: row.full_name,
            suggested_qbo_vendor_id: vMatch?.id ?? null,
            suggested_qbo_class_id: cMatch?.id ?? null,
            match_confidence: top?.confidence ?? 0,
            match_method: top?.method ?? null,
          });
        }
      } else {
        const units = await client.query<{
          id: string;
          label: string;
          qbo_vendor_id: string | null;
          qbo_class_id: string | null;
        }>(
          `
            SELECT
              id,
              trim(both ' ' FROM concat_ws(' ', unit_number, vin, license_plate)) AS label,
              qbo_vendor_id,
              qbo_class_id
            FROM mdata.units
            WHERE (owner_company_id = $1::uuid OR currently_leased_to_company_id = $1::uuid)
              AND deactivated_at IS NULL
              AND (
                qbo_vendor_id IS NULL OR trim(qbo_vendor_id) = ''
                OR qbo_class_id IS NULL OR trim(qbo_class_id) = ''
              )
            ORDER BY unit_number
            LIMIT 500
          `,
          [oc]
        );

        for (const row of units.rows) {
          const tokens = row.label.split(/\s+/).filter(Boolean);
          const needVendor = !row.qbo_vendor_id || String(row.qbo_vendor_id).trim() === "";
          const needClass = !row.qbo_class_id || String(row.qbo_class_id).trim() === "";
          const vMatch = needVendor ? bestAssetVendorMatch(tokens, vendors) : null;
          const cMatch = needClass ? bestClassMatch(row.label, classes) : null;
          const scored = [vMatch, cMatch].filter((m): m is Match => Boolean(m));
          const top = scored.sort((a, b) => b.confidence - a.confidence)[0] ?? null;
          entities.push({
            id: row.id,
            name: row.label,
            suggested_qbo_vendor_id: vMatch?.id ?? null,
            suggested_qbo_class_id: cMatch?.id ?? null,
            match_confidence: top?.confidence ?? 0,
            match_method: top?.method ?? null,
          });
        }

        const equip = await client.query<{
          id: string;
          label: string;
          qbo_vendor_id: string | null;
          qbo_class_id: string | null;
        }>(
          `
            SELECT
              id,
              trim(both ' ' FROM concat_ws(' ', equipment_number, vin, license_plate)) AS label,
              qbo_vendor_id,
              qbo_class_id
            FROM mdata.equipment
            WHERE (owner_company_id = $1::uuid OR currently_leased_to_company_id = $1::uuid)
              AND deactivated_at IS NULL
              AND (
                qbo_vendor_id IS NULL OR trim(qbo_vendor_id) = ''
                OR qbo_class_id IS NULL OR trim(qbo_class_id) = ''
              )
            ORDER BY equipment_number
            LIMIT 500
          `,
          [oc]
        );

        for (const row of equip.rows) {
          const tokens = row.label.split(/\s+/).filter(Boolean);
          const needVendor = !row.qbo_vendor_id || String(row.qbo_vendor_id).trim() === "";
          const needClass = !row.qbo_class_id || String(row.qbo_class_id).trim() === "";
          const vMatch = needVendor ? bestAssetVendorMatch(tokens, vendors) : null;
          const cMatch = needClass ? bestClassMatch(row.label, classes) : null;
          const scored = [vMatch, cMatch].filter((m): m is Match => Boolean(m));
          const top = scored.sort((a, b) => b.confidence - a.confidence)[0] ?? null;
          entities.push({
            id: row.id,
            name: row.label,
            suggested_qbo_vendor_id: vMatch?.id ?? null,
            suggested_qbo_class_id: cMatch?.id ?? null,
            match_confidence: top?.confidence ?? 0,
            match_method: top?.method ?? null,
          });
        }
      }

      return { entities };
    });

    return payload;
  });
}
