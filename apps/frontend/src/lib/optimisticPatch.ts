export type OptimisticPatchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

export async function optimisticPatch<T>(input: {
  applyOptimistic: () => void;
  rollback: () => void;
  request: () => Promise<T>;
  onError?: (message: string) => void;
}): Promise<OptimisticPatchResult<T>> {
  input.applyOptimistic();
  try {
    const data = await input.request();
    return { ok: true, data };
  } catch (error) {
    input.rollback();
    const message = error instanceof Error ? error.message : "Update failed";
    input.onError?.(message);
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status) : undefined;
    return { ok: false, error: message, status };
  }
}
