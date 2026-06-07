import type { AuthMeResponse } from "../../types/api";
export { DRIVERS_CANONICAL_SUBNAV_COUNT } from "../../components/drivers/DRIVERS_TABS_CONFIG";
import { OwnerHome } from "./OwnerHome";
import { AccountingHome } from "./roles/AccountingHome";
import { DefaultHome } from "./roles/DefaultHome";
import { DispatcherHome } from "./roles/DispatcherHome";
import { DriverManagerHome } from "./roles/DriverManagerHome";
import { SafetyHome } from "./roles/SafetyHome";

type Props = {
  auth: AuthMeResponse["user"];
};

export function HomePage({ auth }: Props) {
  switch (auth.role) {
    case "Owner":
      return <OwnerHome auth={auth} />;
    case "Dispatcher":
      return <DispatcherHome auth={auth} />;
    case "Accountant":
      return <AccountingHome auth={auth} />;
    case "Safety":
      return <SafetyHome auth={auth} />;
    case "Manager":
      return <DriverManagerHome auth={auth} />;
    default:
      return <DefaultHome auth={auth} />;
  }
}
