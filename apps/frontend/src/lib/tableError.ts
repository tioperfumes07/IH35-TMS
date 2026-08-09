import { ApiError } from "../api/client";
import { userFacingApiError } from "./api-error-message";

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
  // CU-09 / LST-F148: prefer message/blocker via userFacingApiError — never surface bare E_* from data.error first.
  if (error instanceof ApiError) {
    return {
      status: error.status,
      message: truncateErrorDetail(userFacingApiError(error, "Request failed")),
    };
  }
  if (error instanceof Error) {
    return { status: 0, message: truncateErrorDetail(userFacingApiError(error, "Request failed")) };
  }
  return { status: 0, message: truncateErrorDetail(userFacingApiError(error, "Request failed")) };
}

export function dataTableErrorState(error: unknown, onRetry: () => void): DataTableErrorState | undefined {
  if (!error) return undefined;
  const { status, message } = formatQueryErrorDetail(error);
  return { status, message, onRetry };
}
