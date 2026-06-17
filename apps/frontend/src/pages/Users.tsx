import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, MoreHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";
import {
  checkReturningDispatcher,
  createIdentityWorkflow,
  createUser,
  deactivateUser,
  IDENTITY_ROLE_CHANGE_ACTION_CODE,
  listUsers,
  type ReturningDispatcherDetectionResult,
} from "../api/identity";
import { Button } from "../components/Button";
import { Combobox } from "../components/Combobox";
import { DataTable } from "../components/DataTable";
import { KpiCard } from "../components/layout/KpiCard";
import { KpiStrip } from "../components/layout/KpiStrip";
import { PageHeader } from "../components/layout/PageHeader";
import { Modal } from "../components/Modal";
import { ActionButton } from "../components/shared/ActionButton";
import { SecondaryNavTabs } from "../components/shared/SecondaryNavTabs";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { SaveDropdown } from "../components/forms/SaveDropdown";
import { BulkActionBar } from "../components/bulk/BulkActionBar";
import { TableSelection, TableSelectionHeader } from "../components/bulk/TableSelection";
import { useBulkSelection } from "../hooks/useBulkSelection";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";
import { evaluatePasswordStrength, OFFICE_PASSWORD_HINT } from "../auth/office-password-ui";
import { parseApiErrorPayload } from "../components/forms/useFormValidation";
import { formatLastLoginAt } from "../lib/formatLastLoginAt";
import { dataTableErrorState } from "../lib/tableError";
import { colors } from "../design/tokens";
import type { IdentityUser, UserRole } from "../types/api";

const ROLE_OPTIONS: Array<UserRole | "Viewer"> = [
  "Owner",
  "Administrator",
  "Manager",
  "Accountant",
  "Dispatcher",
  "Safety",
  "Driver",
  "Mechanic",
  "Viewer",
];
const ROLE_LABEL: Record<UserRole | "Viewer", string> = {
  Owner: "Owner",
  Administrator: "Administrator",
  SuperAdmin: "Super Admin",
  Manager: "Manager",
  Accountant: "Accounting",
  Dispatcher: "Dispatcher",
  Safety: "Safety",
  Driver: "Driver",
  Mechanic: "Mechanic",
  Viewer: "Viewer",
};
const roleComboboxOptions = ROLE_OPTIONS.map((role) => ({ value: role, label: ROLE_LABEL[role] }));
const roleChangeComboboxOptions = ROLE_OPTIONS.filter((role): role is UserRole => role !== "Viewer").map((role) => ({
  value: role,
  label: ROLE_LABEL[role],
}));

const USER_TAB_IDS = ["all", "active", "pending", "deactivated"] as const;
type UserListTabId = (typeof USER_TAB_IDS)[number];
const PENDING_INVITE_DAYS = 7;
type ProvisionMode = "set_password" | "send_invite";

function parseUserListTab(searchParams: URLSearchParams): UserListTabId {
  const raw = (searchParams.get("tab") ?? "all").toLowerCase();
  return (USER_TAB_IDS as readonly string[]).includes(raw) ? (raw as UserListTabId) : "all";
}

function daysSince(iso: string): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

function userRowCategory(user: IdentityUser): "active" | "pending" | "deactivated" {
  if (user.deactivated_at) return "deactivated";
  if (daysSince(user.created_at) < PENDING_INVITE_DAYS) return "pending";
  return "active";
}

function userStatus(user: IdentityUser): "Active" | "Inactive" {
  return user.deactivated_at ? "Inactive" : "Active";
}

const PASSWORD_CHECKLIST = [
  { key: "length", label: "At least 12 characters", test: (value: string) => value.length >= 12 },
  { key: "lower", label: "Lowercase letter", test: (value: string) => /[a-z]/.test(value) },
  { key: "upper", label: "Uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { key: "number", label: "Number", test: (value: string) => /[0-9]/.test(value) },
  { key: "symbol", label: "Symbol", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
] as const;

function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul className="mt-2 space-y-1 text-xs" aria-live="polite">
      {PASSWORD_CHECKLIST.map((item) => {
        const met = item.test(password);
        return (
          <li key={item.key} className={met ? "text-green-700" : "text-gray-500"}>
            {met ? "✓" : "○"} {item.label}
          </li>
        );
      })}
    </ul>
  );
}

