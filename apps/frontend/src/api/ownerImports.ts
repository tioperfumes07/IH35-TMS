/** Owner-only file imports (ACCT-F11108): AlwaysTrack load history (.xlsx) and the Faro purchase report (.csv). commit=false answers the plan, writes nothing. */
import { apiRequest } from "./client";

export const ALWAYSTRACK_LOAD_HISTORY_IMPORT_PATH = "/api/v1/dispatch/loads/import/alwaystrack-load-history";
export const FARO_PURCHASE_REPORT_IMPORT_PATH = "/api/v1/factoring/import/faro-purchase-report";

export type LoadHistoryRowOutcome =
  | "booked_delivered"
  | "booked_dispatched"
  | "would_book_delivered"
  | "would_book_dispatched"
  | "skipped_existing"
  | "not_booked_status"
  | "refused";

export type LoadHistoryImportRow = {
  load_number: string;
  outcome: LoadHistoryRowOutcome;
  at_status: string;
  charges_cents: number;
  refusal?: { code: string; message: string };
};

export type LoadHistoryImportResult = {
  commit: boolean;
  row_count: number;
  booked: { count: number; charges_cents: number };
  skipped_existing: { count: number; charges_cents: number };
  refused: { count: number; charges_cents: number };
  not_booked_status: { count: number; charges_cents: number };
  rows: LoadHistoryImportRow[];
};

export type FaroSeedLineOutcome = "already_present" | "posted" | "would_post" | "held";

export type FaroSeedImportLine = {
  faro_invoice_number: string;
  purchase_date: string | null;
  debtor: string | null;
  gross_cents: number;
  net_advance_cents: number;
  outcome: FaroSeedLineOutcome;
  reason?: string | null;
};

export type FaroSeedImportResult = {
  commit: boolean;
  line_count: number;
  already_present: { count: number; gross_cents: number };
  posted: { count: number; gross_cents: number; purchases: number };
  held: { count: number; gross_cents: number };
  lines: FaroSeedImportLine[];
};

/** Base64 of the picked file's bytes (the route takes the .xlsx as file_base64). */
export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function importAlwaysTrackLoadHistory(input: {
  operatingCompanyId: string;
  sourceCompanyCode: "TRANSP" | "TRK" | "USMCA";
  file: File;
  commit: boolean;
}): Promise<LoadHistoryImportResult> {
  return apiRequest<LoadHistoryImportResult>(ALWAYSTRACK_LOAD_HISTORY_IMPORT_PATH, {
    method: "POST",
    body: {
      operating_company_id: input.operatingCompanyId,
      source_company_code: input.sourceCompanyCode,
      filename: input.file.name,
      file_base64: await fileToBase64(input.file),
      commit: input.commit,
    },
  });
}

export async function importFaroPurchaseReport(input: {
  operatingCompanyId: string;
  file: File;
  commit: boolean;
}): Promise<FaroSeedImportResult> {
  return apiRequest<FaroSeedImportResult>(FARO_PURCHASE_REPORT_IMPORT_PATH, {
    method: "POST",
    body: {
      operating_company_id: input.operatingCompanyId,
      filename: input.file.name,
      csv_text: await input.file.text(),
      commit: input.commit,
    },
  });
}
