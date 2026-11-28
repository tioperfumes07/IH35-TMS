/**
 * PERFUME — concentration check (owner 2026-11-27 20:59 CT: "NIGHT DIVE WILL BE EDT … ON SETS, COMPARE TO ALL LISTS AND LIST THOSE.
 * MOST ARE EDT."). Items with no concentration on file that ARE fragrances (regular bottles, sets, testers, minis, samples, no type)
 * are compared with every list: (1) the same fragrance on another item that carries a concentration — same brand, same name once
 * spaces, punctuation and set / tester / pc words are taken out (same size counted first) — and (2) the vendors' own lines linked to
 * the item that spell it (EDT, EAU DE TOILETTE, EDP …). The screen lists each item with what the lists say and how many agree; the
 * owner applies the ones he accepts through the item file's bulk edit (history per item). Nothing is written here.
 * Not fragrances (owner: body mists, roll-ons, fresheners, pens, bags, pouches, deodorants, after-shave, candles, diffusers,
 * cosmetics, accessories, hair care, displays, blotters, boxes) are left out — they have no concentration.
 */
import type pg from "pg";
import { z } from "zod";

export const NON_FRAGRANCE_TYPES = ["Body Mist", "Deodorant", "Body care", "Bag", "Accessory", "Home fragrance", "Gift with purchase", "Display",
  "Box / Packaging", "Blotter", "Cosmetics", "Hair care"] as const;
const NON_FRAGRANCE_WORDS = "ROLL ON|ROLLON|ROLL-ON|FRESHENER|FRESHNER|PEN|POUCH|BAG|CANDLE|DIFFUSER|AFTER SHAVE|AFTERSHAVE|DEO|DEODORANT|LOTION|SHOWER GEL|BODY WASH|SOAP|CREAM|BALM";

