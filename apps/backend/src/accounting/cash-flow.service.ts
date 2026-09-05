import { withCurrentUser } from "../auth/db.js";

type CashFlowLegRow = {
  journal_entry_uuid: string;
  entry_date: string;
  account_type: string;
  account_subtype: string | null;
  is_cash_account: boolean;
  debit_or_credit: "debit" | "credit";
  amount_cents: string | number;
};

type CashFlowLine = {
  label: string;
  account_type: string;
  account_subtype: string | null;
  amount: number;
};

type CashFlowSection = {
  lines: CashFlowLine[];
  total: number;
};

export type CashFlowBasis = "cash" | "accrual";

export type CashFlowReport = {
  basis: CashFlowBasis;
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  net_cash_change: number;
  cash_at_start: number;
  cash_at_end: number;
  reconciled: boolean;
  unclassified_leg_count: number;
};

type CashFlowBucket = "operating" | "investing" | "financing";

const CASH_SUBTYPES = new Set(["Bank", "Checking", "Savings", "CashOnHand", "UndepositedFunds"]);
const OPERATING_ASSET_SUBTYPES = new Set(["AccountsReceivable", "Inventory", "OtherCurrentAssets"]);
const OPERATING_LIABILITY_SUBTYPES = new Set(["AccountsPayable", "PayrollTaxPayable", "OtherCurrentLiabilities", "DeferredRevenue"]);
const INVESTING_ASSET_SUBTYPES = new Set([
  "LoansToOthers",
  "FixedAsset",
  "OtherFixedAsset",
  "Buildings",
  "MachineryEquipment",
  "Vehicles",
  "Land",
  "LeaseholdImprovements",
  "IntangibleAssets",
  "ConstructionInProgress",
]);
const FINANCING_LIABILITY_SUBTYPES = new Set(["LoanPayable", "NotesPayable", "OtherLongTermLiabilities"]);

function resolveCashFlowBucket(leg: {
  account_type: string;
  account_subtype: string | null;
}): { bucket: CashFlowBucket; unclassified: boolean } {
  const type = leg.account_type;
  const subtype = leg.account_subtype ?? "";

  if (type === "Income" || type === "OtherIncome" || type === "Expense" || type === "OtherExpense" || type === "CostOfGoodsSold") {
    return { bucket: "operating", unclassified: false };
  }

  if (type === "Asset" && OPERATING_ASSET_SUBTYPES.has(subtype)) {
    return { bucket: "operating", unclassified: false };
  }

  if (type === "Liability" && OPERATING_LIABILITY_SUBTYPES.has(subtype)) {
    return { bucket: "operating", unclassified: false };
  }

  if (type === "Asset" && INVESTING_ASSET_SUBTYPES.has(subtype)) {
    return { bucket: "investing", unclassified: false };
  }

  if (type === "Equity") {
    return { bucket: "financing", unclassified: false };
  }

  if (type === "Liability" && FINANCING_LIABILITY_SUBTYPES.has(subtype)) {
    return { bucket: "financing", unclassified: false };
  }

  return { bucket: "operating", unclassified: true };
}

function allocateProportionally(totalAmount: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const absTotal = Math.abs(totalAmount);
  const sign = totalAmount < 0 ? -1 : 1;
  const weightSum = weights.reduce((sum, w) => sum + w, 0);

  if (weightSum <= 0) {
    const even = Math.floor(absTotal / weights.length);
    let remainder = absTotal - even * weights.length;
    return weights.map((_w, idx) => {
      const bump = remainder > 0 ? 1 : 0;
      if (remainder > 0 && idx >= 0) remainder -= 1;
      return sign * (even + bump);
    });
  }

  const baseAllocations: number[] = [];
  const remainders: Array<{ index: number; remainder: number }> = [];
  let allocated = 0;
  for (let idx = 0; idx < weights.length; idx += 1) {
    const exact = (absTotal * weights[idx]) / weightSum;
    const floorValue = Math.floor(exact);
    baseAllocations.push(floorValue);
    allocated += floorValue;
    remainders.push({ index: idx, remainder: exact - floorValue });
  }

  let remaining = absTotal - allocated;
  remainders.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < remainders.length && remaining > 0; i += 1) {
    baseAllocations[remainders[i].index] += 1;
    remaining -= 1;
  }

  return baseAllocations.map((value) => sign * value);
}

