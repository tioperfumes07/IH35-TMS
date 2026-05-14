import { apiRequest } from "./client";

export type ClientErrorPayload = {
  message: string;
  stack?: string;
  component_stack?: string;
  url?: string;
  user_agent?: string;
};

export async function postClientError(payload: ClientErrorPayload): Promise<void> {
  try {
    await apiRequest(`/api/v1/admin/client-errors`, { method: "POST", body: payload });
  } catch {
    // Best-effort telemetry — never throw back into the error boundary.
  }
}
