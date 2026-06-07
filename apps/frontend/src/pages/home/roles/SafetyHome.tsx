import type { AuthMeResponse } from "../../../types/api";
import { DefaultHome } from "./DefaultHome";

type Props = {
  auth: AuthMeResponse["user"];
};

export function SafetyHome({ auth }: Props) {
  return <DefaultHome auth={auth} />;
}
