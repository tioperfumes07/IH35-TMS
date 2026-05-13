import { ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "../Button";

export type SaveDropdownPersistedAction =
  | "save"
  | "save_and_close"
  | "save_and_add_another"
  | "save_and_print"
  | "save_and_download"
  | "save_and_view_list";

export type SaveDropdownProps = {
  /** Unique key for remembering last primary action in localStorage */
  storageKey: string;
  primaryLabel?: string;
  onSave: () => void | Promise<void>;
  onSaveAndClose?: () => void | Promise<void>;
  onSaveAndAddAnother?: () => void | Promise<void>;
  onSaveAndPrint?: () => void | Promise<void>;
  onSaveAndDownload?: () => void | Promise<void>;
  onSaveAndViewList?: () => void | Promise<void>;
  disabled?: boolean;
  dirty?: boolean;
  loading?: boolean;
};

const LS_PREFIX = "ih35.saveDropdown.";

function readPreference(key: string): SaveDropdownPersistedAction | null {
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${key}`);
    if (!raw) return null;
    if (
      raw === "save" ||
      raw === "save_and_close" ||
      raw === "save_and_add_another" ||
      raw === "save_and_print" ||
      raw === "save_and_download" ||
      raw === "save_and_view_list"
    ) {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

function writePreference(key: string, action: SaveDropdownPersistedAction) {
  try {
    localStorage.setItem(`${LS_PREFIX}${key}`, action);
  } catch {
    /* ignore */
  }
}

type ActionEntry = { key: SaveDropdownPersistedAction; label: string; run: () => void | Promise<void> };

/**
 * QuickBooks-style split primary + caret menu for form submit affordances.
 */
export function SaveDropdown({
  storageKey,
  primaryLabel = "Save",
  onSave,
  onSaveAndClose,
  onSaveAndAddAnother,
  onSaveAndPrint,
  onSaveAndDownload,
  onSaveAndViewList,
  disabled = false,
  dirty: _dirty = false,
  loading = false,
}: SaveDropdownProps) {
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const actionList: ActionEntry[] = useMemo(() => {
    const entries: ActionEntry[] = [{ key: "save", label: primaryLabel, run: onSave }];
    if (onSaveAndClose) entries.push({ key: "save_and_close", label: "Save and close", run: onSaveAndClose });
    if (onSaveAndAddAnother) entries.push({ key: "save_and_add_another", label: "Save and add another", run: onSaveAndAddAnother });
    if (onSaveAndPrint) entries.push({ key: "save_and_print", label: "Save and print", run: onSaveAndPrint });
    if (onSaveAndDownload) entries.push({ key: "save_and_download", label: "Save and download PDF", run: onSaveAndDownload });
    if (onSaveAndViewList) entries.push({ key: "save_and_view_list", label: "Save and view list", run: onSaveAndViewList });
    return entries;
  }, [
    onSave,
    onSaveAndAddAnother,
    onSaveAndClose,
    onSaveAndDownload,
    onSaveAndPrint,
    onSaveAndViewList,
    primaryLabel,
  ]);

  const [primaryKey, setPrimaryKey] = useState<SaveDropdownPersistedAction>("save");

  useEffect(() => {
    const saved = readPreference(storageKey);
    const available = actionList.map((a) => a.key);
    if (saved && available.includes(saved)) {
      setPrimaryKey(saved);
      return;
    }
    setPrimaryKey((current) => (available.includes(current) ? current : "save"));
  }, [storageKey, actionList]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const runPrimary = async () => {
    const match = actionList.find((a) => a.key === primaryKey) ?? actionList[0];
    if (!match) return;
    writePreference(storageKey, match.key);
    await match.run();
  };

  const selectMenuAction = async (key: SaveDropdownPersistedAction) => {
    setMenuOpen(false);
    setPrimaryKey(key);
    writePreference(storageKey, key);
    const match = actionList.find((a) => a.key === key);
    if (match) await match.run();
  };

  const primaryDef = actionList.find((a) => a.key === primaryKey) ?? actionList[0];
  const primaryText = primaryDef?.label ?? primaryLabel;

  return (
    <div ref={wrapRef} className="relative inline-flex rounded border border-[#16A34A]">
      <Button
        type="button"
        className="rounded-r-none border-r border-green-700"
        disabled={disabled}
        loading={loading}
        onClick={() => void runPrimary()}
      >
        {primaryText}
      </Button>
      <button
        type="button"
        className="inline-flex h-8 items-center bg-[#16A34A] px-2 text-white hover:bg-green-700 disabled:opacity-60"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-controls={menuId}
        disabled={disabled || loading}
        onClick={() => setMenuOpen((o) => !o)}
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      {menuOpen ? (
        <ul
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[220px] rounded border border-gray-200 bg-white py-1 text-left text-[13px] shadow-lg"
        >
          {actionList.map((item) => (
            <li key={item.key} role="none">
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left hover:bg-gray-50"
                onClick={() => void selectMenuAction(item.key)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
