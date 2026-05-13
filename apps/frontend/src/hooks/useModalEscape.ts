import { useEscapeKey } from "./useEscapeKey";

/** @deprecated Prefer `useEscapeKey` for new code; kept for incremental migration. */
export function useModalEscape(open: boolean, onClose: () => void) {
  useEscapeKey(onClose, open);
}
