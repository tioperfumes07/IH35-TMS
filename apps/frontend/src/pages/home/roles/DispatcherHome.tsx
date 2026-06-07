import type { AuthMeResponse } from "../../../types/api";
import { DefaultHome } from "./DefaultHome";

type Props = {
  auth: AuthMeResponse["user"];
};

export function DispatcherHome({ auth }: Props) {
  return <DefaultHome auth={auth} />;
}
