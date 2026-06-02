import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "../api/client";
import { Button } from "../components/Button";

type PortalProfile = {
  email: string;
  full_name: string | null;
  notify_on_dispatch: boolean;
  notify_on_arrival: boolean;
  notify_on_delivery: boolean;
  notify_on_pod: boolean;
};

export function PortalProfilePage() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["portal", "profile"],
    queryFn: () => apiRequest<{ profile: PortalProfile }>("/api/v1/portal/profile").then((r) => r.profile),
  });

  const [fullName, setFullName] = useState("");
  const [notifyDispatch, setNotifyDispatch] = useState(true);
  const [notifyArrival, setNotifyArrival] = useState(true);
  const [notifyDelivery, setNotifyDelivery] = useState(true);
  const [notifyPod, setNotifyPod] = useState(true);
  const [initialized, setInitialized] = useState(false);

  if (profileQuery.data && !initialized) {
    setFullName(profileQuery.data.full_name ?? "");
    setNotifyDispatch(profileQuery.data.notify_on_dispatch);
    setNotifyArrival(profileQuery.data.notify_on_arrival);
    setNotifyDelivery(profileQuery.data.notify_on_delivery);
    setNotifyPod(profileQuery.data.notify_on_pod);
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/v1/portal/profile", {
        method: "PATCH",
        body: {
          full_name: fullName.trim() || undefined,
          notify_on_dispatch: notifyDispatch,
          notify_on_arrival: notifyArrival,
          notify_on_delivery: notifyDelivery,
          notify_on_pod: notifyPod,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["portal", "profile"] });
    },
  });

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Profile & notifications</h1>
      {profileQuery.isLoading ? <p className="text-sm text-slate-600">Loading…</p> : null}
      {profileQuery.data ? (
        <form
          className="space-y-4 rounded border border-slate-200 bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Email</span>
            <input className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-3 py-2" value={profileQuery.data.email} readOnly />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Full name</span>
            <input className="mt-1 w-full rounded border border-slate-300 px-3 py-2" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
          <fieldset className="space-y-2 text-sm">
            <legend className="font-medium text-slate-700">Email notifications</legend>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={notifyDispatch} onChange={(e) => setNotifyDispatch(e.target.checked)} />
              Dispatch
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={notifyArrival} onChange={(e) => setNotifyArrival(e.target.checked)} />
              Arrival at pickup / delivery
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={notifyDelivery} onChange={(e) => setNotifyDelivery(e.target.checked)} />
              Delivered
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={notifyPod} onChange={(e) => setNotifyPod(e.target.checked)} />
              POD available
            </label>
          </fieldset>
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving…" : "Save preferences"}
          </Button>
          {saveMutation.isSuccess ? <p className="text-sm text-green-700">Saved.</p> : null}
        </form>
      ) : null}
    </div>
  );
}
