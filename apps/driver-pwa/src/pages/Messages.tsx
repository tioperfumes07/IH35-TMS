import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { listDriverPwaMessages, markDriverPwaMessageRead, replyDriverPwaMessage } from "../api/messages";
import { PwaButton } from "../components/PwaButton";
import { PwaCard } from "../components/PwaCard";
import { useToast } from "../components/Toast";

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function MessagesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [reply, setReply] = useState("");

  const query = useQuery({
    queryKey: ["pwa", "driver-messages"],
    queryFn: listDriverPwaMessages,
  });

  const markReadMutation = useMutation({
    mutationFn: markDriverPwaMessageRead,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pwa", "driver-messages"] });
    },
  });

  const replyMutation = useMutation({
    mutationFn: () => replyDriverPwaMessage(reply.trim()),
    onSuccess: async () => {
      setReply("");
      pushToast(t("messages.reply_sent"), "success");
      await queryClient.invalidateQueries({ queryKey: ["pwa", "driver-messages"] });
    },
    onError: () => pushToast(t("messages.reply_failed"), "error"),
  });

  const messages = query.data?.messages ?? [];

  return (
    <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-primary">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 pb-24">
        <Link to="/profile" className="text-sm text-pwa-text-secondary hover:underline">
          {t("messages.back_to_profile")}
        </Link>
        <PwaCard title={t("messages.title")} subtitle={t("messages.subtitle")}>
          {query.isLoading ? <p className="text-sm text-pwa-text-secondary">{t("messages.loading")}</p> : null}
          {!query.isLoading && messages.length === 0 ? (
            <p className="text-sm text-pwa-text-secondary">{t("messages.empty")}</p>
          ) : null}
          <div className="space-y-2" data-testid="pwa-messages-list">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded border border-pwa-border p-2 text-sm ${
                  msg.sender_side === "office" ? "bg-[#101522]" : "bg-[#0d111c]"
                } ${!msg.read_at && msg.sender_side === "office" ? "border-amber-400" : ""}`}
              >
                <p>{msg.message}</p>
                <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-pwa-text-secondary">
                  <span>{formatWhen(msg.created_at)}</span>
                  <span>{msg.channel}</span>
                  {!msg.read_at && msg.sender_side === "office" ? (
                    <button
                      type="button"
                      className="font-semibold text-amber-300 underline"
                      onClick={() => markReadMutation.mutate(msg.id)}
                    >
                      {t("messages.mark_read")}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            <label className="text-xs font-semibold text-pwa-text-secondary">{t("messages.reply_label")}</label>
            <textarea
              data-testid="pwa-message-reply"
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              rows={3}
              className="w-full rounded border border-pwa-border bg-[#0d111c] px-2 py-2 text-sm text-white"
              placeholder={t("messages.reply_placeholder")}
            />
            <PwaButton
              type="button"
              data-testid="pwa-message-send"
              disabled={!reply.trim() || replyMutation.isPending}
              onClick={() => replyMutation.mutate()}
            >
              {t("messages.send_reply")}
            </PwaButton>
          </div>
        </PwaCard>
      </div>
    </div>
  );
}
