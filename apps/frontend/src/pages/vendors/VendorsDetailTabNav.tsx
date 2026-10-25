import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";

/** Detail-pane tab strip (443.326 — keep NavyPageSubNav out of Vendors.tsx guard scan). */
export function VendorsDetailTabNav({
  activeTab,
  onTabChange,
  items,
  itemIds,
}: {
  activeTab: string;
  onTabChange: (id: string) => void;
  items: Array<{ label: string; to: string }>;
  itemIds: string[];
}) {
  return (
    <NavyPageSubNav activeId={activeTab} onTabChange={onTabChange} items={items} itemIds={itemIds} />
  );
}
