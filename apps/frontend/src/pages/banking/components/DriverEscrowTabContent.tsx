import { DriverEscrowBoardSection } from "./DriverEscrowBoardSection";
import { DriverEscrowLedgerSection } from "./DriverEscrowLedgerSection";

type Props = {
  operatingCompanyId: string;
  driverEscrowBalance: number;
};

/**
 * C-64 Driver Escrow tab: approved board first, never-delete ParityTable ledger below.
 * Journal Entry column + ParityTable grammar live in DriverEscrowLedgerSection.
 */
export function DriverEscrowTabContent({ operatingCompanyId, driverEscrowBalance }: Props) {
  return (
    <div className="space-y-3" data-c51-driver-escrow="1" data-c64-driver-escrow="1">
      <DriverEscrowBoardSection
        operatingCompanyId={operatingCompanyId}
        driverEscrowBalance={driverEscrowBalance}
      />
      <DriverEscrowLedgerSection
        operatingCompanyId={operatingCompanyId}
        driverEscrowBalance={driverEscrowBalance}
      />
    </div>
  );
}
