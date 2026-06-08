import type { FastifyInstance } from "fastify";
import { withCurrentUser } from "../../auth/db.js";
import { currentAuthUser } from "./shared.js";

interface DetailTypeEntry {
  id: string;
  name: string;
  sortOrder: number;
}

interface AccountTypeCatalogEntry {
  id: string;
  code: string;
  accountType: string;
  group: string;
  statement: string;
  normalBalance: string;
  defaultAction: string;
  sortOrder: number;
  detailTypes: DetailTypeEntry[];
}

export function registerAccountTypeCatalogRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/accounting/account-type-catalog",
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return;

      const rows = await withCurrentUser(authUser.uuid, async (client) => {
        const res = await client.query<{
          at_id: string;
          code: string;
          at_name: string;
          group_label: string;
          statement: string;
          normal_balance: string;
          default_action: string;
          at_sort: number;
          dt_id: string | null;
          dt_name: string | null;
          dt_sort: number | null;
        }>(`
          SELECT
            at.id           AS at_id,
            at.code,
            at.name         AS at_name,
            at.group_label,
            at.statement,
            at.normal_balance,
            at.default_action,
            at.sort_order   AS at_sort,
            dt.id           AS dt_id,
            dt.name         AS dt_name,
            dt.sort_order   AS dt_sort
          FROM catalogs.account_types at
          LEFT JOIN catalogs.detail_types dt
            ON dt.account_type_id = at.id AND dt.is_active = true
          WHERE at.is_active = true
          ORDER BY at.sort_order ASC, dt.sort_order ASC
        `);
        return res.rows;
      });

      const map = new Map<string, AccountTypeCatalogEntry>();
      for (const r of rows) {
        if (!map.has(r.at_id)) {
          map.set(r.at_id, {
            id: r.at_id,
            code: r.code,
            accountType: r.at_name,
            group: r.group_label,
            statement: r.statement,
            normalBalance: r.normal_balance,
            defaultAction: r.default_action,
            sortOrder: r.at_sort,
            detailTypes: [],
          });
        }
        if (r.dt_id && r.dt_name) {
          map.get(r.at_id)!.detailTypes.push({
            id: r.dt_id,
            name: r.dt_name,
            sortOrder: r.dt_sort ?? 0,
          });
        }
      }

      return reply.send(Array.from(map.values()));
    },
  );
}
