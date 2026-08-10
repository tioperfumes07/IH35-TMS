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
import { within } from "@testing-library/react";

expect.extend(jestDomMatchers);

const createUserMock = vi.fn();
const listUsersMock = vi.fn();
const checkReturningDispatcherMock = vi.fn();
const deactivateUserMock = vi.fn();
const createIdentityWorkflowMock = vi.fn();

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
    deactivateUser: (...args: unknown[]) => deactivateUserMock(...args),
    createIdentityWorkflow: (...args: unknown[]) => createIdentityWorkflowMock(...args),
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
  await screen.findByRole("heading", { name: /create user/i });
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

const activeUser = {
  id: "u1",
  name: "Alice Active",
  email: "alice@example.com",
  role: "Manager",
  deactivated_at: null,
  auth_method: "Password",
  created_at: "2024-01-01T00:00:00Z",
  last_login_at: null,
};
const deactivatedUser = {
  id: "u3",
  name: "Bob Gone",
  email: "bob@example.com",
  role: "Dispatcher",
  deactivated_at: "2025-01-01T00:00:00Z",
  auth_method: "Password",
  created_at: "2024-01-01T00:00:00Z",
  last_login_at: null,
};

describe("UsersPage — Deactivate control", () => {
  beforeEach(() => {
    deactivateUserMock.mockReset();
    checkReturningDispatcherMock.mockResolvedValue({ returning_dispatcher: false });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("(g) row Deactivate button fires the endpoint and shows a toast — not a silent no-op", async () => {
    listUsersMock.mockResolvedValue({ users: [activeUser] });
    deactivateUserMock.mockResolvedValue({ id: "u1", deactivated_at: "2026-07-03T00:00:00Z", was_already_deactivated: false });
    const user = userEvent.setup();
    render(wrap(<UsersPage />));
    const btn = await screen.findByRole("button", { name: /^Deactivate Alice Active$/ });
    await user.click(btn);
    await waitFor(() => expect(deactivateUserMock).toHaveBeenCalledWith("u1", expect.anything()));
    await waitFor(() => expect(toastMessages().some((m) => /deactivated/i.test(m))).toBe(true));
  });

  it("(h) deactivate failure surfaces the server reason — never swallowed", async () => {
    listUsersMock.mockResolvedValue({ users: [activeUser] });
    deactivateUserMock.mockRejectedValue(new ApiError(400, { error: "cannot_deactivate_last_owner" }));
    const user = userEvent.setup();
    render(wrap(<UsersPage />));
    const btn = await screen.findByRole("button", { name: /^Deactivate Alice Active$/ });
    await user.click(btn);
    await waitFor(() => expect(toastMessages().some((m) => /last active owner/i.test(m))).toBe(true));
  });

  it("(i) already-deactivated user renders a disabled control (no silent action)", async () => {
    listUsersMock.mockResolvedValue({ users: [deactivatedUser] });
    render(wrap(<UsersPage />));
    const btn = await screen.findByRole("button", { name: /^Deactivate Bob Gone$/ });
    expect(btn).toBeDisabled();
  });
});

describe("UsersPage — Change role ceremony", () => {
  beforeEach(() => {
    createIdentityWorkflowMock.mockReset();
    listUsersMock.mockResolvedValue({
      users: [
        { id: "owner-1", name: "Owner One", email: "owner@example.com", role: "Owner", deactivated_at: null, auth_method: "Password", created_at: "2024-01-01T00:00:00Z", last_login_at: null },
        { id: "admin-1", name: "Admin One", email: "admin@example.com", role: "Administrator", deactivated_at: null, auth_method: "Password", created_at: "2024-01-01T00:00:00Z", last_login_at: null },
        { id: "u4", name: "Target User", email: "target@example.com", role: "Manager", deactivated_at: null, auth_method: "Password", created_at: "2024-01-01T00:00:00Z", last_login_at: null },
      ],
    });
  });

  it("requires a distinct approver for policy-sensitive role changes", async () => {
    createIdentityWorkflowMock.mockResolvedValue({ id: "wf-1" });
    const user = userEvent.setup();
    render(wrap(<UsersPage />));
    // Target User (Manager) — change role button aria includes name
    const changeBtn = await screen.findByRole("button", { name: /change role for target user/i });
    await user.click(changeBtn);

    const roleInput = screen.getAllByPlaceholderText("Select role").at(-1)!;
    await user.clear(roleInput);
    await user.type(roleInput, "Administrator");
    const roleListbox = await screen.findByRole("listbox");
    await user.click(within(roleListbox).getByRole("option", { name: /^Administrator$/i }));

    expect(screen.getByTestId("user-role-required-approver")).toBeInTheDocument();
    expect(screen.getByText(/policy-sensitive role changes require a distinct approver/i)).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: /submit request/i });
    expect(submit).toBeDisabled();

    await user.click(submit);
    expect(createIdentityWorkflowMock).not.toHaveBeenCalled();

    const approverInput = screen.getByPlaceholderText("Select approver");
    await user.clear(approverInput);
    await user.type(approverInput, "Admin One");
    const approverListbox = await screen.findByRole("listbox");
    await user.click(within(approverListbox).getByRole("option", { name: /Admin One/i }));

    expect(submit).not.toBeDisabled();
    await user.click(submit);
    await waitFor(() => expect(createIdentityWorkflowMock).toHaveBeenCalledOnce());
    const [workflowBody] = createIdentityWorkflowMock.mock.calls[0]!;
    expect(workflowBody).toEqual(
      expect.objectContaining({
        action_code: "WF-064-IDENT-002",
        target_user: "u4",
        payload: expect.objectContaining({
          new_role: "Administrator",
          required_approver_user_id: "admin-1",
        }),
      })
    );
  });
});
