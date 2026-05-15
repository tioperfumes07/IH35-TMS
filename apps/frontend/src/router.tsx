import { Suspense, lazy, type ReactNode } from "react";

export function RouteFallback() {
  return (
    <div className="flex min-h-[12rem] items-center justify-center text-sm text-gray-500" role="status" aria-live="polite">
      Loading…
    </div>
  );
}

export function SuspenseShell({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

/** Lazy route modules (accounting / banking Wave 2). Import from here in App.tsx to keep bundle splits predictable. */
export const CustomersListPage = lazy(() =>
  import("./pages/accounting/CustomersListPage").then((m) => ({ default: m.CustomersListPage }))
);
export const AccountingCustomerDetailPage = lazy(() =>
  import("./pages/accounting/CustomerDetailPage").then((m) => ({ default: m.CustomerDetailPage }))
);
export const VendorsListPage = lazy(() => import("./pages/accounting/VendorsListPage").then((m) => ({ default: m.VendorsListPage })));
export const AccountingVendorDetailPage = lazy(() =>
  import("./pages/accounting/VendorDetailPage").then((m) => ({ default: m.VendorDetailPage }))
);
