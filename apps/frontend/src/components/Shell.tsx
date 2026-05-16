import type { AuthMeResponse } from "../types/api";
import type { ReactNode } from "react";
import { useState } from "react";
import { colors, spacing, typography } from "../design/tokens";
import { FooterFaqLink } from "./PageHelpLink";
import { PostReloadToastHost } from "./PostReloadToastHost";
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
      <PostReloadToastHost />
      <Topbar auth={auth} onOpenMobileNav={() => setMobileNavOpen(true)} />
      <div className="relative flex min-h-0 flex-1">
        <Sidebar role={auth.role} mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
        <main
          className="min-w-0 flex-1 overflow-x-hidden px-2 py-3 sm:px-3 md:px-4"
          style={{ backgroundColor: colors.bodyBg, paddingTop: spacing.pageContentPadding, paddingBottom: spacing.pageContentPadding }}
        >
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
