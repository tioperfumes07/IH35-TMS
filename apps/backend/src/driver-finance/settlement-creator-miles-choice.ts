/**
 * settlement-creator-miles-choice.ts — Lead 443.57 (owner 2026-10-11): "for the mileage it should also be the same in
 * settlement creator".
 *
 * The Creator shows, per load, the settlement's own miles (DOCUMENT — the pay miles) next to CC-2's two recommendations
 * (Historical lane average, Google driving distance) for Practical / Short / Empty, and the owner picks the source of the
 * LOAD's saved operating miles per field. This module applies that pick through CC-2's mileage engine and nothing else —
 * there is no second mileage path here:
 *   1. recordDocumentMilesSources — every field the load carries is recorded as 'document' (both recommendations kept);
 *   2. setMilesChoice — each field the owner set to historical / google / manual(reason) is written by the engine.
 * It runs at the END of the post (after delivery, the driver bills, the A/P chain and the close), so the driver pay already
 * written — rate × the settlement's miles — never moves with the choice. Preview runs the same post in a rolled-back
 * savepoint, so preview carries the choice too.
 */
import {
  MILES_FIELDS,
  MilesChoiceError,
  milesRecommendationsForLoad,
  recordDocumentMilesSources,
  setMilesChoice,
  type MilesField,
  type MilesRecommendations,
} from "../dispatch/mileage/miles-recommendations.service.js";
import type { SettlementCreatorMilesChoice } from "./settlement-creator.types.js";

type Queryable = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type CreatorLoadMilesResult = {
  load_id: string;
  load_number: string;
  fields: Record<MilesField, { value: number | null; source: string | null; historical: number | null; google: number | null }>;
};

export class CreatorMilesChoiceError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const FIELD_LABEL: Record<MilesField, string> = { practical: "Practical", short: "Short", empty: "Empty" };

export async function applyCreatorMilesChoices(
  client: Queryable,
  args: {
    operatingCompanyId: string;
    actorUserId: string;
    loads: Array<{ loadId: string; loadNumber: string; choice: SettlementCreatorMilesChoice | null | undefined }>;
  },
): Promise<CreatorLoadMilesResult[]> {
  const out: CreatorLoadMilesResult[] = [];
  for (const l of args.loads) {
    await recordDocumentMilesSources(client, { operatingCompanyId: args.operatingCompanyId, loadId: l.loadId, actorUserId: args.actorUserId });
    let recs: MilesRecommendations | null = null;
    for (const f of MILES_FIELDS) {
      const c = l.choice?.[f];
      if (!c || c.source === "document") continue;
      try {
        recs = await setMilesChoice(client, {
          operatingCompanyId: args.operatingCompanyId,
          loadId: l.loadId,
          field: f,
          source: c.source,
          manualValue: c.manual_value ?? null,
          reason: c.reason ?? null,
          actorUserId: args.actorUserId,
        });
      } catch (e) {
        if (e instanceof MilesChoiceError) {
          throw new CreatorMilesChoiceError(e.code, `Load ${l.loadNumber} ${FIELD_LABEL[f]} miles: ${e.code.replace(/_/g, " ")} — choose another source.`);
        }
        throw e;
      }
    }
    recs ??= await milesRecommendationsForLoad(client, { operatingCompanyId: args.operatingCompanyId, loadId: l.loadId });
    const fields = Object.fromEntries(
      MILES_FIELDS.map((f) => {
        const r = recs?.fields[f];
        return [f, { value: r?.current?.value ?? null, source: r?.current?.source ?? null, historical: r?.historical?.value ?? null, google: r?.google?.value ?? null }];
      }),
    ) as CreatorLoadMilesResult["fields"];
    out.push({ load_id: l.loadId, load_number: l.loadNumber, fields });
  }
  return out;
}
