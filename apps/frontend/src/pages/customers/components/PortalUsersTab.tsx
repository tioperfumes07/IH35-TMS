import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "../../../api/client";
import { Button } from "../../../components/Button";
import { DataPanel } from "../../../components/layout/DataPanel";
import { ListErrorState } from "../../../components/ListErrorState";
import { Modal } from "../../../components/Modal";
import { ParityTable } from "../../../components/parity/ParityTable";
import { useToast } from "../../../components/Toast";

type PortalUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  active: boolean;
  archived_at: string | null;
  last_login_at: string | null;
  created_at: string;
};

type Props = {
  customerId: string;
  operatingCompanyId?: string;
};

export function PortalUsersTab({ customerId, operatingCompanyId }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const usersQuery = useQuery({
    queryKey: ["portal-users", operatingCompanyId ?? "none", customerId],
    queryFn: () =>
      apiRequest<{ portal_users: PortalUserRow[] }>(
        `/api/v1/customers/${customerId}/portal-users?operating_company_id=${encodeURIComponent(operatingCompanyId!)}`
      ).then((r: { portal_users: PortalUserRow[] }) => r.portal_users),
    enabled: Boolean(operatingCompanyId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/v1/customers/${customerId}/portal-users`, {
        method: "POST",
        body: {
          operating_company_id: operatingCompanyId,
          email: email.trim(),
          password,
          full_name: fullName.trim() || undefined,
        },
      }),
    onSuccess: async () => {
      pushToast("Portal user created", "success");
      setOpen(false);
      setEmail("");
      setPassword("");
      setFullName("");
      await queryClient.invalidateQueries({ queryKey: ["portal-users", operatingCompanyId ?? "none", customerId] });
    },
    onError: () => pushToast("Could not create portal user", "error"),
  });

  const archiveMutation = useMutation({
    mutationFn: (portalUserId: string) =>
      apiRequest(
        `/api/v1/customers/${customerId}/portal-users/${portalUserId}/archive?operating_company_id=${encodeURIComponent(operatingCompanyId!)}`,
        { method: "POST" }
      ),
    onSuccess: async () => {
      pushToast("Portal user archived", "success");
      await queryClient.invalidateQueries({ queryKey: ["portal-users", operatingCompanyId ?? "none", customerId] });
    },
    onError: () => pushToast("Could not archive portal user", "error"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Portal users</h2>
          <p className="text-sm text-gray-600">Shipper logins scoped to this customer&apos;s loads only.</p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!operatingCompanyId} title={operatingCompanyId ? undefined : "Select an operating company first"}>
          Create portal login
        </Button>
      </div>

      <DataPanel title="Active portal accounts">
        {/* CUST-01 C5: with no operating company selected the query never fires (enabled gate
            above) and the table below silently rendered "No portal users yet." -- indistinguishable
            from a customer that genuinely has zero portal users. Say why instead of guessing. */}
        {!operatingCompanyId ? (
          <p className="py-4 text-center text-sm text-gray-500">Select an operating company to view portal users.</p>
        ) : usersQuery.isError ? (
          <ListErrorState
            title="Couldn't load portal users"
            status={0}
            message={(usersQuery.error as Error)?.message}
            onRetry={() => void usersQuery.refetch()}
          />
        ) : (
          <ParityTable<PortalUserRow>
            rows={usersQuery.data ?? []}
            rowKey={(row) => row.id}
            loading={usersQuery.isPending}
            storageKey="customer-portal-users"
            emptyText="No portal users yet."
            exportFilename="customer-portal-users"
            rowActions={(row) =>
              !row.archived_at ? (
                <Button variant="secondary" onClick={() => archiveMutation.mutate(row.id)} disabled={archiveMutation.isPending}>
                  Archive
                </Button>
              ) : null
            }
            columns={[
              { key: "email", label: "Email", sortable: true, render: (row) => row.email },
              { key: "full_name", label: "Name", sortable: true, render: (row) => row.full_name ?? "—" },
              { key: "last_login_at", label: "Last login", sortable: true, render: (row) => (row.last_login_at ? new Date(row.last_login_at).toLocaleString() : "—") },
              { key: "status", label: "Status", render: (row) => (row.archived_at ? "Archived" : row.active ? "Active" : "Inactive") },
            ]}
          />
        )}
      </DataPanel>

      <Modal variant="drawer" open={open} onClose={() => setOpen(false)} title="Create portal login">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <label className="block text-sm">
            Email
            <input className="mt-1 w-full rounded-sm border border-gray-300 px-3 py-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="block text-sm">
            Temporary password
            <input className="mt-1 w-full rounded-sm border border-gray-300 px-3 py-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <label className="block text-sm">
            Full name
            <input className="mt-1 w-full rounded-sm border border-gray-300 px-3 py-2" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
