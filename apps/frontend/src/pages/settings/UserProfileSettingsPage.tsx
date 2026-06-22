import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getIdentityProfile, patchIdentityOnboarding } from "../../api/identity";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";

export function UserProfileSettingsPage() {
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["identity", "profile"],
    queryFn: getIdentityProfile,
  });

  const restartMutation = useMutation({
    mutationFn: () => patchIdentityOnboarding({ complete: false }),
    onSuccess: async () => {
      pushToast("Tour will start again on next page load.");
      await qc.invalidateQueries({ queryKey: ["identity", "profile"] });
      window.localStorage.removeItem("ih35_onboarding_running");
    },
    onError: () => pushToast("Could not restart tour.", "error"),
  });

  if (profileQuery.isLoading) return <div className="text-sm text-gray-600">Loading profile…</div>;
  if (profileQuery.isError || !profileQuery.data) {
    return <div className="text-sm text-red-600">Could not load profile.</div>;
  }

  const u = profileQuery.data;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Your profile</h1>
        <p className="text-sm text-slate-600">Account preferences for {u.email ?? "your account"}.</p>
      </div>

      <section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Guided tour</h2>
        <p className="mt-1 text-xs text-slate-600">
          The product tour runs automatically once. Use restart to see it again after refreshing the page.
        </p>
        <div className="mt-3">
          <Button type="button" variant="secondary" onClick={() => restartMutation.mutate()} disabled={restartMutation.isPending}>
            Restart tour
          </Button>
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Notifications</h2>
        <p className="mt-1 text-xs text-slate-600">Control email, SMS, WhatsApp, in-app, and quiet hours.</p>
        <div className="mt-3">
          <Link className="text-sm font-medium text-slate-700 hover:underline" to="/settings/notifications">
            Open notification preferences →
          </Link>
        </div>
      </section>
    </div>
  );
}
