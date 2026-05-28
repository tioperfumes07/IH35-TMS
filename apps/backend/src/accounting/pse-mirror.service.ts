import { withCompanyScope } from "./shared.js";

export async function syncPseMirror(userId: string, operatingCompanyId: string) {
  return withCompanyScope(userId, operatingCompanyId, async (client) => {
    await client.query(
      `
        INSERT INTO accounting.coa_account (
          tenant_id,
          qbo_id,
          number,
          name,
          type,
          detail_type,
          active
        )
        SELECT
          qa.operating_company_id AS tenant_id,
          NULLIF(regexp_replace(qa.qbo_id, '[^0-9]', '', 'g'), '')::numeric AS qbo_id,
          NULLIF(split_part(qa.full_qualified_name, ':', 1), '') AS number,
          qa.name,
          qa.account_type AS type,
          qa.account_sub_type AS detail_type,
          qa.active
        FROM mdata.qbo_accounts qa
        WHERE qa.operating_company_id = $1::uuid
          AND NULLIF(regexp_replace(qa.qbo_id, '[^0-9]', '', 'g'), '') IS NOT NULL
          AND coalesce(qa.account_type, '') IN ('Expense', 'Cost of Goods Sold', 'Other Expense')
        ON CONFLICT (tenant_id, qbo_id)
        DO UPDATE SET
          number = EXCLUDED.number,
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          detail_type = EXCLUDED.detail_type,
          active = EXCLUDED.active
      `,
      [operatingCompanyId]
    );

    await client.query(
      `
        INSERT INTO accounting.ps_category (
          tenant_id,
          qbo_id,
          name,
          coa_account_id,
          active
        )
        SELECT
          qi.operating_company_id AS tenant_id,
          lower(trim(coalesce(qi.item_type, 'uncategorized'))) AS qbo_id,
          initcap(replace(lower(trim(coalesce(qi.item_type, 'uncategorized'))), '_', ' ')) AS name,
          ca.id AS coa_account_id,
          bool_or(qi.active) AS active
        FROM mdata.qbo_items qi
        LEFT JOIN accounting.coa_account ca
          ON ca.tenant_id = qi.operating_company_id
         AND ca.qbo_id = NULLIF(qi.payload_json #>> '{IncomeAccountRef,value}', '')::numeric
        WHERE qi.operating_company_id = $1::uuid
        GROUP BY qi.operating_company_id, lower(trim(coalesce(qi.item_type, 'uncategorized'))), ca.id
        ON CONFLICT (tenant_id, qbo_id)
        DO UPDATE SET
          name = EXCLUDED.name,
          coa_account_id = EXCLUDED.coa_account_id,
          active = EXCLUDED.active
      `,
      [operatingCompanyId]
    );

    await client.query(
      `
        INSERT INTO accounting.ps_item (
          tenant_id,
          qbo_id,
          name,
          category_qbo_id,
          coa_account_id,
          active
        )
        SELECT
          qi.operating_company_id AS tenant_id,
          qi.qbo_id,
          qi.name,
          lower(trim(coalesce(qi.item_type, 'uncategorized'))) AS category_qbo_id,
          ca.id AS coa_account_id,
          qi.active
        FROM mdata.qbo_items qi
        LEFT JOIN accounting.coa_account ca
          ON ca.tenant_id = qi.operating_company_id
         AND ca.qbo_id = NULLIF(qi.payload_json #>> '{IncomeAccountRef,value}', '')::numeric
        WHERE qi.operating_company_id = $1::uuid
        ON CONFLICT (tenant_id, qbo_id)
        DO UPDATE SET
          name = EXCLUDED.name,
          category_qbo_id = EXCLUDED.category_qbo_id,
          coa_account_id = EXCLUDED.coa_account_id,
          active = EXCLUDED.active
      `,
      [operatingCompanyId]
    );
  });
}
