function padLabel(label, width = 16) {
  return `${label}:`.padEnd(width, " ");
}

function normalizeLine(value, fallback = "unknown") {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

export function formatSyncStatus(report) {
  const lines = [];
  lines.push("═══════════════════════════════════════════════════");
  lines.push(`SYNC REPORT — ${normalizeLine(report.timestamp)}`);
  lines.push("═══════════════════════════════════════════════════");
  lines.push(`${padLabel("Branch")}${normalizeLine(report.branch)}`);
  lines.push(`${padLabel("HEAD")}${normalizeLine(report.head)}`);
  lines.push(`${padLabel("Working tree")}${normalizeLine(report.workingTree)}`);
  lines.push(`${padLabel("Main HEAD")}${normalizeLine(report.mainHead)}`);
  lines.push(`${padLabel("Branch vs main")}${normalizeLine(report.branchVsMain)}`);
  lines.push(`${padLabel("Open PR")}${normalizeLine(report.openPr)}`);
  lines.push("Env:");

  const envEntries = report.env ?? {};
  const envKeys = Object.keys(envEntries);
  if (envKeys.length === 0) {
    lines.push("  (none)");
  } else {
    for (const key of envKeys) {
      lines.push(`  ${key}: ${normalizeLine(envEntries[key])}`);
    }
  }

  lines.push(`${padLabel("Block context")}${normalizeLine(report.blockContext)}`);
  lines.push(`${padLabel("Next blocks")}${normalizeLine(report.nextBlocks)}`);
  lines.push(`${padLabel("RECOMMENDED NEXT")}${normalizeLine(report.recommendedNext)}`);
  lines.push("═══════════════════════════════════════════════════");
  return lines.join("\n");
}
