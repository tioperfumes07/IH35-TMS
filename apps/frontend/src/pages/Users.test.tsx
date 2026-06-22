// @vitest-environment jsdom
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { ToastProvider } from "../components/Toast";
import { UsersPage } from "./Users";

expect.extend(jestDomMatchers);

const createUserMock = vi.fn();
const listUsersMock = vi.fn();
const checkReturningDispatcherMock = vi.fn();

vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({
    user: { role: "Owner", uuid: "81111181-1111-4111-8111-111111111111" },
    session: null,
    isLoading: false,
    isUnauthenticated: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("../api/identity", async () => {
  const actual = await vi.importActual<typeof import("../api/identity")>("../api/identity");
  return {
    ...actual,
    listUsers: (...args: unknown[]) => listUsersMock(...args),
    checkReturningDispatcher: (...args: unknown[]) => checkReturningDispatcherMock(...args),
    createUser: (...args: unknown[]) => createUserMock(...args),
    deactivateUser: vi.fn(),
    createIdentityWorkflow: vi.fn(),
  };
});

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** Click the first "+ Create User" button (PageHeader may render multiple in some viewport breakpoints). */
async function openInviteModal(user: ReturnType<typeof userEvent.setup>) {
  const btns = screen.getAllByRole("button", { name: /\+ Create User/i });
  await user.click(btns[0]!);
  await screen.findByRole("heading", { name: /add user/i });
}

async function chooseSetPasswordMode(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: /set initial password now/i }));
}

/** Types into the Name and Email fields inside the Add User modal.
 *  The page has a search textbox at index 0, so modal Name=index[1], Email=index[2]. */
async function fillModalBasics(user: ReturnType<typeof userEvent.setup>, name = "Test User", email = "new.user@example.com") {
  const textboxes = screen.getAllByRole("textbox");
  await user.type(textboxes[1]!, name);
  await user.type(textboxes[2]!, email);
}

async function typePassword(user: ReturnType<typeof userEvent.setup>, value: string) {
  const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;
  expect(passwordInput).not.toBeNull();
  await user.type(passwordInput, value);
}

/** Returns text content of all visible toast alerts. */
function toastMessages(): string[] {
  return screen.queryAllByTestId("toast-message").map((el) => el.textContent ?? "");
}

describe("UsersPage — Add User submit", () => {
  beforeEach(() => {
    createUserMock.mockReset();
    listUsersMock.mockResolvedValue({ users: [] });
    checkReturningDispatcherMock.mockResolvedValue({ returning_dispatcher: false });
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("(a) 400 validation_error from API surfaces a toast — not silent", async () => {
    createUserMock.mockRejectedValue(
      new ApiError(400, {
        error: "validation_error",
        details: { fieldErrors: { initial_password: ["Password too weak"] } },
      })
    );
    const user = userEvent.setup();
    render(wrap(<UsersPage />));
    await openInviteModal(user);
    await chooseSetPasswordMode(user);
    await fillModalBasics(user);
    await typePassword(user, "Aa1!abcdefghij");
    await user.click(screen.getByRole("button", { name: /^create user$/i }));
    await waitFor(() => expect(createUserMock).toHaveBeenCalledOnce());
    await waitFor(() => {
      const msgs = toastMessages();
      expect(msgs.some((m) => m.length > 0)).toBe(true);
    });
  });

  it("(b) weak password shows hint toast and does NOT call API", async () => {
    const user = userEvent.setup();
    render(wrap(<UsersPage />));
    await openInviteModal(user);
    await chooseSetPasswordMode(user);
    await fillModalBasics(user);
    await typePassword(user, "weak");
    const submit = screen.getByRole("button", { name: /^create user$/i });
    expect(submit).not.toBeDisabled();
    await user.click(submit);
    await waitFor(() => {
      const msgs = toastMessages();
      expect(msgs.some((m) => m.includes("12 characters") || m.includes("password"))).toBe(true);
    });
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it("(c) invite mode: submit enabled without password, no checklist shown", async () => {
    const user = userEvent.setup();
    render(wrap(<UsersPage />));
    await openInviteModal(user);
    expect((screen.getByRole("radio", { name: /email invite/i }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("button", { name: /create and send invite/i })).not.toBeDisabled();
    expect(screen.queryByText(/Lowercase letter/i)).toBeNull();
  });

  it("(d) valid set-password form fires POST and shows success toast", async () => {
    createUserMock.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000003",
      name: "Test User",
      email: "new.user@example.com",
      role: "Manager",
    });
    const user = userEvent.setup();
    render(wrap(<UsersPage />));
    await openInviteModal(user);
    await chooseSetPasswordMode(user);
    await fillModalBasics(user);
    await typePassword(user, "Aa1!abcdefghij");

    const submit = screen.getByRole("button", { name: /^create user$/i });
    expect(submit).not.toBeDisabled();
    await user.click(submit);

    await waitFor(() => {
      expect(createUserMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Test User",
          email: "new.user@example.com",
          initial_password: "Aa1!abcdefghij",
          send_password_setup_invite: false,
        }),
        expect.anything()
      );
    });
    await waitFor(() => {
      const msgs = toastMessages();
      expect(msgs.some((m) => /user created/i.test(m))).toBe(true);
    });
  });

  it("(e) any unexpected API error surfaces a visible error toast — never silently swallowed", async () => {
    createUserMock.mockRejectedValue(new ApiError(500, { error: "internal_server_error" }));
    const user = userEvent.setup();
    render(wrap(<UsersPage />));
    await openInviteModal(user);
    await chooseSetPasswordMode(user);
    await fillModalBasics(user);
    await typePassword(user, "Aa1!abcdefghij");

    await user.click(screen.getByRole("button", { name: /^create user$/i }));
    await waitFor(() => expect(createUserMock).toHaveBeenCalledOnce());
    await waitFor(() => {
      const msgs = toastMessages();
      const errorToast = msgs.find((m) => /failed to create user/i.test(m));
      expect(errorToast).toBeDefined();
    });
  });

  it("(f) returning dispatcher warning blocks submit until checkbox acknowledged", async () => {
    checkReturningDispatcherMock.mockResolvedValue({
      returning_dispatcher: true,
      matched_events: [{ id: "e1" }],
      severity_summary: { severe_count: 1, warning_count: 0, info_count: 0 },
    });
    createUserMock.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000004" });
    const user = userEvent.setup();
    render(wrap(<UsersPage />));
    await openInviteModal(user);
    await fillModalBasics(user);

    await waitFor(() => {
      const warning = screen.queryAllByText((_, el) =>
        (el?.textContent ?? "").toLowerCase().includes("returning dispatcher detected")
      );
      expect(warning.length).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole("button", { name: /create and send invite/i }));
    expect(createUserMock).not.toHaveBeenCalled();

    const checkbox = screen.getByRole("checkbox", { name: /acknowledge/i });
    await user.click(checkbox);
    await user.click(screen.getByRole("button", { name: /create and send invite/i }));

    await waitFor(() => {
      expect(createUserMock).toHaveBeenCalledWith(
        expect.objectContaining({ override_returning_warning: true }),
        expect.anything()
      );
    });
  });
});
