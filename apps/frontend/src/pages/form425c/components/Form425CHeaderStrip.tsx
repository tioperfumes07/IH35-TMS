type Props = {
  report: Record<string, unknown> | null;
  month: string;
};

export function Form425CHeaderStrip({ report, month }: Props) {
  return (
    <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 text-xs md:grid-cols-6">
      <div>
        <div className="text-gray-500">Debtor</div>
        <div className="font-medium text-gray-900">IH 35 Transportation LLC</div>
      </div>
      <div>
        <div className="text-gray-500">Case #</div>
        <div className="font-medium text-gray-900">{String(report?.case_number ?? "25-50241")}</div>
      </div>
      <div>
        <div className="text-gray-500">Court</div>
        <div className="font-medium text-gray-900">{String(report?.court_district ?? "Southern District of Texas")}</div>
      </div>
      <div>
        <div className="text-gray-500">Reporting Month</div>
        <div className="font-medium text-gray-900">{String(report?.reporting_month ?? `${month}-01`)}</div>
      </div>
      <div>
        <div className="text-gray-500">Subchapter</div>
        <div className="font-medium text-gray-900">{String(report?.subchapter ?? "V")}</div>
      </div>
      <div>
        <div className="text-gray-500">Status</div>
        <div className="font-medium text-gray-900 uppercase">{String(report?.status ?? "draft")}</div>
      </div>
    </div>
  );
}
