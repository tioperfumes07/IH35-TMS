type Props = {
  rowCount: number;
  onRefresh: () => void;
};

export function RegisterToolbar({ rowCount, onRefresh }: Props) {
  return (
    <div className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2 text-xs">
      <div>{rowCount} transactions</div>
      <button type="button" className="text-blue-700 underline" onClick={onRefresh}>Refresh</button>
    </div>
  );
}
