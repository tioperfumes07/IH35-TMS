export function CustomReportBuilderCard() {
  return (
    <section className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-3 py-2">
      <div className="text-sm text-slate-700">
        Build custom reports with grouped dimensions, filters, and export templates. Full builder UI ships in Phase 4.
      </div>
      <button type="button" className="rounded border border-[#1f2a44] px-3 py-1.5 text-xs font-semibold text-[#1f2a44] hover:bg-slate-50">
        + Custom report builder
      </button>
    </section>
  );
}
