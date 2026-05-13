import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError } from "../../../api/client";
import { ToastProvider } from "../../Toast";
import { useFormValidation } from "../useFormValidation";

const schema = z.object({
  a: z.string().min(1, "a required"),
  b: z.string().optional(),
});

function TestHarness({ onSubmit }: { onSubmit: (parsed: z.infer<typeof schema>) => Promise<void> }) {
  const { fieldErrors, apiError, submit, clearFieldError, resetErrors } = useFormValidation({
    schema,
    onSubmit,
  });
  return (
    <div>
      <button type="button" data-testid="reset" onClick={() => resetErrors()}>
        reset
      </button>
      <input
        data-testid="a"
        data-field="a"
        value=""
        readOnly
        aria-hidden
        style={{ display: "none" }}
      />
      <input
        data-testid="b"
        data-field="b"
        value=""
        readOnly
        aria-hidden
        style={{ display: "none" }}
      />
      <button
        type="button"
        data-testid="empty"
        onClick={() =>
          void submit({
            a: "",
            b: "",
          })
        }
      >
        empty
      </button>
      <button
        type="button"
        data-testid="valid"
        onClick={() =>
          void submit({
            a: "ok",
            b: "",
          })
        }
      >
        valid
      </button>
      <button
        type="button"
        data-testid="400"
        onClick={() =>
          void submit({
            a: "ok",
            b: "",
          })
        }
      >
        api400
      </button>
      <button
        type="button"
        data-testid="500"
        onClick={() =>
          void submit({
            a: "ok",
            b: "",
          })
        }
      >
        api500
      </button>
      <button type="button" data-testid="clear-a" onClick={() => clearFieldError("a")}>
        clear a
      </button>
      <div data-testid="fe">{JSON.stringify(fieldErrors)}</div>
      <div data-testid="api">{apiError ?? ""}</div>
    </div>
  );
}

describe("useFormValidation", () => {
  it("populates fieldErrors on empty submit and keeps apiError null", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ToastProvider>
        <TestHarness onSubmit={onSubmit} />
      </ToastProvider>
    );
    await user.click(screen.getByTestId("empty"));
    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId("fe").textContent ?? "{}").a).toBeTruthy();
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId("api").textContent).toBe("");
  });

  it("calls onSubmit and resets errors on valid submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ToastProvider>
        <TestHarness onSubmit={onSubmit} />
      </ToastProvider>
    );
    await user.click(screen.getByTestId("valid"));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ a: "ok", b: "" });
    });
    await waitFor(() => {
      expect(screen.getByTestId("fe").textContent).toBe("{}");
    });
  });

  it("maps ApiError 400 fieldErrors + message", async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new ApiError(400, { message: "Bad", fieldErrors: { a: "server says no" } }));
    render(
      <ToastProvider>
        <TestHarness onSubmit={onSubmit} />
      </ToastProvider>
    );
    await user.click(screen.getByTestId("400"));
    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId("fe").textContent ?? "{}").a).toBe("server says no");
    });
    expect(screen.getByTestId("api").textContent).toContain("Bad");
  });

  it("handles backend validation_error details.fieldErrors", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError(400, {
        error: "validation_error",
        details: { fieldErrors: { a: ["Required"] }, formErrors: [] },
      })
    );
    render(
      <ToastProvider>
        <TestHarness onSubmit={onSubmit} />
      </ToastProvider>
    );
    await user.click(screen.getByTestId("400"));
    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId("fe").textContent ?? "{}").a).toBe("Required");
    });
  });

  it("handles 500 without fieldErrors", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(500, { message: "Server broke" }));
    render(
      <ToastProvider>
        <TestHarness onSubmit={onSubmit} />
      </ToastProvider>
    );
    await user.click(screen.getByTestId("500"));
    await waitFor(() => {
      expect(screen.getByTestId("api").textContent).toContain("Server broke");
    });
    expect(JSON.parse(screen.getByTestId("fe").textContent ?? "{}")).toEqual({});
  });

  it("clearFieldError removes field", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ToastProvider>
        <TestHarness onSubmit={onSubmit} />
      </ToastProvider>
    );
    await user.click(screen.getByTestId("empty"));
    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId("fe").textContent ?? "{}").a).toBeTruthy();
    });
    await user.click(screen.getByTestId("clear-a"));
    await waitFor(() => {
      expect(screen.getByTestId("fe").textContent).toBe("{}");
    });
  });
});
