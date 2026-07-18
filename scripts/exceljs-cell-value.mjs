export function normalizeExcelJsCellValue(value) {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object") return null;

  if ("result" in value) return normalizeExcelJsCellValue(value.result);
  if ("text" in value || "hyperlink" in value) {
    const display = typeof value.text === "string" && value.text.length > 0 ? value.text : value.hyperlink;
    return normalizeExcelJsCellValue(display);
  }
  if (Array.isArray(value.richText)) {
    return value.richText.map((part) => String(part?.text ?? "")).join("");
  }
  if ("error" in value) return typeof value.error === "string" ? value.error : null;
  return null;
}
