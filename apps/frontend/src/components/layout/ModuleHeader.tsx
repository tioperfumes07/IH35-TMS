import type { ReactNode } from "react";
import type { ListsModule } from "../../api/listsHub";
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
        <>
          {countModule ? <SubNavCounts module={countModule} /> : null}
          {actions}
        </>
      }
    />
  );
}
