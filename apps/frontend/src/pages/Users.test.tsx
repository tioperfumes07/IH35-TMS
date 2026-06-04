// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { OFFICE_PASSWORD_HINT } from "../auth/office-password-ui";
import { ToastProvider } from "../components/Toast";
import { UsersPage } from "./Users";

const createUserMock = vi.fn();
const listUsersMock = vi.fn().mockResolvedValue({ users: [] });
const checkReturningDispatcherMock = vi.fn().mockResolvedValue({ returning_dispatcher: false });

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

async function openInviteModal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /\+ Add User/i }));
  await screen.findByRole("heading", { name: /add user/i });
}

async function chooseSetPasswordMode(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: /set initial password now/i }));
}

async function fillInviteBasics(user: ReturnType<typeof userEvent.setup>) {
  const textboxes = screen.getAllByRole("textbox");
  await user.type(textboxes[0]!, "Test User");
  await user.type(textboxes[1]!, "new.user@example.com");
}

async function typeInitialPassword(user: ReturnType<typeof userEvent.setup>, value: string) {
  const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;
  expect(passwordInput).toBeTruthy();
  await user.type(passwordInput, value);
}

describe("UsersPage invite validation", () => {
  it("(a) shows validation_error toast when create user returns 400 validation_error", async () => {
    createUserMock.mockRejectedValue(
      new ApiError(400, {
        error: "validation_error",
        details: { fieldErrors: { initial_password: [OFFICE_PASSWORD_HINT] } },
      })
    );
    const user = userEvent.setup();
    render(wrap(<UsersPage />));
    await openInviteModal(user);
    await chooseSetPasswordMode(user);
    await fillInviteBasics(user);
    await typeInitialPassword(user, "Aa1!abcdefghij");
    await user.click(screen.getByRole("button", { name: /create user/i }));
    await waitFor(() => {
      expect(screen.getByText(OFFICE_PASSWORD_HINT)).toBeInTheDocument();
    });
    expect(createUserMock).toHaveBeenCalled();
  });

  it("(b) disables submit until password checklist is satisfied in set-password mode", async () => {
    createUserMock.mockResolvedValue({ id: "user-1" });
    const user = userEvent.setup();
    render(wrap(<UsersPage />));
    await openInviteModal(user);
    await chooseSetPasswordMode(user);
    const submit = screen.getByRole("button", { name: /create user/i });
    expect(submit).toBeDisabled();
    await typeInitialPassword(user, "Aa1!abcdefghij");
    await waitFor(() => {
      expect(submit).not.toBeDisabled();
    });
    expect(screen.getByText(/Lowercase letter/i)).toHaveClass("text-green-700");
  });

  it("(c) keeps submit enabled in invite mode without a password", async () => {
    createUserMock.mockResolvedValue({ id: "user-2" });
    const user = userEvent.setup();
    render(wrap(<UsersPage />));
    await openInviteModal(user);
    expect(screen.getByRole("radio", { name: /email invite to set password/i })).toBeChecked();
    const submit = screen.getByRole("button", { name: /create and send invite/i });
    expect(submit).not.toBeDisabled();
    expect(screen.queryByText(/Lowercase letter/i)).toBeNull();
  });
});
