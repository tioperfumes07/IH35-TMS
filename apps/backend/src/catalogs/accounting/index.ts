import type { FastifyInstance } from "fastify";
import { createCatalogRoutes as createCompanyScopedCatalogRoutes } from "../fuel/factory.js";
import { registerAccountTypeCatalogRoutes } from "./account-type-catalog.routes.js";
import { registerDetailTypesCatalogRoutes } from "./detail-types-catalog.routes.js";
import {
  registerJournalEntryTypesReadOnlyRoutes,
  registerLegacyAccountingCatalogRoutes,
  registerQboCategoriesCatalogRoutes,
} from "./factory.js";

const accountingCodeRegex = /^[A-Z][A-Z0-9-]+$/;
const chartSeedCodeRegex = /^[A-Z0-9][A-Z0-9._-]*$/;

export async function registerAccountingCatalogRoutes(app: FastifyInstance) {
  registerLegacyAccountingCatalogRoutes(app, {
    tableName: "accounts",
    urlSegment: "chart-of-accounts",
    codeColumn: "account_number",
    nameColumn: "account_name",
    descriptionColumn: "notes",
    activeMode: "deactivated_at",
    // AF-1: catalogs.accounts is per-entity under FORCE-RLS. Without scoping this legacy list would
    // leak other entities' accounts (lucia-bypass session) — scope by + require operating_company_id.
    entityScoped: true,
    requiredMetadata: ["account_type"],
    selectMetadataSql: [
      "'account_type', t.account_type::text",
      "'account_subtype', t.account_subtype",
      "'detail_type_id', t.detail_type_id",
      "'parent_account_id', t.parent_account_id",
      "'is_postable', t.is_postable",
      "'currency_code', t.currency_code",
      "'opening_balance_cents', t.opening_balance_cents",
      "'opening_balance_as_of', t.opening_balance_as_of",
      "'is_locked', t.is_locked",
      "'is_billable_expense', t.is_billable_expense",
      "'qbo_account_id', t.qbo_account_id",
      "'qbo_account_qrn', t.qbo_account_qrn",
    ],
    createMapper: (metadata) => ({
      account_type: String(metadata.account_type ?? "Expense"),
      account_subtype: (metadata.account_subtype as string | null | undefined) ?? null,
      detail_type_id: (metadata.detail_type_id as string | null | undefined) ?? null,
      parent_account_id: (metadata.parent_account_id as string | null | undefined) ?? null,
      is_postable: metadata.is_postable === undefined ? true : Boolean(metadata.is_postable),
      currency_code: String(metadata.currency_code ?? "USD"),
      opening_balance_cents:
        metadata.opening_balance_cents === undefined || metadata.opening_balance_cents === null
          ? null
          : Number(metadata.opening_balance_cents),
      opening_balance_as_of: (metadata.opening_balance_as_of as string | null | undefined) ?? null,
      is_locked: metadata.is_locked === undefined ? false : Boolean(metadata.is_locked),
      // QBO parity "Use for billable expenses" (migration 202607750000). Selection/display only —
      // this flag never auto-posts anything.
      is_billable_expense: metadata.is_billable_expense === undefined ? false : Boolean(metadata.is_billable_expense),
      qbo_account_id: (metadata.qbo_account_id as string | null | undefined) ?? null,
      qbo_account_qrn: (metadata.qbo_account_qrn as string | null | undefined) ?? null,
    }),
    updateMapper: (metadata) => ({
      ...(metadata.account_type !== undefined ? { account_type: String(metadata.account_type) } : {}),
      ...(metadata.account_subtype !== undefined ? { account_subtype: metadata.account_subtype as string | null } : {}),
      ...(metadata.detail_type_id !== undefined ? { detail_type_id: metadata.detail_type_id as string | null } : {}),
      ...(metadata.parent_account_id !== undefined ? { parent_account_id: metadata.parent_account_id as string | null } : {}),
      ...(metadata.is_postable !== undefined ? { is_postable: Boolean(metadata.is_postable) } : {}),
      ...(metadata.currency_code !== undefined ? { currency_code: String(metadata.currency_code) } : {}),
      ...(metadata.opening_balance_cents !== undefined
        ? { opening_balance_cents: metadata.opening_balance_cents === null ? null : Number(metadata.opening_balance_cents) }
        : {}),
      ...(metadata.opening_balance_as_of !== undefined
        ? { opening_balance_as_of: metadata.opening_balance_as_of as string | null }
        : {}),
      ...(metadata.is_locked !== undefined ? { is_locked: Boolean(metadata.is_locked) } : {}),
      ...(metadata.is_billable_expense !== undefined ? { is_billable_expense: Boolean(metadata.is_billable_expense) } : {}),
      ...(metadata.qbo_account_id !== undefined ? { qbo_account_id: metadata.qbo_account_id as string | null } : {}),
      ...(metadata.qbo_account_qrn !== undefined ? { qbo_account_qrn: metadata.qbo_account_qrn as string | null } : {}),
    }),
  });

  registerLegacyAccountingCatalogRoutes(app, {
    tableName: "classes",
    urlSegment: "classes",
    codeColumn: "class_code",
    nameColumn: "class_name",
    descriptionColumn: "notes",
    // AF-3: catalogs.classes is per-entity under FORCE-RLS → scope by + require operating_company_id
    // (else create 500s on NOT NULL + WITH CHECK, and the list leaks other entities' classes).
    entityScoped: true,
    activeMode: "deactivated_at",
    selectMetadataSql: ["'parent_class_id', t.parent_class_id", "'qbo_class_id', t.qbo_class_id"],
    createMapper: (metadata) => ({
      parent_class_id: (metadata.parent_class_id as string | null | undefined) ?? null,
      qbo_class_id: (metadata.qbo_class_id as string | null | undefined) ?? null,
    }),
    updateMapper: (metadata) => ({
      ...(metadata.parent_class_id !== undefined ? { parent_class_id: metadata.parent_class_id as string | null } : {}),
      ...(metadata.qbo_class_id !== undefined ? { qbo_class_id: metadata.qbo_class_id as string | null } : {}),
    }),
  });

  registerLegacyAccountingCatalogRoutes(app, {
    tableName: "payment_terms",
    urlSegment: "payment-terms",
    codeColumn: "terms_name",
    nameColumn: "terms_name",
    descriptionColumn: "notes",
    activeMode: "deactivated_at",
    // LST-F03: per-entity after 202608000000 (FORCE RLS company_scope).
    entityScoped: true,
    requiredMetadata: ["net_days"],
    selectMetadataSql: [
      "'net_days', t.days_until_due",
      "'early_payment_discount_pct', t.early_payment_discount_pct",
      "'early_payment_discount_days', t.early_payment_discount_days",
      "'qbo_terms_id', t.qbo_terms_id",
    ],
    createMapper: (metadata) => ({
      days_until_due: Number(metadata.net_days ?? 0),
      early_payment_discount_pct:
        metadata.early_payment_discount_pct === undefined || metadata.early_payment_discount_pct === null
          ? null
          : Number(metadata.early_payment_discount_pct),
      early_payment_discount_days:
        metadata.early_payment_discount_days === undefined || metadata.early_payment_discount_days === null
          ? null
          : Number(metadata.early_payment_discount_days),
      qbo_terms_id: (metadata.qbo_terms_id as string | null | undefined) ?? null,
    }),
    updateMapper: (metadata) => ({
      ...(metadata.net_days !== undefined ? { days_until_due: Number(metadata.net_days) } : {}),
      ...(metadata.early_payment_discount_pct !== undefined
        ? {
            early_payment_discount_pct:
              metadata.early_payment_discount_pct === null ? null : Number(metadata.early_payment_discount_pct),
          }
        : {}),
      ...(metadata.early_payment_discount_days !== undefined
        ? {
            early_payment_discount_days:
              metadata.early_payment_discount_days === null ? null : Number(metadata.early_payment_discount_days),
          }
        : {}),
      ...(metadata.qbo_terms_id !== undefined ? { qbo_terms_id: metadata.qbo_terms_id as string | null } : {}),
    }),
  });

  registerLegacyAccountingCatalogRoutes(app, {
    tableName: "items",
    urlSegment: "items",
    codeColumn: "item_code",
    nameColumn: "item_name",
    descriptionColumn: "description",
    activeMode: "deactivated_at",
    requiredMetadata: ["item_type"],
    // AF-2: catalogs.items is per-entity under FORCE-RLS → every route must scope by + write operating_company_id.
    entityScoped: true,
    selectMetadataSql: [
      "'item_type', t.item_type::text",
      "'unit_price_cents', t.unit_price_cents",
      "'default_income_account_id', t.default_income_account_id",
      "'default_expense_account_id', t.default_expense_account_id",
      "'default_class_id', t.default_class_id",
      "'category_id', t.category_id",
      "'purchase_description', t.purchase_description",
      "'purchase_cost_cents', t.purchase_cost_cents",
      "'preferred_vendor_id', t.preferred_vendor_id",
      "'qbo_item_id', t.qbo_item_id",
      "'taxable', t.taxable",
      "'notes', t.notes",
    ],
    createMapper: (metadata) => ({
      item_type: String(metadata.item_type ?? "Service"),
      unit_price_cents: metadata.unit_price_cents === undefined ? null : Number(metadata.unit_price_cents),
      default_income_account_id: (metadata.default_income_account_id as string | null | undefined) ?? null,
      default_expense_account_id: (metadata.default_expense_account_id as string | null | undefined) ?? null,
      default_class_id: (metadata.default_class_id as string | null | undefined) ?? null,
      category_id: (metadata.category_id as string | null | undefined) ?? null,
      purchase_description: (metadata.purchase_description as string | null | undefined) ?? null,
      purchase_cost_cents: metadata.purchase_cost_cents === undefined ? null : Number(metadata.purchase_cost_cents),
      preferred_vendor_id: (metadata.preferred_vendor_id as string | null | undefined) ?? null,
      qbo_item_id: (metadata.qbo_item_id as string | null | undefined) ?? null,
      taxable: metadata.taxable === undefined ? false : Boolean(metadata.taxable),
      notes: (metadata.notes as string | null | undefined) ?? null,
    }),
    updateMapper: (metadata) => ({
      ...(metadata.item_type !== undefined ? { item_type: String(metadata.item_type) } : {}),
      ...(metadata.unit_price_cents !== undefined
        ? { unit_price_cents: metadata.unit_price_cents === null ? null : Number(metadata.unit_price_cents) }
        : {}),
      ...(metadata.default_income_account_id !== undefined
        ? { default_income_account_id: metadata.default_income_account_id as string | null }
        : {}),
      ...(metadata.default_expense_account_id !== undefined
        ? { default_expense_account_id: metadata.default_expense_account_id as string | null }
        : {}),
      ...(metadata.default_class_id !== undefined ? { default_class_id: metadata.default_class_id as string | null } : {}),
      ...(metadata.category_id !== undefined ? { category_id: metadata.category_id as string | null } : {}),
      ...(metadata.purchase_description !== undefined ? { purchase_description: metadata.purchase_description as string | null } : {}),
      ...(metadata.purchase_cost_cents !== undefined
        ? { purchase_cost_cents: metadata.purchase_cost_cents === null ? null : Number(metadata.purchase_cost_cents) }
        : {}),
      ...(metadata.preferred_vendor_id !== undefined ? { preferred_vendor_id: metadata.preferred_vendor_id as string | null } : {}),
      ...(metadata.qbo_item_id !== undefined ? { qbo_item_id: metadata.qbo_item_id as string | null } : {}),
      ...(metadata.taxable !== undefined ? { taxable: Boolean(metadata.taxable) } : {}),
      ...(metadata.notes !== undefined ? { notes: metadata.notes as string | null } : {}),
    }),
    // NetSuite-style server-side account-type guard: income must be Income/OtherIncome, expense must be
    // Expense/CostOfGoodsSold/OtherExpense. Same-entity is already enforced by AF-2 composite FKs; this
    // adds type-correctness so an item can never point revenue at an expense account (or vice-versa).
    validate: async (client, mapped, oc) => {
      const checkType = async (
        accountId: string | null | undefined,
        allowed: string[],
        notFoundErr: string,
        wrongTypeErr: string
      ): Promise<string | null> => {
        if (!accountId) return null;
        const res = await client.query(
          `SELECT account_type::text AS t FROM catalogs.accounts WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
          [accountId, oc]
        );
        const t = res.rows[0]?.t as string | undefined;
        if (!t) return notFoundErr;
        if (!allowed.includes(t)) return wrongTypeErr;
        return null;
      };
      return (
        (await checkType(
          mapped.default_income_account_id as string | null | undefined,
          ["Income", "OtherIncome"],
          "income_account_not_found",
          "income_account_wrong_type"
        )) ??
        (await checkType(
          mapped.default_expense_account_id as string | null | undefined,
          ["Expense", "CostOfGoodsSold", "OtherExpense"],
          "expense_account_not_found",
          "expense_account_wrong_type"
        ))
      );
    },
  });

  registerLegacyAccountingCatalogRoutes(app, {
    tableName: "posting_templates",
    urlSegment: "posting-templates",
    codeColumn: "template_code",
    nameColumn: "template_name",
    descriptionColumn: "description",
    activeMode: "is_active",
    // ACCT-LINK-05: owner seeds PostingSourceType (+ fuel_event) rows in-app; consumers stamp
    // posting_template_id once a matching active per-entity template exists.
    requiredMetadata: ["debit_account_id", "credit_account_id"],
    // LST-F03: per-entity after 202608000000 (FORCE RLS company_scope).
    entityScoped: true,
    selectMetadataSql: [
      "'debit_account_id', t.debit_account_id",
      "'credit_account_id', t.credit_account_id",
      "'default_class_id', t.default_class_id",
      "'default_memo', t.default_memo",
    ],
    createMapper: (metadata) => ({
      debit_account_id: String(metadata.debit_account_id),
      credit_account_id: String(metadata.credit_account_id),
      default_class_id: (metadata.default_class_id as string | null | undefined) ?? null,
      default_memo: (metadata.default_memo as string | null | undefined) ?? null,
    }),
    updateMapper: (metadata) => ({
      ...(metadata.debit_account_id !== undefined ? { debit_account_id: String(metadata.debit_account_id) } : {}),
      ...(metadata.credit_account_id !== undefined ? { credit_account_id: String(metadata.credit_account_id) } : {}),
      ...(metadata.default_class_id !== undefined
        ? { default_class_id: (metadata.default_class_id as string | null) ?? null }
        : {}),
      ...(metadata.default_memo !== undefined ? { default_memo: (metadata.default_memo as string | null) ?? null } : {}),
    }),
    validate: async (client, mapped, oc) => {
      const debit = mapped.debit_account_id as string | null | undefined;
      const credit = mapped.credit_account_id as string | null | undefined;
      if (debit && credit && debit === credit) return "debit_credit_must_differ";
      const idsToCheck = [debit, credit].filter((id): id is string => typeof id === "string" && id.length > 0);
      if (idsToCheck.length) {
        const acct = await client.query(
          `SELECT id::text AS id FROM catalogs.accounts
            WHERE operating_company_id = $1 AND deactivated_at IS NULL AND id = ANY($2::uuid[])`,
          [oc, idsToCheck]
        );
        const found = new Set(acct.rows.map((r) => String(r.id)));
        for (const id of idsToCheck) {
          if (!found.has(id)) return "invalid_account_or_class_reference";
        }
      }
      const classId = mapped.default_class_id as string | null | undefined;
      if (classId) {
        const cls = await client.query(
          `SELECT id FROM catalogs.classes WHERE id = $1 AND operating_company_id = $2 AND deactivated_at IS NULL LIMIT 1`,
          [classId, oc]
        );
        if (!cls.rows[0]) return "invalid_account_or_class_reference";
      }
      return null;
    },
  });

  registerLegacyAccountingCatalogRoutes(app, {
    tableName: "account_role_bindings",
    urlSegment: "account-role-bindings",
    codeColumn: "role_key",
    nameColumn: "role_key",
    descriptionColumn: "description",
    activeMode: "deactivated_at",
    readOnly: true,
    // LST-F09: per-entity under FORCE RLS company_scope (migration 202607990000).
    entityScoped: true,
    selectMetadataSql: ["'account_id', t.account_id"],
  });

  registerQboCategoriesCatalogRoutes(app);
  registerJournalEntryTypesReadOnlyRoutes(app);

  createCompanyScopedCatalogRoutes(app, {
    tableName: "chart_of_accounts_seeds",
    urlSegment: "chart-of-accounts-seeds",
    routePrefix: "/api/v1/catalogs/accounting",
    displayName: "Chart of Accounts Seeds",
    codeRegex: chartSeedCodeRegex,
  });

  createCompanyScopedCatalogRoutes(app, {
    tableName: "expense_categories",
    urlSegment: "expense-categories",
    routePrefix: "/api/v1/catalogs/accounting",
    displayName: "Expense Categories",
    codeRegex: accountingCodeRegex,
  });

  createCompanyScopedCatalogRoutes(app, {
    tableName: "payment_methods",
    urlSegment: "payment-methods",
    routePrefix: "/api/v1/catalogs/accounting",
    displayName: "Payment Methods",
    codeRegex: accountingCodeRegex,
  });

  createCompanyScopedCatalogRoutes(app, {
    tableName: "tax_codes",
    urlSegment: "tax-codes",
    routePrefix: "/api/v1/catalogs/accounting",
    displayName: "Tax Codes",
    codeRegex: accountingCodeRegex,
  });

  createCompanyScopedCatalogRoutes(app, {
    tableName: "currency_codes",
    urlSegment: "currency-codes",
    routePrefix: "/api/v1/catalogs/accounting",
    displayName: "Currency Codes",
    codeRegex: accountingCodeRegex,
  });

  registerAccountTypeCatalogRoutes(app);
  registerDetailTypesCatalogRoutes(app);
}
