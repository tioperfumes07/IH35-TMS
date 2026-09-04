import { ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "../Button";

export type SaveDropdownPersistedAction =
  | "save"
  | "save_and_close"
  | "save_and_add_another"
  | "save_and_print"
  | "save_and_download"
  | "save_and_view_list"
  | "save_and_send";

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
  onSaveAndSend?: () => void | Promise<void>;
  /** WIZ-49: when set (and `onSaveAndSend` is not), a "Save and send" menu item is rendered
   * DISABLED with this reason as its tooltip. Owner named "Save and send" for the split control,
   * but WHAT is sent (rate con vs dispatch sheet) is a pending owner ruling (WIZ-49d) — so the
   * affordance is visible with its reason rather than built as a dead no-op or omitted silently. */
  saveAndSendDisabledReason?: string;
  disabled?: boolean;
  dirty?: boolean;
  loading?: boolean;
  /** Shown as a native tooltip on the primary button. Callers should set this whenever `disabled`
   * is true for a reason the operator can't see elsewhere on the form — a disabled Save with no
   * explanation reads as a silent no-op (CC3TEST-DRIVER-CREATE-SAVE-DISABLED-NO-REASON). */
  title?: string;
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
      raw === "save_and_view_list" ||
      raw === "save_and_send"
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

type ActionEntry = {
  key: SaveDropdownPersistedAction;
  label: string;
  run: () => void | Promise<void>;
  /** Rendered as a disabled menu item (never selectable as primary). */
  disabled?: boolean;
  /** Native tooltip shown on a disabled item so it is never a silent no-op. */
  title?: string;
};

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
  onSaveAndSend,
  saveAndSendDisabledReason,
  disabled = false,
  dirty: _dirty = false,
  loading = false,
  title,
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
    if (onSaveAndSend) {
      entries.push({ key: "save_and_send", label: "Save and send", run: onSaveAndSend });
    } else if (saveAndSendDisabledReason) {
      entries.push({
        key: "save_and_send",
        label: "Save and send",
        run: () => {},
        disabled: true,
        title: saveAndSendDisabledReason,
      });
    }
    return entries;
  }, [
    onSave,
    onSaveAndAddAnother,
    onSaveAndClose,
    onSaveAndDownload,
    onSaveAndPrint,
    onSaveAndViewList,
    onSaveAndSend,
    saveAndSendDisabledReason,
    primaryLabel,
  ]);

  const [primaryKey, setPrimaryKey] = useState<SaveDropdownPersistedAction>("save");

  useEffect(() => {
    const saved = readPreference(storageKey);
    // A disabled action (e.g. the WIZ-49d "Save and send" placeholder) can never be the primary.
    const available = actionList.filter((a) => !a.disabled).map((a) => a.key);
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
    const match = actionList.find((a) => a.key === primaryKey && !a.disabled) ?? actionList.find((a) => !a.disabled);
    if (!match) return;
    writePreference(storageKey, match.key);
    await match.run();
  };

  const selectMenuAction = async (key: SaveDropdownPersistedAction) => {
    const match = actionList.find((a) => a.key === key);
    if (!match || match.disabled) return;
    setMenuOpen(false);
    setPrimaryKey(key);
    writePreference(storageKey, key);
    await match.run();
  };

  const primaryDef =
    actionList.find((a) => a.key === primaryKey && !a.disabled) ?? actionList.find((a) => !a.disabled) ?? actionList[0];
  const primaryText = primaryDef?.label ?? primaryLabel;

  return (
    <div ref={wrapRef} className="relative inline-flex rounded-sm border border-[#16A34A]">
      <Button
        type="button"
        className="rounded-r-none border-r border-green-700"
        disabled={disabled}
        loading={loading}
        title={disabled ? title : undefined}
        onClick={() => void runPrimary()}
      >
        {primaryText}
      </Button>
      <button
        type="button"
        className="inline-flex h-8 items-center bg-[#1f2a44] px-2 text-white hover:bg-[#0f1729] disabled:opacity-60"
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
          className="absolute right-0 top-full z-50 mt-1 min-w-[220px] rounded-sm border border-gray-200 bg-white py-1 text-left text-xs shadow-lg"
        >
          {actionList.map((item) => (
            <li key={item.key} role="none">
              <button
                type="button"
                role="menuitem"
                aria-disabled={item.disabled || undefined}
                disabled={item.disabled}
                title={item.disabled ? item.title : undefined}
                className="block w-full px-3 py-2 text-left hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-white"
                onClick={() => void selectMenuAction(item.key)}
              >
                {item.label}
                {item.disabled ? <span className="ml-1 text-gray-400">(pending)</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
