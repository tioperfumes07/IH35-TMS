import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  postDataImportMultipart,
  dataImportTemplateUrl,
  type DataImportCommitResponse,
  type DataImportPreviewResponse,
} from "../../api/data-import";
import { ApiError } from "../../api/client";
import { helpUrlFromRel } from "../../config/help-links";
import { PageHeader } from "../../components/layout/PageHeader";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

type EntitySlug = "drivers" | "units" | "customers" | "vendors" | "bank-accounts" | "loads" | "bank-transactions";

type EntityOption = {
  slug: EntitySlug;
  title: string;
  description: string;
  companyRequired: boolean;
};

const ENTITIES: EntityOption[] = [
  {
    slug: "drivers",
    title: "Drivers",
    description: "CDL roster, contact info, and employment status for each operating company.",
    companyRequired: true,
  },
  {
    slug: "units",
    title: "Units (tractors & trailers)",
    description: "Fleet assets — equipment numbers, VINs, and assignment metadata mapped to your CSV schema.",
    companyRequired: true,
  },
  {
    slug: "customers",
    title: "Customers",
    description: "Shippers and brokers with billing attributes keyed for invoices and AR workflows.",
    companyRequired: true,
  },
  {
    slug: "vendors",
    title: "Vendors",
    description: "Carriers and suppliers used in AP, maintenance, and fuel programs.",
    companyRequired: true,
  },
  {
    slug: "bank-accounts",
    title: "Bank accounts",
    description: "Chart-linked cash accounts (uses company_code on each row for multi-company files).",
    companyRequired: false,
  },
  {
    slug: "loads",
    title: "Loads",
    description: "Historical or operational loads with company_code per CSV row.",
    companyRequired: false,
  },
  {
    slug: "bank-transactions",
    title: "Bank transactions",
    description: "Posted or imported banking activity reconciled to internal accounts.",
    companyRequired: false,
  },
];

const POST_IMPORT_LINKS: Record<EntitySlug, { label: string; to: string }> = {
  drivers: { label: "Open Drivers", to: "/drivers" },
  units: { label: "Open Maintenance hub", to: "/maintenance" },
  customers: { label: "Open Customers", to: "/customers" },
  vendors: { label: "Open Vendors", to: "/vendors" },
  "bank-accounts": { label: "Open Banking", to: "/banking" },
  loads: { label: "Open Dispatch", to: "/dispatch" },
  "bank-transactions": { label: "Open Banking", to: "/banking" },
};

function errorMessageFromApi(err: unknown): string {
  if (err instanceof ApiError && err.data && typeof err.data === "object") {
    const d = err.data as Record<string, unknown>;
    if (typeof d.message === "string") return d.message;
    if (typeof d.error === "string") return d.error;
  }
  return err instanceof Error ? err.message : "Request failed";
}