export function UsersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = useAuth();
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleModalUser, setRoleModalUser] = useState<IdentityUser | null>(null);
  const [menuUserId, setMenuUserId] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<UserRole | "Viewer">("Manager");
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteInitialPassword, setInviteInitialPassword] = useState("");
  const [provisionMode, setProvisionMode] = useState<ProvisionMode>("send_invite");
  const [overrideReturningWarning, setOverrideReturningWarning] = useState(false);
  const [returningDetection, setReturningDetection] = useState<ReturningDispatcherDetectionResult | null>(null);
  const [checkingReturningDispatcher, setCheckingReturningDispatcher] = useState(false);
  const [roleChangeRole, setRoleChangeRole] = useState<UserRole>("Manager");
  const [roleReason, setRoleReason] = useState("");
  const [inviteBaseline, setInviteBaseline] = useState({
    inviteName: "",
    inviteEmail: "",
    inviteRole: "Manager" as UserRole | "Viewer",
    inviteInitialPassword: "",
    provisionMode: "send_invite" as ProvisionMode,
    overrideReturningWarning: false,
  });
  const [roleBaseline, setRoleBaseline] = useState({ roleChangeRole: "Manager" as UserRole, roleReason: "" });
  const returningWarningRef = useRef<HTMLDivElement | null>(null);
  const { pushToast } = useToast();
  const userBulk = useBulkSelection({ cap: 200, onCapExceeded: (error) => pushToast(error.message, "error") });
  const queryClient = useQueryClient();
  const isOwnerOrAdmin = auth.user?.role === "Owner" || auth.user?.role === "Administrator";
  const listTab = useMemo(() => parseUserListTab(searchParams), [searchParams]);

  const setListTab = (next: UserListTabId) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "all") p.delete("tab");
        else p.set("tab", next);
        return p;
      },
      { replace: false }
    );
  };

  const usersQuery = useQuery({
    queryKey: ["users", isOwnerOrAdmin],
    queryFn: () => listUsers(isOwnerOrAdmin).then((result) => result.users),
    enabled: Boolean(auth.user),
  });

  const createUserMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      pushToast("User created successfully", "success");
    },
    onError: (error) => {
      console.error("[Users] createUser mutation error:", error);
    },
  });

  const roleWorkflowMutation = useMutation({
    mutationFn: createIdentityWorkflow,
    onSuccess: () => {
      setRoleModalUser(null);
      setRoleReason("");
      pushToast("Role change request submitted for approval", "success");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      pushToast("User deactivated", "info");
    },
  });

  const allUsers = usersQuery.data ?? [];

  const tabCounts = useMemo(() => {
    return {
      all: allUsers.length,
      active: allUsers.filter((u) => userRowCategory(u) === "active").length,
      pending: allUsers.filter((u) => userRowCategory(u) === "pending").length,
      deactivated: allUsers.filter((u) => userRowCategory(u) === "deactivated").length,
    };
  }, [allUsers]);

  const invitePasswordStrength = useMemo(
    () => evaluatePasswordStrength(inviteInitialPassword),
    [inviteInitialPassword]
  );
  const invitePasswordReady = provisionMode !== "set_password" || invitePasswordStrength.meetsPolicy;

  const filteredUsers = useMemo(() => {
    let list = [...allUsers];
    const keyword = search.trim().toLowerCase();
    if (keyword) {
      list = list.filter(
        (user) =>
          (user.name ?? "").toLowerCase().includes(keyword) ||
          (user.email ?? "").toLowerCase().includes(keyword) ||
          user.role.toLowerCase().includes(keyword) ||
          (user.auth_method ?? "").toLowerCase().includes(keyword)
      );
    }
    if (listTab === "deactivated") return list.filter((u) => u.deactivated_at);
    if (listTab === "pending") return list.filter((u) => userRowCategory(u) === "pending");
    if (listTab === "active") return list.filter((u) => userRowCategory(u) === "active");
    return list;
  }, [allUsers, search, listTab]);

  const inviteSnapshot = { inviteName, inviteEmail, inviteRole, inviteInitialPassword, provisionMode, overrideReturningWarning };
  const { isDirty: inviteIsDirty } = useUnsavedChanges(inviteSnapshot, inviteBaseline);

  const roleOpen = roleModalUser !== null;
  const roleSnapshot = { roleChangeRole, roleReason };
  const { isDirty: roleIsDirty } = useUnsavedChanges(roleSnapshot, roleBaseline);

  useEffect(() => {
    if (!roleModalUser) return;
    setRoleChangeRole(roleModalUser.role);
    setRoleReason("");
    setRoleBaseline({
      roleChangeRole: roleModalUser.role,
      roleReason: "",
    });
  }, [roleModalUser]);

  useEffect(() => {
    if (!inviteOpen) return;
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    const shouldCheck = normalizedEmail.length >= 5 && inviteRole !== "Owner" && inviteRole !== "Driver" && inviteRole !== "Viewer";
    if (!shouldCheck) {
      setReturningDetection(null);
      setCheckingReturningDispatcher(false);
      setOverrideReturningWarning(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      setCheckingReturningDispatcher(true);
      try {
        const result = await checkReturningDispatcher(normalizedEmail);
        setReturningDetection(result.returning_dispatcher ? result : null);
        if (!result.returning_dispatcher) setOverrideReturningWarning(false);
      } catch {
        setReturningDetection(null);
      } finally {
        setCheckingReturningDispatcher(false);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [inviteEmail, inviteOpen, inviteRole]);

  function resetInviteFields() {
    setInviteName("");
    setInviteEmail("");
    setInviteRole("Manager");
    setInviteInitialPassword("");
    setProvisionMode("send_invite");
    setOverrideReturningWarning(false);
    setReturningDetection(null);
    setInviteBaseline({
      inviteName: "",
      inviteEmail: "",
      inviteRole: "Manager",
      inviteInitialPassword: "",
      provisionMode: "send_invite",
      overrideReturningWarning: false,
    });
  }

  async function submitInvite(closeAfter: boolean) {
    if (inviteRole === "Viewer") {
      pushToast("Viewer role comes in a future phase", "error");
      return;
    }
    if (!inviteName.trim()) {
      pushToast("Name is required", "error");
      return;
    }
    if (!inviteEmail.trim()) {
      pushToast("Email is required", "error");
      return;
    }
    if (provisionMode === "set_password" && !invitePasswordReady) {
      pushToast(OFFICE_PASSWORD_HINT, "error");
      return;
    }
    if (provisionMode === "set_password" && inviteInitialPassword.trim().length === 0) {
      pushToast("Initial password is required", "error");
      return;
    }
    if (Boolean(returningDetection) && !overrideReturningWarning) {
      returningWarningRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      pushToast("Confirm the returning dispatcher override to continue.", "error");
      return;
    }
    try {
      await createUserMutation.mutateAsync({
        name: inviteName.trim(),
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        initial_password: provisionMode === "set_password" ? inviteInitialPassword : undefined,
        send_password_setup_invite: provisionMode === "send_invite",
        override_returning_warning: overrideReturningWarning,
      });
      if (closeAfter) {
        setInviteOpen(false);
        resetInviteFields();
      } else {
        resetInviteFields();
      }
    } catch (error) {
      console.error("[Users] submitInvite error:", error);
      if (error instanceof ApiError && error.status === 409 && (error.data as { error?: string })?.error === "returning_dispatcher_detected") {
        const details = error.data as ReturningDispatcherDetectionResult & { error: string };
        setReturningDetection({
          returning_dispatcher: true,
          matched_events: details.matched_events ?? [],
          severity_summary: details.severity_summary ?? { severe_count: 0, warning_count: 0, info_count: 0 },
        });
        pushToast("Returning dispatcher detected. Confirm override to continue.", "error");
        setTimeout(() => returningWarningRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
        return;
      }
      if (error instanceof ApiError && (error.status === 409 || (error.data as { error?: string })?.error === "identity_user_conflict")) {
        pushToast("A user with this email already exists", "error");
        return;
      }
      if (error instanceof ApiError && error.status === 400) {
        const body = error.data as { error?: string };
        if (body?.error === "initial_password_or_invite_required") {
          pushToast("Choose a password setup method", "error");
          return;
        }
        if (body?.error === "validation_error") {
          const parsed = parseApiErrorPayload(error.data);
          pushToast(parsed.message ?? OFFICE_PASSWORD_HINT, "error");
          return;
        }
        pushToast(`Create user failed: ${body?.error ?? "bad request"}`, "error");
        return;
      }
      pushToast("Failed to create user — check console for details", "error");
    }
  }

  const openInvite = () => {
    resetInviteFields();
    setInviteOpen(true);
  };

  return (
    <div className="mx-auto w-full max-w-[min(1280px,calc(100vw-2rem))] space-y-3">
      <PageHeader title="Users" subtitle={`${filteredUsers.length} records`} actions={<ActionButton onClick={openInvite}>+ Add User</ActionButton>} />

      <KpiStrip>
        <KpiCard label="Total users" number={tabCounts.all} accent={colors.info.strong} />
        <KpiCard label="Active" number={tabCounts.active} accent={colors.positive.strong} />
        <KpiCard label="Pending (new)" number={tabCounts.pending} accent={colors.warn.strong} />
        <KpiCard label="Deactivated" number={tabCounts.deactivated} accent={colors.crit.strong} />
      </KpiStrip>

      <SecondaryNavTabs
        className="-mx-1"
        activeId={listTab}
        onChange={(id) => {
          if ((USER_TAB_IDS as readonly string[]).includes(id)) setListTab(id as UserListTabId);
        }}
        tabs={[
          { id: "all", label: `All (${tabCounts.all})` },
          { id: "active", label: `Active (${tabCounts.active})` },
          { id: "pending", label: `Pending (${tabCounts.pending})` },
          { id: "deactivated", label: `Deactivated (${tabCounts.deactivated})` },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search users"
          className="h-8 w-full min-w-0 max-w-sm rounded-md border border-gray-300 px-2 text-[13px]"
        />
      </div>

      <BulkActionBar
        {...userBulk.bulkActionBarProps([
          { id: "deactivate", label: "Deactivate", destructive: true, action: "deactivate", onClick: () => pushToast("Bulk deactivate users — endpoint pending.", "success") },
          { id: "export", label: "Export Selected", onClick: () => pushToast("Export users queued.", "success") },
        ])}
      >
        <TableSelectionHeader
          selectedIds={userBulk.selectedIds}
          pageRowIds={filteredUsers.map((row) => row.id)}
          onSelectionChange={userBulk.setSelectedIds}
          cap={userBulk.cap}
          ariaLabel="Select all users on this page"
        />
      </BulkActionBar>

      <TableSelection
        rows={filteredUsers}
        getId={(row) => row.id}
        selectedIds={userBulk.selectedIds}
        onSelectionChange={userBulk.setSelectedIds}
        pageRowIds={filteredUsers.map((row) => row.id)}
        cap={userBulk.cap}
      >
        {({ isSelected, toggle }) => (
      <DataTable
        rows={filteredUsers}
        loading={usersQuery.isLoading}
        errorState={dataTableErrorState(usersQuery.error, () => void usersQuery.refetch())}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/users/${row.id}`)}
        columns={[
          {
            key: "_bulk",
            label: "Select",
            className: "w-8",
            render: (row) => (
              <input
                type="checkbox"
                checked={isSelected(row.id)}
                onChange={(event) => {
                  event.stopPropagation();
                  toggle(row.id);
                }}
                aria-label={`Select user ${row.name}`}
              />
            ),
          },
          { key: "name", label: "Name", sortable: true },
          { key: "email", label: "Email", sortable: true },
          {
            key: "role",
            label: "Role",
            sortable: true,
            render: (row) => ROLE_LABEL[row.role as UserRole] ?? row.role,
          },
          {
            key: "status",
            label: "Status",
            render: (row) => <StatusBadge status={userStatus(row)} />,
          },
          {
            key: "auth_method",
            label: "Auth method",
            render: (row) => row.auth_method ?? "Invite pending",
          },
          {
            key: "last_login",
            label: "Last Login",
            render: (row) => formatLastLoginAt(row.last_login_at),
          },
          {
            key: "actions",
            label: "Actions",
            className: "w-20",
            render: (row) => (
              <div className="relative">
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded border border-gray-300 hover:bg-gray-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuUserId((current) => (current === row.id ? null : row.id));
                  }}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
                {menuUserId === row.id ? (
                  <div className="absolute right-0 z-20 mt-1 w-36 rounded border border-gray-200 bg-white p-1 text-xs shadow">
                    <button
                      type="button"
                      className="block w-full rounded px-2 py-1 text-left hover:bg-gray-100"
                      onClick={() => {
                        if (!isOwnerOrAdmin) return;
                        setRoleModalUser(row);
                        setRoleChangeRole(row.role);
                        setMenuUserId(null);
                      }}
                    >
                      Change Role
                    </button>
                    <button
                      type="button"
                      className="block w-full rounded px-2 py-1 text-left hover:bg-gray-100"
                      onClick={async () => {
                        if (!isOwnerOrAdmin) return;
                        setMenuUserId(null);
                        const ok = window.confirm("Deactivate this user?");
                        if (!ok) return;
                        await deactivateMutation.mutateAsync(row.id);
                      }}
                    >
                      Deactivate
                    </button>
                  </div>
                ) : null}
              </div>
            ),
          },
        ]}
      />
        )}
      </TableSelection>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Add User"
        confirmDiscardOnClose
        isDirty={inviteIsDirty}
      >
        <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Name</label>
            <input
              value={inviteName}
              onChange={(event) => setInviteName(event.target.value)}
              required
              type="text"
              className="w-full rounded border border-gray-300 h-9 px-2 text-[13px]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Email</label>
            <input
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              required
              type="email"
              className="w-full rounded border border-gray-300 h-9 px-2 text-[13px]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Role</label>
            <Combobox
              options={roleComboboxOptions}
              value={inviteRole}
              onChange={(value) => setInviteRole((value as UserRole | "Viewer") ?? "Manager")}
              placeholder="Select role"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Password setup</label>
            <div className="space-y-2 rounded border border-gray-200 p-2 text-xs text-gray-700">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="password-setup-mode"
                  checked={provisionMode === "send_invite"}
                  onChange={() => setProvisionMode("send_invite")}
                />
                Email invite to set password
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="password-setup-mode"
                  checked={provisionMode === "set_password"}
                  onChange={() => setProvisionMode("set_password")}
                />
                Set initial password now
              </label>
            </div>
          </div>
          {provisionMode === "set_password" ? (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Initial password</label>
              <input
                value={inviteInitialPassword}
                onChange={(event) => setInviteInitialPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                className="w-full rounded border border-gray-300 h-9 px-2 text-[13px]"
              />
              <PasswordChecklist password={inviteInitialPassword} />
              {!invitePasswordReady ? (
                <p className="mt-1 text-xs text-amber-700">{OFFICE_PASSWORD_HINT}</p>
              ) : null}
            </div>
          ) : null}
          {checkingReturningDispatcher ? <div className="text-xs text-gray-500">Checking returning dispatcher history...</div> : null}
          {returningDetection ? (
            <div ref={returningWarningRef} className="rounded border-2 border-amber-400 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="flex items-center gap-1.5 font-semibold text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Returning dispatcher detected — review required
              </p>
              <p className="mt-1">
                {returningDetection.matched_events.length} prior safety event{returningDetection.matched_events.length !== 1 ? "s" : ""}:{" "}
                {returningDetection.severity_summary.severe_count} severe, {returningDetection.severity_summary.warning_count} warning,{" "}
                {returningDetection.severity_summary.info_count} info
              </p>
              <label className="mt-2 inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={overrideReturningWarning}
                  onChange={(event) => setOverrideReturningWarning(event.target.checked)}
                />
                <span>I acknowledge this history — create user anyway</span>
              </label>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <SaveDropdown
              storageKey="users-invite"
              primaryLabel={provisionMode === "send_invite" ? "Create and send invite" : "Create user"}
              loading={createUserMutation.isPending}
              disabled={createUserMutation.isPending}
              onSave={() => void submitInvite(false)}
              onSaveAndClose={() => void submitInvite(true)}
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={roleOpen}
        onClose={() => setRoleModalUser(null)}
        title="Change Role"
        confirmDiscardOnClose
        isDirty={roleIsDirty}
      >
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!roleModalUser) return;
            try {
              await roleWorkflowMutation.mutateAsync({
                action_code: IDENTITY_ROLE_CHANGE_ACTION_CODE,
                target_user: roleModalUser.id,
                payload: {
                  new_role: roleChangeRole,
                  reason: roleReason.trim() || undefined,
                },
              });
            } catch {
              pushToast("Failed to submit role-change workflow", "error");
            }
          }}
        >
          <div className="text-sm text-gray-600">Current role: {roleModalUser?.role ?? "—"}</div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">New role</label>
            <Combobox
              options={roleChangeComboboxOptions}
              value={roleChangeRole}
              onChange={(value) => setRoleChangeRole((value as UserRole) ?? "Manager")}
              placeholder="Select role"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Reason (optional)</label>
            <textarea
              value={roleReason}
              onChange={(event) => setRoleReason(event.target.value)}
              rows={3}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-[13px]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRoleModalUser(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={roleWorkflowMutation.isPending}>
              Submit Request
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
