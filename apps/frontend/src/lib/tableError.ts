import { ApiError } from "../api/client";

const DEFAULT_TRUNC = 200;

export function truncateErrorDetail(text: string, max = DEFAULT_TRUNC): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export type DataTableErrorState = {
  status: number;
  message?: string;
  onRetry: () => void;
};

export function formatQueryErrorDetail(error: unknown): { status: number; message: string } {
  if (error instanceof ApiError) {
    const data = error.data;
    let body = "";
    if (typeof data === "string") {
      body = data;
    } else if (data && typeof data === "object") {
      const rec = data as Record<string, unknown>;
      const err = rec.error ?? rec.message;
      body = typeof err === "string" ? err : JSON.stringify(data);
    }
    return { status: error.status, message: truncateErrorDetail(body || error.message) };
  }
  if (error instanceof Error) {
    return { status: 0, message: truncateErrorDetail(error.message) };
  }
  return { status: 0, message: truncateErrorDetail(String(error)) };
}

export function dataTableErrorState(error: unknown, onRetry: () => void): DataTableErrorState | undefined {
  if (!error) return undefined;
  const { status, message } = formatQueryErrorDetail(error);
  return { status, message, onRetry };
}
