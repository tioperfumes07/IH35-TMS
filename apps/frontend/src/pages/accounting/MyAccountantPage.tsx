import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

export function MyAccountantPage() {
  return (
    <AccountingSubNavWrapper title="My Accountant" subtitle="Accountant access and collaboration tools">
      <div className="rounded border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
        Accountant collaboration features are not yet enabled for this account.
      </div>
    </AccountingSubNavWrapper>
  );
}

export default MyAccountantPage;
