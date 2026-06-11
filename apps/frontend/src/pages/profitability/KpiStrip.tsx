interface KpiStripProps {
  filters: {
    dateFrom: string;
    dateTo: string;
  };
}

export function KpiStrip({ filters }: KpiStripProps) {
  return (
    <div className="flex flex-wrap gap-4 rounded border border-gray-200 bg-white p-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Total Revenue:</span>
        <span className="font-semibold">-</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Total Miles:</span>
        <span className="font-semibold">-</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Avg Rev/Mi:</span>
        <span className="font-semibold">-</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Avg Cost/Mi:</span>
        <span className="font-semibold">-</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Avg Margin/Mi:</span>
        <span className="font-semibold text-green-600">-</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Loads:</span>
        <span className="font-semibold">-</span>
      </div>
      <div className="ml-auto text-xs text-gray-400">
        {filters.dateFrom} — {filters.dateTo}
      </div>
    </div>
  );
}
