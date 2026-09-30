import type { AuthMeResponse } from "../types/api";
import type { ReactNode } from "react";
import { useState } from "react";
import { colors, spacing, typography } from "../design/tokens";
import { UltraWideContainer } from "./layout/UltraWideContainer";
import { FooterFaqLink } from "./PageHelpLink";
import { PostReloadToastHost } from "./PostReloadToastHost";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { OnboardingTourHost } from "./onboarding/OnboardingTourHost";
import { AppLayout } from "../layouts/AppLayout";
import "../styles/responsive-breakpoints.css";
import "../styles/responsive-shell.css";

type Props = {
  auth: AuthMeResponse["user"];
  children: ReactNode;
};

export function Shell({ auth, children }: Props) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <AppLayout>
      {/* C-05 MINIMUM-SCROLL: lock chrome to the viewport; pages scroll inside main, not the document. */}
      <div
        className="ih35-responsive-shell flex h-dvh max-h-dvh flex-col overflow-hidden"
        data-ih35-shell="laptop-desktop-tv"
        data-c05-min-scroll="chrome"
        style={{ backgroundColor: colors.bodyBg, fontFamily: typography.fontSans }}
      >
        <PostReloadToastHost />
        <Topbar auth={auth} onOpenMobileNav={() => setMobileNavOpen(true)} />
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <Sidebar role={auth.role} mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
          <main
            className="ih35-main-shell flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-2 py-2 sm:px-3 md:px-4"
            style={{ backgroundColor: colors.bodyBg, paddingTop: spacing.pageContentPadding, paddingBottom: spacing.pageContentPadding }}
          >
            <OnboardingTourHost role={auth.role} />
            {/* Edge-breakpoint hardening (EDGE-BREAKPOINTS-AUDIT): centers + caps page content on
                ultra-wide monitors (>=1920px); a no-op below that width.
                C-05: flex column fill + internal scroll so documentElement does not grow. */}
            <UltraWideContainer className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {children}
            </UltraWideContainer>
            <footer className="mt-2 flex shrink-0 justify-end border-t border-gray-200/80 py-2">
              <FooterFaqLink />
            </footer>
          </main>
        </div>
      </div>
    </AppLayout>
  );
}