export function DataImportPage() {
  const [step, setStep] = useState(1);
  const [entity, setEntity] = useState<EntitySlug>("drivers");
  const [companyCode, setCompanyCode] = useState<"TRK" | "TRANSP">("TRK");
  const [applyCompanyFilter, setApplyCompanyFilter] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DataImportPreviewResponse | null>(null);
  const [commitResult, setCommitResult] = useState<DataImportCommitResponse | null>(null);

  const selected = useMemo(() => ENTITIES.find((e) => e.slug === entity)!, [entity]);

  const effectiveCompanyCode = selected.companyRequired || applyCompanyFilter ? companyCode : undefined;

  const goNextFromUpload = useCallback(async () => {
    setPageError(null);
    if (!file) {
      setPageError("Choose a CSV file first.");
      return;
    }
    setBusy(true);
    try {
      const res = await postDataImportMultipart(file, {
        entityType: entity,
        companyCode: effectiveCompanyCode,
      });
      if ("valid_rows" in res) {
        setPreview(res);
        setStep(3);
      } else {
        setPageError("Unexpected response — expected preview payload.");
      }
    } catch (e) {
      setPageError(errorMessageFromApi(e));
    } finally {
      setBusy(false);
    }
  }, [file, entity, effectiveCompanyCode]);

  const runCommit = useCallback(async () => {
    setPageError(null);
    if (!file) {
      setPageError("File missing — go back to upload.");
      return;
    }
    setBusy(true);
    try {
      const res = await postDataImportMultipart(file, {
        entityType: entity,
        companyCode: effectiveCompanyCode,
        commit: true,
      });
      if ("inserted_rows" in res) {
        setCommitResult(res);
        setStep(5);
      } else {
        setPageError("Unexpected response — expected commit summary.");
      }
    } catch (e) {
      setPageError(errorMessageFromApi(e));
      setStep(5);
    } finally {
      setBusy(false);
    }
  }, [file, entity, effectiveCompanyCode]);

  const resetWizard = () => {
    setStep(1);
    setFile(null);
    setPreview(null);
    setCommitResult(null);
    setPageError(null);
    setApplyCompanyFilter(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Production data import" subtitle="Owner / Administrator — CSV wizard" />

      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={`rounded-full px-2 py-1 ${step === n ? "bg-slate-100 font-semibold text-slate-700" : "bg-slate-100"}`}
          >
            Step {n}
          </span>
        ))}
      </div>

      <p className="text-sm text-slate-600">
        Import curated production CSVs without shell access. Read the{" "}
        <a className="text-slate-700 underline" href={helpUrlFromRel("docs/seed-real-data-guide.md")} target="_blank" rel="noreferrer">
          seed real data guide
        </a>{" "}
        for formatting rules. Uploads use the same validation as <span className="font-mono text-xs">npm run seed:from-csv</span>.
      </p>

      {pageError ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{pageError}</div>
      ) : null}

      {step === 1 ? (
        <section className="space-y-3 rounded border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-900">1. Entity type</h2>
          <div className="space-y-3">
            {ENTITIES.map((opt) => (
              <label key={opt.slug} className="flex cursor-pointer gap-3 rounded border border-slate-100 p-3 hover:bg-slate-50">
                <input
                  type="radio"
                  className="mt-1"
                  name="entity"
                  checked={entity === opt.slug}
                  onChange={() => setEntity(opt.slug)}
                />
                <div>
                  <div className="font-medium text-slate-900">{opt.title}</div>
                  <div className="text-sm text-slate-600">{opt.description}</div>
                </div>
              </label>
            ))}
          </div>
          <button
            type="button"
            className="rounded bg-[#1F2A44] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1F2A44]"
            onClick={() => setStep(2)}
          >
            Continue
          </button>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-4 rounded border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-900">2. Upload CSV</h2>
          {selected.companyRequired ? (
            <label className="block text-sm">
              <span className="font-medium text-slate-800">Operating company</span>
              <SelectCombobox
                className="mt-1 block w-full max-w-xs rounded border border-slate-300 h-9 px-2 text-[13px]"
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value as "TRK" | "TRANSP")}
              >
                <option value="TRK">TRK</option>
                <option value="TRANSP">TRANSP</option>
              </SelectCombobox>
            </label>
          ) : (
            <div className="space-y-2 text-sm text-slate-600">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={applyCompanyFilter} onChange={(e) => setApplyCompanyFilter(e.target.checked)} />
                Limit rows to a single operating company (optional query filter)
              </label>
              {applyCompanyFilter ? (
                <SelectCombobox
                  className="block max-w-xs rounded border border-slate-300 h-9 px-2 text-[13px]"
                  value={companyCode}
                  onChange={(e) => setCompanyCode(e.target.value as "TRK" | "TRANSP")}
                >
                  <option value="TRK">TRK</option>
                  <option value="TRANSP">TRANSP</option>
                </SelectCombobox>
              ) : (
                <p className="text-xs text-slate-500">
                  Row-scoped CSVs carry <span className="font-mono">company_code</span> per line. Leave the box off to import every row in the file.
                </p>
              )}
            </div>
          )}

          <div className="text-sm">
            <a className="font-medium text-slate-700 underline" href={dataImportTemplateUrl(entity)} target="_blank" rel="noreferrer">
              Download CSV template ({entity})
            </a>
          </div>

          <label className="flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600 hover:bg-slate-100">
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setFile(f ?? null);
              }}
            />
            <span className="font-medium text-slate-800">Drop a CSV here or click to browse</span>
            {file ? <span className="mt-2 font-mono text-xs text-slate-700">{file.name}</span> : <span className="mt-2 text-xs">Required — UTF-8 CSV matching the template headers</span>}
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded border border-slate-300 px-3 py-2 text-sm" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded bg-[#1F2A44] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1F2A44] disabled:opacity-60"
              onClick={() => void goNextFromUpload()}
            >
              {busy ? "Validating…" : "Run preview"}
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 && preview ? (
        <section className="space-y-4 rounded border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-900">3. Preview</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded border border-emerald-100 bg-emerald-50 p-3 text-sm">
              <div className="font-semibold text-emerald-900">Valid rows</div>
              <div className="text-2xl font-bold text-emerald-800">{preview.valid_rows}</div>
            </div>
            <div className="rounded border border-amber-100 bg-amber-50 p-3 text-sm">
              <div className="font-semibold text-amber-900">Invalid rows</div>
              <div className="text-2xl font-bold text-amber-800">{preview.invalid_rows}</div>
            </div>
          </div>

          {preview.sample_valid.length ? (
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Sample valid rows</h3>
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(preview.sample_valid, null, 2)}</pre>
            </div>
          ) : null}

          {preview.all_invalid.length ? (
            <div>
              <h3 className="text-sm font-semibold text-slate-800">All invalid rows</h3>
              <ul className="mt-2 max-h-56 list-disc space-y-1 overflow-auto pl-5 text-sm text-red-800">
                {preview.all_invalid.map((row) => (
                  <li key={row.row}>
                    Row {row.row}: {row.errors.join("; ")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {preview.errors.length ? (
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Row messages</h3>
              <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-auto pl-5 text-xs text-slate-700">
                {preview.errors.slice(0, 50).map((e, i) => (
                  <li key={`${e.row}-${i}`}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
                {preview.errors.length > 50 ? <li>…and {preview.errors.length - 50} more</li> : null}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded border border-slate-300 px-3 py-2 text-sm" onClick={() => setStep(2)}>
              Back
            </button>
            <button
              type="button"
              disabled={preview.invalid_rows > 0}
              title={preview.invalid_rows > 0 ? "Fix invalid rows before committing." : undefined}
              className="rounded bg-[#1F2A44] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1F2A44] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setStep(4)}
            >
              Continue to commit
            </button>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="space-y-4 rounded border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-lg font-semibold text-amber-950">4. Confirm commit</h2>
          <p className="text-sm text-amber-950">
            Commits run in a single database transaction. If any row fails validation, the entire import rolls back and nothing is partially saved. Re-imports may skip rows that already exist —
            review your CSV for idempotency before continuing.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm" onClick={() => setStep(3)}>
              Back
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
              onClick={() => void runCommit()}
            >
              {busy ? "Committing…" : "Commit import"}
            </button>
          </div>
        </section>
      ) : null}

      {step === 5 ? (
        <section className="space-y-4 rounded border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-900">5. Result</h2>
          {commitResult ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded border border-slate-100 bg-slate-50 p-3 text-sm">
                  <div className="font-semibold">Inserted</div>
                  <div className="text-2xl font-bold text-slate-900">{commitResult.inserted_rows}</div>
                </div>
                <div className="rounded border border-slate-100 bg-slate-50 p-3 text-sm">
                  <div className="font-semibold">Skipped</div>
                  <div className="text-2xl font-bold text-slate-900">{commitResult.skipped_rows}</div>
                </div>
              </div>
              {commitResult.errors.length ? (
                <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                  <div className="font-semibold">Errors</div>
                  <ul className="mt-2 list-disc pl-5">
                    {commitResult.errors.map((e, idx) => (
                      <li key={`${e.row}-${idx}`}>
                        Row {e.row}: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-emerald-800">Import completed with no row-level errors reported.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-red-800">Import failed — see the message above. Fix the CSV and restart from step 2.</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Link className="rounded bg-[#1F2A44] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1F2A44]" to={POST_IMPORT_LINKS[entity].to}>
              {POST_IMPORT_LINKS[entity].label}
            </Link>
            <button type="button" className="rounded border border-slate-300 px-3 py-2 text-sm" onClick={resetWizard}>
              Start over
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
