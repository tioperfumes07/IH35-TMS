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

export type PseEnforcementInput = {
  psCategoryQboId: string;
  psItemQboId: string;
  qboAccountId?: string | number | null;
};

export type VendorSubtypeSuggestionInput = {
  vendorSubtype?: string | null;
  vendorId?: string | null;
};

export async function enforcePseSelection(userId: string, operatingCompanyId: string, input: PseEnforcementInput) {
  const normalizedCategory = input.psCategoryQboId.trim().toLowerCase();
  const normalizedItem = input.psItemQboId.trim().toLowerCase();
  const rawQboAccount = input.qboAccountId == null ? "" : String(input.qboAccountId);
  const normalizedQboAccount = rawQboAccount.replace(/[^\d]/g, "");
  const qboAccountNumeric = normalizedQboAccount ? Number(normalizedQboAccount) : null;

  return withCompanyScope(userId, operatingCompanyId, async (client) => {
    const categoryRes = await client.query(
      `
        SELECT qbo_id, coa_account_id::text, active
        FROM accounting.ps_category
        WHERE tenant_id = $1::uuid
          AND lower(qbo_id) = $2
        LIMIT 1
      `,
      [operatingCompanyId, normalizedCategory]
    );
    const category = categoryRes.rows[0] as { qbo_id: string; coa_account_id: string | null; active: boolean } | undefined;
    if (!category || !category.active) throw new Error("pse_category_not_found");

    const itemRes = await client.query(
      `
        SELECT qbo_id, category_qbo_id, coa_account_id::text, active
        FROM accounting.ps_item
        WHERE tenant_id = $1::uuid
          AND lower(qbo_id) = $2
        LIMIT 1
      `,
      [operatingCompanyId, normalizedItem]
    );
    const item = itemRes.rows[0] as
      | { qbo_id: string; category_qbo_id: string; coa_account_id: string | null; active: boolean }
      | undefined;
    if (!item || !item.active) throw new Error("pse_item_not_found");
    if (String(item.category_qbo_id ?? "").trim().toLowerCase() !== normalizedCategory) {
      throw new Error("pse_item_category_mismatch");
    }

    let account: { id: string; qbo_id: string; active: boolean } | null = null;
    if (qboAccountNumeric != null && Number.isFinite(qboAccountNumeric)) {
      const accountRes = await client.query(
        `
          SELECT id::text, qbo_id::text, active
          FROM accounting.coa_account
          WHERE tenant_id = $1::uuid
            AND qbo_id = $2::numeric
          LIMIT 1
        `,
        [operatingCompanyId, qboAccountNumeric]
      );
      account = (accountRes.rows[0] as { id: string; qbo_id: string; active: boolean } | undefined) ?? null;
      if (!account || !account.active) throw new Error("pse_account_not_found");
    }

    const expectedAccountId = item.coa_account_id ?? category.coa_account_id ?? null;
    if (account && expectedAccountId && account.id !== expectedAccountId) {
      throw new Error("pse_account_mismatch");
    }

    return {
      ps_category_qbo_id: category.qbo_id,
      ps_item_qbo_id: item.qbo_id,
      qbo_account_id: account?.qbo_id ?? (qboAccountNumeric != null ? String(qboAccountNumeric) : null),
      category_coa_account_id: category.coa_account_id,
      item_coa_account_id: item.coa_account_id,
      resolved_coa_account_id: expectedAccountId,
    };
  });
}

export async function suggestPseSelectionByVendorSubtype(
  userId: string,
  operatingCompanyId: string,
  input: VendorSubtypeSuggestionInput
) {
  const initialSubtype = String(input.vendorSubtype ?? "").trim();
  return withCompanyScope(userId, operatingCompanyId, async (client) => {
    let normalizedSubtype = initialSubtype.toLowerCase();
    if (!normalizedSubtype && input.vendorId) {
      const vendorRes = await client.query(
        `
          SELECT
            NULLIF(trim(coalesce(v.vendor_category, '')), '') AS vendor_category,
            NULLIF(trim(coalesce(v.vendor_type, '')), '') AS vendor_type
          FROM mdata.vendors v
          WHERE v.id = $1::uuid
            AND v.operating_company_id = $2::uuid
          LIMIT 1
        `,
        [input.vendorId, operatingCompanyId]
      );
      const vendor = vendorRes.rows[0] as { vendor_category: string | null; vendor_type: string | null } | undefined;
      const fallbackSubtype = vendor?.vendor_category ?? vendor?.vendor_type ?? "";
      normalizedSubtype = String(fallbackSubtype).trim().toLowerCase();
    }
    if (!normalizedSubtype) throw new Error("vendor_subtype_required");

    const mappedRes = await client.query(
      `
        SELECT
          vendor_subtype,
          ps_category_qbo_id,
          ps_item_qbo_id,
          qbo_account_id::text
        FROM accounting.vendor_subtype_pse_map
        WHERE tenant_id = $1::uuid
          AND lower(vendor_subtype) = $2
          AND active = true
        LIMIT 1
      `,
      [operatingCompanyId, normalizedSubtype]
    );
    const mapped = mappedRes.rows[0] as
      | { vendor_subtype: string; ps_category_qbo_id: string; ps_item_qbo_id: string; qbo_account_id: string | null }
      | undefined;

    if (mapped) {
      const enforced = await enforcePseSelection(userId, operatingCompanyId, {
        psCategoryQboId: mapped.ps_category_qbo_id,
        psItemQboId: mapped.ps_item_qbo_id,
        qboAccountId: mapped.qbo_account_id,
      });
      return {
        source: "vendor_subtype_map",
        vendor_subtype: mapped.vendor_subtype,
        ...enforced,
      };
    }

    const fallbackRes = await client.query(
      `
        SELECT
          c.qbo_id AS ps_category_qbo_id,
          i.qbo_id AS ps_item_qbo_id,
          COALESCE(i.coa_account_id::text, c.coa_account_id::text) AS qbo_account_hint
        FROM accounting.ps_item i
        JOIN accounting.ps_category c
          ON c.tenant_id = i.tenant_id
         AND lower(c.qbo_id) = lower(i.category_qbo_id)
        WHERE i.tenant_id = $1::uuid
          AND i.active = true
          AND c.active = true
          AND (
            lower(i.name) = $2
            OR lower(c.name) = $2
            OR lower(c.qbo_id) = $2
          )
        ORDER BY i.name ASC
        LIMIT 1
      `,
      [operatingCompanyId, normalizedSubtype]
    );
    const fallback = fallbackRes.rows[0] as
      | { ps_category_qbo_id: string; ps_item_qbo_id: string; qbo_account_hint: string | null }
      | undefined;
    if (!fallback) throw new Error("pse_vendor_subtype_suggestion_not_found");

    const enforced = await enforcePseSelection(userId, operatingCompanyId, {
      psCategoryQboId: fallback.ps_category_qbo_id,
      psItemQboId: fallback.ps_item_qbo_id,
      qboAccountId: null,
    });

    return {
      source: "name_fallback",
      vendor_subtype: normalizedSubtype,
      ...enforced,
    };
  });
}
