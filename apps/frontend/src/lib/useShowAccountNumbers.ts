import { useCallback, useEffect, useState } from "react";
import {
  getShowAccountNumbers,
  setShowAccountNumbers as persistShowAccountNumbers,
} from "./show-account-numbers";

/** React hook — default OFF; syncs across tabs via storage + custom event. */
export function useShowAccountNumbers(): [boolean, (on: boolean) => void] {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(getShowAccountNumbers());
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "ih35.showAccountNumbers") {
        setShow(getShowAccountNumbers());
      }
    };
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ on?: boolean }>).detail;
      if (typeof detail?.on === "boolean") setShow(detail.on);
      else setShow(getShowAccountNumbers());
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("ih35:show-account-numbers", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("ih35:show-account-numbers", onCustom as EventListener);
    };
  }, []);

  const set = useCallback((on: boolean) => {
    persistShowAccountNumbers(on);
    setShow(on);
  }, []);

  return [show, set];
}
