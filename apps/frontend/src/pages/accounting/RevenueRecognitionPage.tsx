import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

export function RevenueRecognitionPage() {
  return (
    <AccountingSubNavWrapper title="Revenue Recognition" subtitle="Deferred revenue schedules and recognition rules">
      <div className="rounded border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
        Revenue recognition schedules are not yet enabled for this account.
      </div>
    </AccountingSubNavWrapper>
  );
}

export default RevenueRecognitionPage;
