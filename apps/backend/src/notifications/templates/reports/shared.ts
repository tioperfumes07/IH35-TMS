export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function centsToUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

export function emailShell(title: string, generatedAt: string, summary: string, tableHtml: string, notes?: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="max-width:760px;margin:20px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <div style="padding:16px 20px;background:#0f172a;color:#ffffff;">
        <h1 style="margin:0;font-size:20px;">${escapeHtml(title)}</h1>
      </div>
      <div style="padding:16px 20px;">
        <p style="margin:0 0 10px;"><strong>Generated:</strong> ${escapeHtml(generatedAt)}</p>
        <p style="margin:0 0 14px;"><strong>Summary:</strong> ${escapeHtml(summary)}</p>
        ${tableHtml}
        ${notes ? `<p style="margin:14px 0 0;color:#475569;font-size:12px;">${escapeHtml(notes)}</p>` : ""}
      </div>
    </div>
  </body>
</html>`;
}

export function textShell(title: string, generatedAt: string, summary: string, lines: string[], notes?: string): string {
  return [
    title,
    "",
    `Generated: ${generatedAt}`,
    `Summary: ${summary}`,
    "",
    ...lines,
    ...(notes ? ["", `Notes: ${notes}`] : []),
  ].join("\n");
}

