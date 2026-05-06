type Props = {
  earnings: number;
  extraPay: number;
  reimbursements: number;
  deductions: number;
  pendingAckDeductions: number;
};

export function NetPaySummary({ earnings, extraPay, reimbursements, deductions, pendingAckDeductions }: Props) {
  const gross = earnings + extraPay + reimbursements;
  const net = gross - deductions;
  return (
    <div className="rounded border border-green-300 bg-white p-3 text-xs">
      <div className="mb-1 text-sm font-semibold text-green-700">Net Pay Summary</div>
      <div className="space-y-1">
        <Row label="Earnings" value={earnings} />
        <Row label="Extra pay" value={extraPay} />
        <Row label="Reimbursements" value={reimbursements} />
        <div className="border-t border-gray-200 pt-1" />
        <Row label="Gross Pay" value={gross} />
        <Row label="Less: Deductions" value={-deductions} />
        <div className="text-[11px] text-gray-500">(Pending-ack deductions ${pendingAckDeductions.toFixed(2)} not yet applied)</div>
        <div className="border-t border-gray-200 pt-1" />
        <div className="flex items-center justify-between font-bold text-green-700">
          <span>NET PAY</span>
          <span>${net.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span>${value.toFixed(2)}</span>
    </div>
  );
}
