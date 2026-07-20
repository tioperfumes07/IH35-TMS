import { CoiTab } from "../CoiTab";

type Props = {
  customerId: string;
  customerName: string;
  operatingCompanyId?: string;
};

/** CustomerDetail COI mount — thin wrapper over shared CoiTab (full-page). */
export function CoiRequestsTab(props: Props) {
  return <CoiTab {...props} variant="full-page" />;
}
