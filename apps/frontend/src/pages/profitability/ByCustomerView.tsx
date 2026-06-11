interface ByCustomerViewProps {
  filters: {
    dateFrom: string;
    dateTo: string;
    equipmentType?: string;
  };
}

export function ByCustomerView({ filters }: ByCustomerViewProps) {
  return (
    <div className="rounded border border-gray-200 bg-white p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">By Customer</h3>
      <p className="text-sm text-gray-500">
        Customer profitability view for {filters.dateFrom} to {filters.dateTo}.
      </p>
      <div className="overflow-x-auto">
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2">Customer</th>
            <th className="text-right py-2">Loads</th>
            <th className="text-right py-2">Miles</th>
            <th className="text-right py-2">Rev/Mi</th>
            <th className="text-right py-2">Cost/Mi</th>
            <th className="text-right py-2">Margin/Mi</th>
            <th className="text-right py-2">Total Margin</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-2 text-gray-500 italic">No data loaded</td>
            <td className="py-2 text-right">-</td>
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
