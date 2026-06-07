import type { ReactNode } from "react";
import { CmdKQuickSwitcher } from "../components/shared/CmdKQuickSwitcher";

type Props = {
  children: ReactNode;
};

export function AppLayout({ children }: Props) {
  return (
    <>
      {children}
      <CmdKQuickSwitcher />
    </>
  );
}
