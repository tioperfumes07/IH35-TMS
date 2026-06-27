import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

export function FixedAssetsPage() {
  return (
    <AccountingSubNavWrapper title="Fixed Assets" subtitle="Fixed asset register and depreciation schedules">
      <div className="rounded border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
        Fixed asset tracking is not yet enabled for this account.
      </div>
    </AccountingSubNavWrapper>
  );
}

export default FixedAssetsPage;
