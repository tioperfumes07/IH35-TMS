type Props = {
  status: string;
};

function normalizeStatus(status: string) {
  return status.trim().toLowerCase();
}

function badgeClasses(status: string) {
  const normalized = normalizeStatus(status);
  if (["critical", "crit", "terminated", "violation", "error"].includes(normalized)) {
    return "bg-crit/15 text-crit border-crit/30";
  }
  if (["warning", "warn", "probation", "on-duty waiting", "pending"].includes(normalized)) {
    return "bg-warn/15 text-warn border-warn/30";
  }
  if (["info", "off-duty reset", "inservice", "in service"].includes(normalized)) {
    return "bg-info/15 text-info border-info/30";
  }
  if (["active", "ok", "driving", "approved"].includes(normalized)) {
    return "bg-ok/15 text-ok border-ok/30";
  }
  return "bg-inactive/15 text-inactive border-inactive/30";
}

export function StatusBadge({ status }: Props) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeClasses(status)}`}>
      {status}
    </span>
  );
}
