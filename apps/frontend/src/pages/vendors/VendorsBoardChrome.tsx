import type { ReactNode } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";

type TabItem = { label: string; to: string };

/** Vendors list chrome (443.326). */
export function VendorsBoardChrome({
  title,
  subtitle,
  actions,
  listTab,
  onListTabChange,
  tabItems,
  tabIds,
  afterHeader,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  listTab: string;
  onListTabChange: (id: string) => void;
  tabItems: TabItem[];
  tabIds: string[];
  afterHeader?: ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} actions={actions} />
      {afterHeader}
      <div data-c31-list-default="vendors">
        <NavyPageSubNav
          activeId={listTab}
          onTabChange={onListTabChange}
          items={tabItems}
          itemIds={tabIds}
        />
      </div>
    </>
  );
}
