import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";
import {
  checkReturningDispatcher,
  createIdentityWorkflow,
  createUser,
  deactivateUser,
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
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";
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
const roleComboboxOptions = ROLE_OPTIONS.map((role) => ({ value: role, label: role }));
const roleChangeComboboxOptions = ROLE_OPTIONS.filter((role): role is UserRole => role !== "Viewer").map((role) => ({
  value: role,
  label: role,
}));

const USER_TAB_IDS = ["all", "active", "pending", "deactivated"] as const;
type UserListTabId = (typeof USER_TAB_IDS)[number];
const PENDING_INVITE_DAYS = 7;

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

export function UsersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = useAuth();
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleModalUser, setRoleModalUser] = useState<IdentityUser | null>(null);
  const [menuUserId, setMenuUserId] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<UserRole | "Viewer">("Manager");
  const [inviteEmail, setInviteEmail] = useState("");
  const [overrideReturningWarning, setOverrideReturningWarning] = useState(false);
  const [returningDetection, setReturningDetection] = useState<ReturningDispatcherDetectionResult | null>(null);
  const [checkingReturningDispatcher, setCheckingReturningDispatcher] = useState(false);
  const [roleChangeRole, setRoleChangeRole] = useState<UserRole>("Manager");
  const [roleReason, setRoleReason] = useState("");
  const [inviteBaseline, setInviteBaseline] = useState({
    inviteEmail: "",
    inviteRole: "Manager" as UserRole | "Viewer",
    overrideReturningWarning: false,
  });
  const [roleBaseline, setRoleBaseline] = useState({ roleChangeRole: "Manager" as UserRole, roleReason: "" });
  const { pushToast } = useToast();
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
      pushToast("User invited successfully", "success");
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

  const filteredUsers = useMemo(() => {
    let list = [...allUsers];
    const keyword = search.trim().toLowerCase();
    if (keyword) {
      list = list.filter(
        (user) => (user.email ?? "").toLowerCase().includes(keyword) || user.role.toLowerCase().includes(keyword)
      );
    }
    if (listTab === "deactivated") return list.filter((u) => u.deactivated_at);
    if (listTab === "pending") return list.filter((u) => userRowCategory(u) === "pending");
    if (listTab === "active") return list.filter((u) => userRowCategory(u) === "active");
    return list;
  }, [allUsers, search, listTab]);

  const inviteSnapshot = { inviteEmail, inviteRole, overrideReturningWarning };
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
    setInviteEmail("");
    setInviteRole("Manager");
    setOverrideReturningWarning(false);
    setReturningDetection(null);
    setInviteBaseline({ inviteEmail: "", inviteRole: "Manager", overrideReturningWarning: false });
  }

  async function submitInvite(closeAfter: boolean) {
    if (inviteRole === "Viewer") {
      pushToast("Viewer role comes in a future phase", "error");
      return;
    }
    try {
      await createUserMutation.mutateAsync({
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        override_returning_warning: overrideReturningWarning,
      });
      if (closeAfter) {
        setInviteOpen(false);
        resetInviteFields();
      } else {
        resetInviteFields();
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && (error.data as { error?: string })?.error === "returning_dispatcher_detected") {
        const details = error.data as ReturningDispatcherDetectionResult & { error: string };
        setReturningDetection({
          returning_dispatcher: true,
          matched_events: details.matched_events ?? [],
          severity_summary: details.severity_summary ?? { severe_count: 0, warning_count: 0, info_count: 0 },
        });
        pushToast("Returning dispatcher detected. Confirm override to continue.", "error");
        return;
      }
      if (error instanceof ApiError && error.status === 409) {
        pushToast("User with this email already exists", "error");
        return;
      }
      pushToast("Failed to invite user", "error");
    }
  }

  const openInvite = () => {
    resetInviteFields();
    setInviteOpen(true);
  };

  return (
    <div className="mx-auto w-full max-w-[min(1280px,calc(100vw-2rem))] space-y-3">
      <PageHeader title="Users" subtitle={`${filteredUsers.length} records`} actions={<ActionButton onClick={openInvite}>+ Invite User</ActionButton>} />

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

      <DataTable
        rows={filteredUsers}
        loading={usersQuery.isLoading}
        errorState={dataTableErrorState(usersQuery.error, () => void usersQuery.refetch())}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/users/${row.id}`)}
        columns={[
          { key: "email", label: "Email", sortable: true },
          { key: "role", label: "Role", sortable: true },
          {
            key: "status",
            label: "Status",
            render: (row) => <StatusBadge status={userStatus(row)} />,
          },
          {
            key: "last_login",
            label: "Last Login",
            render: () => "—",
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

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite User"
        confirmDiscardOnClose
        isDirty={inviteIsDirty}
      >
        <form className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Email</label>
            <input
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              required
              type="email"
              className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
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
          {checkingReturningDispatcher ? <div className="text-xs text-gray-500">Checking returning dispatcher history...</div> : null}
          {returningDetection ? (
            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              <p className="font-semibold">
                Returning dispatcher detected: {returningDetection.matched_events.length} prior safety events (
                {returningDetection.severity_summary.severe_count} severe, {returningDetection.severity_summary.warning_count} warning,{" "}
                {returningDetection.severity_summary.info_count} info)
              </p>
              <label className="mt-2 inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={overrideReturningWarning}
                  onChange={(event) => setOverrideReturningWarning(event.target.checked)}
                />
                Override warning and create user anyway
              </label>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <SaveDropdown
              storageKey="users-invite"
              primaryLabel="Send invite"
              loading={createUserMutation.isPending}
              disabled={Boolean(returningDetection) && !overrideReturningWarning}
              onSave={() => submitInvite(false)}
              onSaveAndClose={() => submitInvite(true)}
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
                action_code: "WF-064-IDENT-002",
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
              className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
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