export const concCheckQuery = z.object({
  product_type: z.string().trim().max(60).optional(),
  /** "proposed" = the lists agree on one concentration; "conflict" = they disagree; "none" = no list spells it. */
  status: z.enum(["proposed", "conflict", "none"]).optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Name key: upper case, set / tester / pc words and every non-letter-digit taken out ("COOLWATER NIGHTDIVE" = "COOL WATER NIGHT DIVE"). */
const KEY = (col: string) => `regexp_replace(regexp_replace(upper(${col}),
  '\\m([0-9]+ ?PCS?|[0-9]+ ?PIECES?|SET|GIFT|GIFTSET|TESTER|MINI|TRAVEL|VARIETY|COFFRET|UNBOXED|UB|CN|NP|L2|EDT|EDP|PARFUM|EXTRAIT|EDC|COLOGNE|EAU DE TOILETTE|EAU DE PARFUM|SPRAY|SP)\\M', '', 'g'), '[^A-Z0-9]', '', 'g')`;
const TOKEN = (col: string) => `CASE WHEN ${col} ~ '\\m(EDT|EAU DE TOILETTE|TOILETTE)\\M' THEN 'EDT' WHEN ${col} ~ '\\m(EDP|EAU DE PARFUM)\\M' THEN 'EDP'
  WHEN ${col} ~ '\\mEXTRAIT\\M' THEN 'EXTRAIT' WHEN ${col} ~ '\\m(EDC|EAU DE COLOGNE|COLOGNE)\\M' THEN 'EDC' WHEN ${col} ~ '\\m(PARFUM|PERFUME)\\M' THEN 'PARFUM' END`;

export async function concCheck(c: Pick<pg.PoolClient, "query">, f: z.infer<typeof concCheckQuery>) {
  const args: unknown[] = [[...NON_FRAGRANCE_TYPES]];
  const w = [`i.merged_into_id IS NULL`, `coalesce(i.conc, '') = ''`, `coalesce(i.product_type, '') <> ALL($1::text[])`,
    `(i.category IS NULL OR i.category = 'Perfume')`, `upper(i.display_name) !~ '\\m(${NON_FRAGRANCE_WORDS})\\M'`];
  if (f.product_type) { args.push(f.product_type === "(none)" ? "" : f.product_type); w.push(`coalesce(i.product_type, '') = $${args.length}`); }
  if (f.q) { args.push(`%${f.q.toLowerCase()}%`); w.push(`lower(i.display_name) LIKE $${args.length}`); }
  const sql = `
    WITH t AS MATERIALIZED (SELECT i.id, i.display_name, coalesce(i.product_type, '') AS product_type, i.size_ml, upper(i.brand) AS b, ${KEY("i.name")} AS k
                 FROM perfume.items i WHERE ${w.join(" AND ")}),
         ref AS MATERIALIZED (SELECT upper(r.brand) AS b, ${KEY("r.name")} AS k, r.size_ml, r.conc, r.display_name
                   FROM perfume.items r WHERE r.merged_into_id IS NULL AND coalesce(r.conc, '') NOT IN ('', 'MIST')),
         ev AS MATERIALIZED (
           SELECT t.id, ref.conc AS c, 'item' AS src, ref.display_name AS what, (ref.size_ml IS NOT DISTINCT FROM t.size_ml) AS same_size
             FROM t JOIN ref ON ref.b = t.b AND ref.k = t.k AND length(t.k) >= 3
           UNION ALL
           SELECT t.id, ${TOKEN("upper(pl.description)")}, 'line', pl.description, true
             FROM t JOIN perfume.price_list_rows pl ON pl.item_id = t.id),
         ea AS MATERIALIZED (SELECT e.id, count(DISTINCT e.c) AS kinds, min(e.c) AS one, string_agg(DISTINCT e.c, ' / ') AS concs, count(*) AS agree_n,
                        count(*) FILTER (WHERE e.src = 'item') AS items_n, count(*) FILTER (WHERE e.src = 'line') AS lines_n,
                        (array_agg(e.what ORDER BY e.same_size DESC, e.src))[1:3] AS evidence
                   FROM ev e WHERE e.c IS NOT NULL GROUP BY e.id),
         agg AS (SELECT t.id, t.display_name, t.product_type, t.size_ml, coalesce(ea.kinds, 0) AS kinds, ea.one, ea.concs,
                        coalesce(ea.agree_n, 0) AS agree_n, coalesce(ea.items_n, 0) AS items_n, coalesce(ea.lines_n, 0) AS lines_n, ea.evidence
                   FROM t LEFT JOIN ea ON ea.id = t.id),
         s AS (SELECT *, CASE WHEN kinds = 1 THEN 'proposed' WHEN kinds > 1 THEN 'conflict' ELSE 'none' END AS status FROM agg)`;
  const st = f.status ? (args.push(f.status), `WHERE status = $${args.length}`) : "";
  const counts = (await c.query<{ status: string; n: string }>(`${sql} SELECT status, count(*)::text n FROM s GROUP BY 1`, args.slice(0, f.status ? -1 : undefined))).rows;
  args.push(f.limit, f.offset);
  const rows = (await c.query<{ id: string; display_name: string; product_type: string; size_ml: string | null; status: string; proposed: string | null;
      concs: string | null; agree_n: number; items_n: number; lines_n: number; evidence: string[] | null }>(
    `${sql} SELECT id::text, display_name, product_type, size_ml::text, status, CASE WHEN status = 'proposed' THEN one END AS proposed, concs,
            agree_n::int, items_n::int, lines_n::int, evidence FROM s ${st}
      ORDER BY (status = 'proposed') DESC, product_type, display_name LIMIT $${args.length - 1} OFFSET $${args.length}`, args)).rows;
  const by = Object.fromEntries(counts.map((x) => [x.status, Number(x.n)]));
  const total = f.status ? (by[f.status] ?? 0) : counts.reduce((s, x) => s + Number(x.n), 0);
  return { total, counts: { proposed: by.proposed ?? 0, conflict: by.conflict ?? 0, none: by.none ?? 0 }, limit: f.limit, offset: f.offset,
    rows: rows.map((r) => ({ ...r, size_ml: r.size_ml == null ? null : Number(r.size_ml), evidence: r.evidence ?? [] })) };
}
