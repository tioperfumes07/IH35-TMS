type Props = {
  pendingQboCount: number;
};

export function IntegrationsStrip({ pendingQboCount }: Props) {
  return (
    <div className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600">
      ● QuickBooks connected | ● Samsara: 100 vehicles · Last sync 2 min ago | ● {pendingQboCount} pending QBO sync |{" "}
      <button type="button" className="text-blue-700 underline">
        View sync log →
      </button>
    </div>
  );
}
