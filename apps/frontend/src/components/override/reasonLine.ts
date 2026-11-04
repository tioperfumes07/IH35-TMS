// Row 28 (443.294) — the one-line form of a confirmed catalog reason: "<label> [<code>]". Machine-made by the shared
// OverrideButton (never typed); the code round-trips so sites that keep the line for display send the CODE to the server.
export function overrideReasonText(code: string, labelEn: string): string {
  return `${labelEn} [${code}]`;
}

/**
 * The catalog code back out of a line built by overrideReasonText ("<label> [<code>]"). Sites that keep the confirmed line
 * for display (Book Load, the pre-dispatch panel, the repair row) send this CODE to the server — never the sentence.
 */
export function overrideReasonCodeOf(line: string | null | undefined): string | null {
  const m = /\[([a-z][a-z0-9_]*)\]\s*$/.exec(String(line ?? "").trim());
  return m ? m[1] : null;
}

