import type { AuthMeResponse } from "../types/api";
import type { ReactNode } from "react";
import { useState } from "react";
import { colors, spacing, typography } from "../design/tokens";
import { FooterFaqLink } from "./PageHelpLink";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { OnboardingTourHost } from "./onboarding/OnboardingTourHost";

type Props = {
  auth: AuthMeResponse["user"];
  children: ReactNode;
};

export function Shell({ auth, children }: Props) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: colors.bodyBg, fontFamily: typography.fontSans }}>
      <Topbar auth={auth} onOpenMobileNav={() => setMobileNavOpen(true)} />
      <div className="relative flex min-h-[calc(100vh-48px)] flex-1">
        <Sidebar role={auth.role} mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
        <main className="min-w-0 flex-1 overflow-x-auto" style={{ backgroundColor: colors.bodyBg, padding: spacing.pageContentPadding }}>
          <OnboardingTourHost role={auth.role} />
          {children}
          <footer className="mt-10 flex justify-end border-t border-gray-200/80 py-3">
            <FooterFaqLink />
          </footer>
        </main>
      </div>
    </div>
  );
}
