import { CoiTab } from "./CoiTab";

type Props = {
  customerId: string;
  customerName: string;
  operatingCompanyId?: string;
};

/** Customers list COI mount — thin wrapper over shared CoiTab (list-preview). */
export function CustomerCOITab(props: Props) {
  return <CoiTab {...props} variant="list-preview" />;
}
