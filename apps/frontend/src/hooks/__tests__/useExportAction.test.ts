import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useExportAction } from "../useExportAction";

// GO-0032-CASH-FLOW-STATEMENT-EXPORT-SILENT-DEAD-CLICK: a bare unawaited
// `onClick={() => exportXReport(...)}` swallowed every rejection silently (a role-gated 403, a
// rate limit, a genuine 500) -- the click looked identical whether it succeeded or failed. This
// hook is the fix: it must surface a failure as a real, readable error string and never leave
// `pending` stuck true.
describe("useExportAction", () => {
  it("surfaces a failed export as a readable error, not a silent no-op", async () => {
    const { result } = renderHook(() => useExportAction());

    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();

    await act(async () => {
      await result.current.run(() => Promise.reject(new Error("forbidden")), "export failed");
    });

    await waitFor(() => {
      expect(result.current.error).toBe("forbidden");
      expect(result.current.pending).toBe(false);
    });
  });

  it("falls back to the caller's message when the rejection isn't an Error instance", async () => {
    const { result } = renderHook(() => useExportAction());

    await act(async () => {
      // e.g. a thrown ApiError-like plain object, or a string rejection.
      await result.current.run(() => Promise.reject("not-an-error-instance"), "export failed");
    });

    await waitFor(() => {
      expect(result.current.error).toBe("export failed");
    });
  });

  it("clears any prior error and stays quiet on a successful run", async () => {
    const { result } = renderHook(() => useExportAction());

    await act(async () => {
      await result.current.run(() => Promise.reject(new Error("first failure")), "export failed");
    });
    await waitFor(() => expect(result.current.error).toBe("first failure"));

    await act(async () => {
      await result.current.run(() => Promise.resolve(), "export failed");
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
      expect(result.current.pending).toBe(false);
    });
  });
});
