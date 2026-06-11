interface ByLoadViewProps {
  filters: {
    dateFrom: string;
    dateTo: string;
    equipmentType?: string;
    customerId?: string;
    laneKey?: string;
  };
}

export function ByLoadView({ filters }: ByLoadViewProps) {
  return (
    <div className="rounded border border-gray-200 bg-white p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">By Load (Detail)</h3>
      <p className="text-sm text-gray-500">
        Per-load detail view for {filters.dateFrom} to {filters.dateTo}.
      </p>
      <div className="overflow-x-auto">
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2">Load ID</th>
            <th className="text-left py-2">Lane</th>
            <th className="text-right py-2">Miles</th>
            <th className="text-right py-2">Revenue</th>
            <th className="text-right py-2">Cost</th>
            <th className="text-right py-2">Margin</th>
            <th className="text-right py-2">$/Mi</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-2 text-gray-500 italic">No data loaded</td>
            <td className="py-2">-</td>
            <td className="py-2 text-right">-</td>
            <td className="py-2 text-right">-</td>
            <td className="py-2 text-right">-</td>
            <td className="py-2 text-right">-</td>
            <td className="py-2 text-right">-</td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  );
}
