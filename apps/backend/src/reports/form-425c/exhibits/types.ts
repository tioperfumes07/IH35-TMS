export type ExhibitQueryClient = {
  query: <R = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: R[]; rowCount?: number }>;
};

export type ExhibitPeriod = {
  operating_company_id: string;
  period_start: string;
  period_end: string;
};

export type ExhibitLetter = "a" | "b" | "c" | "d" | "e" | "f";

export type BuiltExhibits = {
  filing_uuid: string;
  operating_company_id: string;
  period_start: string;
  period_end: string;
  built_at: string;
  exhibits: Record<ExhibitLetter, unknown>;
};
