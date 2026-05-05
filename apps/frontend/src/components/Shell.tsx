import type { AuthMeResponse } from "../types/api";
import type { ReactNode } from "react";
import { colors, spacing, typography } from "../design/tokens";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

type Props = {
  auth: AuthMeResponse["user"];
  children: ReactNode;
};

export function Shell({ auth, children }: Props) {
  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: colors.bodyBg, fontFamily: typography.fontSans }}>
      <Topbar auth={auth} />
      <div className="flex min-h-[calc(100vh-48px)]">
        <Sidebar role={auth.role} />
        <main className="flex-1" style={{ backgroundColor: colors.bodyBg, padding: spacing.pageContentPadding }}>
          {children}
        </main>
      </div>
    </div>
  );
}
