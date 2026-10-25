import type { ReactNode } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";

type SubNavItem = { label: string; to: string };

/** Fuel board header + tab strip (443.326 — forbidden chrome lives off FuelPlannerHome.tsx). */
export function FuelPlannerBoardChrome({
  title,
  subtitle,
  backHref,
  actions,
  subnavItems,
}: {
  title: string;
  subtitle: string;
  backHref?: string;
  actions?: ReactNode;
  subnavItems: SubNavItem[];
}) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} backHref={backHref} actions={actions} />
      <NavyPageSubNav items={subnavItems} />
    </>
  );
}
