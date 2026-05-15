import { useEffect, useMemo, useState } from "react";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { saveAccountVisibility } from "../../../api/banking";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";

type AccountRow = {
  id: string;
  display_name: string;
  account_type: string;
  visible: boolean;
  tag?: string;
  is_dip?: boolean;
};

type Props = {
  open: boolean;
  operatingCompanyId: string;
  accounts: AccountRow[];
  onClose: () => void;
  onSaved: () => void;
};

export function ManageAccountsModal({ open, operatingCompanyId, accounts, onClose, onSaved }: Props) {
  const { pushToast } = useToast();
  const [rows, setRows] = useState<AccountRow[]>(accounts);

  useEffect(() => {
    setRows(accounts);
  }, [accounts]);

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const onDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;
    const from = rows.findIndex((r) => r.id === activeId);
    const to = rows.findIndex((r) => r.id === overId);
    if (from < 0 || to < 0) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setRows(next);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Manage Accounts"
      modalKind="banking-manage-accounts"
      sizePreset="lg"
      resizable
    >
      <DndContext onDragEnd={onDragEnd}>
        <div className="space-y-2 text-xs">
          {rows.map((row, idx) => (
            <div key={row.id} id={row.id} className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-2 rounded border border-gray-200 px-2 py-1">
              <span className="cursor-grab text-gray-500">⋮⋮</span>
              <div>
                <div className="font-semibold">{row.display_name}</div>
                <div className="text-[10px] text-gray-500">{row.account_type}</div>
              </div>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={Boolean(byId.get(row.id)?.visible)}
                  onChange={(event) =>
                    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, visible: event.target.checked } : item)))
                  }
                />
                visible
              </label>
              <select
                className="h-7 rounded border border-gray-300 px-1"
                value={String(byId.get(row.id)?.tag ?? "")}
                onChange={(event) =>
                  setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, tag: event.target.value } : item)))
                }
              >
                {["DIP Operating", "DIP Payroll", "DIP Other", "Factoring", "Escrow", "Relay Fuel", "Credit"].map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={Boolean(byId.get(row.id)?.is_dip)}
                  onChange={(event) =>
                    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, is_dip: event.target.checked } : item)))
                  }
                />
                DIP
              </label>
              <div className="text-[10px] text-gray-500">#{idx + 1}</div>
            </div>
          ))}
        </div>
      </DndContext>

      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button
          size="sm"
          onClick={() => {
            void saveAccountVisibility(
              operatingCompanyId,
              rows.map((row, index) => ({
                id: row.id,
                visible: Boolean(row.visible),
                display_order: index + 1,
                tag: row.tag,
                is_dip: row.is_dip,
              }))
            )
              .then(() => {
                pushToast("Accounts updated", "success");
                onSaved();
                onClose();
              })
              .catch((error) => pushToast(String((error as Error).message || "Failed"), "error"));
          }}
        >
          Save
        </Button>
      </div>
    </Modal>
  );
}
