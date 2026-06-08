import { useState } from "react";
import { AuthGatePanel } from "../../../components/dispatch/AuthGatePanel";
import { Button } from "../../../components/Button";

type Props = {
  operatingCompanyId: string;
  unitUuid?: string;
  driverUuid?: string;
  loadUuid?: string;
  onBook?: () => void;
};

/** GAP-47: Book load review step with dispatch authorization gates. */
export function BookLoad({ operatingCompanyId, unitUuid, driverUuid, loadUuid, onBook }: Props) {
  const [blocked, setBlocked] = useState(false);
  return (
    <section className="space-y-3" data-testid="book-load-auth-gates">
      <h3 className="font-semibold">Authorization gates</h3>
      <AuthGatePanel
        operatingCompanyId={operatingCompanyId}
        action="book_load"
        unitUuid={unitUuid}
        driverUuid={driverUuid}
        loadUuid={loadUuid}
        onBlockersChange={setBlocked}
      />
      <Button type="button" disabled={blocked} onClick={onBook}>Book load</Button>
    </section>
  );
}
