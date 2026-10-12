// TABLE_DATE_OMIT: this table has no date column by design — generic renderer — columns come per section from DriverTelematicsPanel / TelematicsLinksPanel, and every time-series section leads with its own time column there.
import { ParityTable } from "../parity/ParityTable";
import type { Row, Section } from "./telematicsColumns";

export function SectionTable({ ownerKey, section, rows }: { ownerKey: string; section: Section; rows: Row[] }) {
  return (
    <div className="space-y-1" data-testid={`telematics-links-${section.key}`}>
      <h4 className="text-xs font-bold uppercase text-gray-600">
        {section.title} ({rows.length})
      </h4>
      <p className="text-xs text-[#4B5563]">{section.note}</p>
      <ParityTable
        rows={rows}
        columns={section.columns}
        rowKey={(row) => String(row.id ?? row.stop_id ?? `${row.started_at ?? row.read_at ?? ""}-${rows.indexOf(row)}`)}
        storageKey={`telematics-links-${ownerKey}-${section.key}`}
        emptyText={section.empty}
        exportFilename={`${ownerKey}-${section.key}`}
        suppressToolbarRange
      />
    </div>
  );
}

