import { useState } from "react";
import { DriverProfilePage } from "../../drivers/DriverProfilePage";
import { DriversListPage } from "../../drivers/DriversListPage";

export function DriverFilesTab() {
  const [driverId, setDriverId] = useState<string | null>(null);

  return (
    <div className="rounded border border-gray-200 bg-white p-4">
      {driverId ? (
        <DriverProfilePage driverId={driverId} onBack={() => setDriverId(null)} />
      ) : (
        <DriversListPage onOpenProfile={(nextDriverId) => setDriverId(nextDriverId)} />
      )}
    </div>
  );
}
