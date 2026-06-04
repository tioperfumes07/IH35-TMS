/** B23 canonical low-stock threshold aligned with parts-inventory KPI (on_hand_qty <= 2). */
export const PARTS_INVENTORY_LOW_STOCK_THRESHOLD = 2;

export function partNeedsReorder(qtyOnHand: number, reorderThreshold = 0): boolean {
  const threshold = reorderThreshold > 0 ? reorderThreshold : PARTS_INVENTORY_LOW_STOCK_THRESHOLD;
  return qtyOnHand <= threshold;
}
