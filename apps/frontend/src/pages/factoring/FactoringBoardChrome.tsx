import type { ReactNode } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";

type SubNavItem = { label: string; to: string };

/** Factoring module header + tab strip (443.326). */
export function FactoringBoardChrome({
  title,
  subtitle,
  actions,
  subnavItems,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  subnavItems: SubNavItem[];
}) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} actions={actions} />
      <NavyPageSubNav items={subnavItems} />
    </>
  );
}
