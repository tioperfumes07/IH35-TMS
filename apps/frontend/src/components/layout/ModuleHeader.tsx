import type { ReactNode } from "react";
import type { ListsModule } from "../../api/listsHub";
import "../../styles/responsive-breakpoints.css";
import { PageHeader } from "./PageHeader";
import { SubNavCounts } from "./SubNavCounts";

type Props = {
  backHref?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  countModule?: ListsModule;
};

export function ModuleHeader({ backHref, title, subtitle, actions, countModule }: Props) {
  return (
    <PageHeader
      backHref={backHref}
      title={title}
      subtitle={subtitle}
      actions={
        <div className="ih35-module-header-actions flex flex-wrap items-center gap-2">
          {countModule ? <SubNavCounts module={countModule} /> : null}
          {actions}
        </div>
      }
    />
  );
}