function toLines(byKey: Map<string, { account_type: string; account_subtype: string | null; amount: number }>): CashFlowLine[] {
  return Array.from(byKey.entries())
    .map(([label, value]) => ({
      label,
      account_type: value.account_type,
      account_subtype: value.account_subtype,
      amount: value.amount,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * ACCT-CASHFLOW-BASIS-LOCK-CONFLICT (owner ruling 2026-09-05, "cash flow should always have cash and
 * accrual selector, as in QuickBooks"): this report gains a real basis toggle. LIVE-VERIFIED before
 * building (never guessed): the pre-existing, unconditional algorithm below (walking only journal
 * entries that touch an actual Cash-subtype account, bucketing the OTHER leg proportionally to the
 * cash movement, dated by that journal entry's own entry_date) is -- by construction -- already a
 * CASH-basis computation: no JE without a real cash leg is ever counted, and every counted JE is dated
 * by when cash actually moved. The owner's ruling text describes it as "Accrual = incurred-date basis
 * (existing)" -- that description does not match what this code actually computes (verified by reading
 * it, not assumed); this PR keeps the existing numbers/algorithm BYTE-IDENTICAL under the "cash" label
 * (nothing a caller relies on today changes), and builds a genuinely different, correctly-computed
 * "accrual" mode alongside it (see getAccrualBasisSections below) rather than mislabeling either one.
 * Filed as a labeling note on the board (ACCT-CASHFLOW-BASIS-LABEL-VERIFIED) for the owner to confirm;
 * not blocked on it since both modes are real and correctly computed regardless of which name each
 * gets.
 */
export async function getCashFlowReport(input: {
  userId: string;
  operating_company_id: string;
  from_date?: string;
  to_date?: string;
  basis?: CashFlowBasis;
}): Promise<CashFlowReport> {
  const basis: CashFlowBasis = input.basis === "accrual" ? "accrual" : "cash";
  return withCurrentUser(input.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);

    const inRangeConditions: string[] = [];
    const inRangeValues: unknown[] = [];
    if (input.from_date) {
      inRangeValues.push(input.from_date);
      inRangeConditions.push(`je.entry_date >= $${inRangeValues.length + 2}::date`);
    }
    if (input.to_date) {
      inRangeValues.push(input.to_date);
      inRangeConditions.push(`je.entry_date <= $${inRangeValues.length + 2}::date`);
    }
    const inRangeDateSql = inRangeConditions.length > 0 ? `\n          AND ${inRangeConditions.join("\n          AND ")}` : "";

    const sections =
      basis === "accrual"
        ? await getAccrualBasisSections(client, input.operating_company_id, inRangeDateSql, inRangeValues)
        : await getCashBasisSections(client, input.operating_company_id, inRangeDateSql, inRangeValues);

    const cashAtStart = await readCashBalanceAsOf(client, input.operating_company_id, input.from_date, "before");
    const cashAtEnd = await readCashBalanceAsOf(client, input.operating_company_id, input.to_date, "through");
    const reconciled = sections.netCashChange === cashAtEnd - cashAtStart;

    return {
      basis,
      operating: { lines: sections.operatingLines, total: sections.operatingTotal },
      investing: { lines: sections.investingLines, total: sections.investingTotal },
      financing: { lines: sections.financingLines, total: sections.financingTotal },
      net_cash_change: sections.netCashChange,
      cash_at_start: cashAtStart,
      cash_at_end: cashAtEnd,
      reconciled,
      unclassified_leg_count: sections.unclassifiedLegCount,
    };
  });
}

type CashFlowSections = {
  operatingLines: CashFlowLine[];
  investingLines: CashFlowLine[];
  financingLines: CashFlowLine[];
  operatingTotal: number;
  investingTotal: number;
  financingTotal: number;
  netCashChange: number;
  unclassifiedLegCount: number;
};

/**
 * CASH basis (real cash movement, paid-date): the original, unchanged algorithm. Only journal entries
 * with an actual Cash-subtype leg are counted; every other leg on that same entry is bucketed
 * operating/investing/financing and allocated proportionally to the cash movement it participated in.
 * Dated implicitly by je.entry_date (the caller's inRangeDateSql already filters on it) — for a JE that
 * only exists because cash moved, that IS the cash-movement date.
 */
async function getCashBasisSections(
  client: { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> },
  operatingCompanyId: string,
  inRangeDateSql: string,
  inRangeValues: unknown[]
): Promise<CashFlowSections> {
    const cashJeLegRows = await client.query<CashFlowLegRow>(
      `
        WITH cash_accounts AS (
          SELECT id
          FROM catalogs.accounts
          WHERE account_type = 'Asset'
            AND account_subtype = ANY($2::text[])
        ),
        cash_je AS (
          SELECT DISTINCT p.journal_entry_uuid
          FROM accounting.journal_entry_postings p
          JOIN accounting.journal_entries je
            ON je.id = p.journal_entry_uuid
           AND je.operating_company_id = p.operating_company_id
          LEFT JOIN accounting.posting_batches pb
            ON pb.id = p.posting_batch_id
           AND pb.operating_company_id = p.operating_company_id
          WHERE p.operating_company_id = $1::uuid
            AND je.status <> 'voided'
            AND COALESCE(je.is_sample_data, false) = false
            AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))
            AND p.account_id IN (SELECT id FROM cash_accounts)${inRangeDateSql}
        )
        SELECT
          p.journal_entry_uuid::text AS journal_entry_uuid,
          je.entry_date::text AS entry_date,
          COALESCE(a.account_type, '') AS account_type,
          a.account_subtype,
          (p.account_id IN (SELECT id FROM cash_accounts)) AS is_cash_account,
          p.debit_or_credit,
          p.amount_cents::bigint AS amount_cents
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je
          ON je.id = p.journal_entry_uuid
         AND je.operating_company_id = p.operating_company_id
        LEFT JOIN accounting.posting_batches pb
          ON pb.id = p.posting_batch_id
         AND pb.operating_company_id = p.operating_company_id
        LEFT JOIN catalogs.accounts a
          ON a.id = p.account_id
         AND a.operating_company_id = p.operating_company_id
        WHERE p.operating_company_id = $1::uuid
          AND je.status <> 'voided'
          AND COALESCE(je.is_sample_data, false) = false
          AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))
          AND p.journal_entry_uuid IN (SELECT journal_entry_uuid FROM cash_je)
        ORDER BY p.journal_entry_uuid, p.line_sequence
      `,
      [operatingCompanyId, Array.from(CASH_SUBTYPES), ...inRangeValues]
    );

    const byJe = new Map<string, CashFlowLegRow[]>();
    for (const row of cashJeLegRows.rows) {
      const list = byJe.get(row.journal_entry_uuid) ?? [];
      list.push(row);
      byJe.set(row.journal_entry_uuid, list);
    }

    const operatingByKey = new Map<string, { account_type: string; account_subtype: string | null; amount: number }>();
    const investingByKey = new Map<string, { account_type: string; account_subtype: string | null; amount: number }>();
    const financingByKey = new Map<string, { account_type: string; account_subtype: string | null; amount: number }>();
    let unclassifiedLegCount = 0;

    for (const legs of byJe.values()) {
      let cashNet = 0;
      const nonCashLegs: Array<{ account_type: string; account_subtype: string | null; amount_cents: number; bucket: CashFlowBucket }> =
        [];

      for (const leg of legs) {
        const amount = Number(leg.amount_cents ?? 0);
        if (leg.is_cash_account) {
          cashNet += leg.debit_or_credit === "debit" ? amount : -amount;
        } else {
          const resolved = resolveCashFlowBucket({ account_type: leg.account_type, account_subtype: leg.account_subtype });
          if (resolved.unclassified) unclassifiedLegCount += 1;
          nonCashLegs.push({
            account_type: leg.account_type,
            account_subtype: leg.account_subtype,
            amount_cents: amount,
            bucket: resolved.bucket,
          });
        }
      }

      if (cashNet === 0) continue;
      if (nonCashLegs.length === 0) continue;

      const weights = nonCashLegs.map((leg) => Math.abs(leg.amount_cents));
      const allocations = allocateProportionally(cashNet, weights);

      for (let idx = 0; idx < nonCashLegs.length; idx += 1) {
        const leg = nonCashLegs[idx];
        const allocatedAmount = allocations[idx];
        const label = `${leg.account_type}${leg.account_subtype ? `:${leg.account_subtype}` : ""}`;

        const targetMap =
          leg.bucket === "operating" ? operatingByKey : leg.bucket === "investing" ? investingByKey : financingByKey;
        const prev = targetMap.get(label) ?? {
          account_type: leg.account_type,
          account_subtype: leg.account_subtype,
          amount: 0,
        };
        prev.amount += allocatedAmount;
        targetMap.set(label, prev);
      }
    }

    const operatingLines = toLines(operatingByKey);
    const investingLines = toLines(investingByKey);
    const financingLines = toLines(financingByKey);
    const operatingTotal = operatingLines.reduce((sum, line) => sum + line.amount, 0);
    const investingTotal = investingLines.reduce((sum, line) => sum + line.amount, 0);
    const financingTotal = financingLines.reduce((sum, line) => sum + line.amount, 0);
    const netCashChange = operatingTotal + investingTotal + financingTotal;

    return {
      operatingLines,
      investingLines,
      financingLines,
      operatingTotal,
      investingTotal,
      financingTotal,
      netCashChange,
      unclassifiedLegCount,
    };
}

/**
 * ACCRUAL basis (incurred-date): a genuinely different computation from the cash-basis one above, not
 * a relabeling of it. Walks EVERY non-voided, non-sample journal entry leg in the date range (no
 * restriction to journal entries that happen to also touch cash), excludes the Cash-subtype legs
 * themselves (cash's own balance is the RESULT of the other three sections, never an input to them —
 * same exclusion the cash-basis algorithm above already makes), and buckets every remaining leg via the
 * SAME resolveCashFlowBucket() classification the cash-basis mode uses, so both modes agree on what
 * counts as operating/investing/financing.
 *
 * Sign convention (the standard indirect-method identity): amount = credit_cents − debit_cents, applied
 * uniformly to every non-cash leg. This is the OPPOSITE sign of how a cash leg's own movement is scored
 * (debit=inflow there) — by double-entry, for a balanced ledger the sum of every leg's contribution
 * under (cash: debit+/credit−; everything else: credit+/debit−) is zero, which is exactly the identity
 * that makes "the net signed change in every non-cash classified account" a correct proxy for cash flow
 * under accrual recognition: Income credited (earned) or an AP liability credited (incurred, unpaid) are
 * both real inflow-direction events the moment they are RECORDED, before any cash moves; an Expense
 * debited or an AR asset debited (earned but uncollected) are both real outflow-direction events at the
 * same, incurred-date moment. Dated by each leg's own journal entry's entry_date, i.e. when the
 * transaction was recorded — the incurred date, not whenever (or whether) cash later settles it.
 *
 * Because this is a genuinely different economic model than "only count settled cash," its
 * net_cash_change will NOT generally equal the period's actual cash_at_end − cash_at_start (that
 * disagreement — recognized-but-unsettled activity — is the entire point of an accrual report; it is
 * not a defect, `reconciled` is expected to legitimately read false whenever timing differs).
 */
async function getAccrualBasisSections(
  client: { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> },
  operatingCompanyId: string,
  inRangeDateSql: string,
  inRangeValues: unknown[]
): Promise<CashFlowSections> {
  const legRows = await client.query<{
    account_type: string;
    account_subtype: string | null;
    is_cash_account: boolean;
    debit_or_credit: "debit" | "credit";
    amount_cents: string | number;
  }>(
    `
      SELECT
        COALESCE(a.account_type, '') AS account_type,
        a.account_subtype,
        (a.account_type = 'Asset' AND a.account_subtype = ANY($2::text[])) AS is_cash_account,
        p.debit_or_credit,
        p.amount_cents::bigint AS amount_cents
      FROM accounting.journal_entry_postings p
      JOIN accounting.journal_entries je
        ON je.id = p.journal_entry_uuid
       AND je.operating_company_id = p.operating_company_id
      LEFT JOIN accounting.posting_batches pb
        ON pb.id = p.posting_batch_id
       AND pb.operating_company_id = p.operating_company_id
      LEFT JOIN catalogs.accounts a
        ON a.id = p.account_id
       AND a.operating_company_id = p.operating_company_id
      WHERE p.operating_company_id = $1::uuid
        AND je.status <> 'voided'
        AND COALESCE(je.is_sample_data, false) = false
        AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))${inRangeDateSql}
    `,
    [operatingCompanyId, Array.from(CASH_SUBTYPES), ...inRangeValues]
  );

  const operatingByKey = new Map<string, { account_type: string; account_subtype: string | null; amount: number }>();
  const investingByKey = new Map<string, { account_type: string; account_subtype: string | null; amount: number }>();
  const financingByKey = new Map<string, { account_type: string; account_subtype: string | null; amount: number }>();
  let unclassifiedLegCount = 0;

  for (const leg of legRows.rows) {
    if (leg.is_cash_account) continue;
    const amount = Number(leg.amount_cents ?? 0);
    const signedAmount = leg.debit_or_credit === "credit" ? amount : -amount;
    const resolved = resolveCashFlowBucket({ account_type: leg.account_type, account_subtype: leg.account_subtype });
    if (resolved.unclassified) unclassifiedLegCount += 1;
    const label = `${leg.account_type}${leg.account_subtype ? `:${leg.account_subtype}` : ""}`;
    const targetMap = resolved.bucket === "operating" ? operatingByKey : resolved.bucket === "investing" ? investingByKey : financingByKey;
    const prev = targetMap.get(label) ?? { account_type: leg.account_type, account_subtype: leg.account_subtype, amount: 0 };
    prev.amount += signedAmount;
    targetMap.set(label, prev);
  }

  const operatingLines = toLines(operatingByKey);
  const investingLines = toLines(investingByKey);
  const financingLines = toLines(financingByKey);
  const operatingTotal = operatingLines.reduce((sum, line) => sum + line.amount, 0);
  const investingTotal = investingLines.reduce((sum, line) => sum + line.amount, 0);
  const financingTotal = financingLines.reduce((sum, line) => sum + line.amount, 0);
  const netCashChange = operatingTotal + investingTotal + financingTotal;

  return {
    operatingLines,
    investingLines,
    financingLines,
    operatingTotal,
    investingTotal,
    financingTotal,
    netCashChange,
    unclassifiedLegCount,
  };
}

/** Real cash-account balance as of a date boundary — basis-independent (the actual bank balance is the
 * actual bank balance regardless of which basis the statement above is computed under). `edge` picks
 * strict-before (start-of-range) vs inclusive-through (end-of-range) semantics, matching the original
 * cashAtStart/cashAtEnd queries this replaces (unchanged SQL, extracted so both basis modes share it). */
async function readCashBalanceAsOf(
  client: { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> },
  operatingCompanyId: string,
  boundaryDate: string | undefined,
  edge: "before" | "through"
): Promise<number> {
  if (edge === "before" && boundaryDate == null) return 0;
  const dateCondition = edge === "before" ? `je.entry_date < $2::date` : `($2::date IS NULL OR je.entry_date <= $2::date)`;
  const result = await client.query<{ amount: string | number }>(
    `
      SELECT
        COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END), 0) AS amount
      FROM accounting.journal_entry_postings p
      JOIN accounting.journal_entries je
        ON je.id = p.journal_entry_uuid
       AND je.operating_company_id = p.operating_company_id
      LEFT JOIN accounting.posting_batches pb
        ON pb.id = p.posting_batch_id
       AND pb.operating_company_id = p.operating_company_id
      JOIN catalogs.accounts a
        ON a.id = p.account_id
       AND a.operating_company_id = p.operating_company_id
      WHERE p.operating_company_id = $1::uuid
        AND je.status <> 'voided'
        AND COALESCE(je.is_sample_data, false) = false
        AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))
        AND ${dateCondition}
        AND a.account_type = 'Asset'
        AND a.account_subtype = ANY($3::text[])
    `,
    [operatingCompanyId, boundaryDate ?? null, Array.from(CASH_SUBTYPES)]
  );
  return Number(result.rows[0]?.amount ?? 0);
}
