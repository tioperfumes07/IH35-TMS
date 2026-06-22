import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getDriverMessageThread,
  getDriverMessagesInbox,
  markDriverMessageRead,
  type DriverInboxConversation,
  type DriverInboxMessage,
} from "../../api/driver-messages";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { SendMessageModal } from "../../components/drivers/SendMessageModal";

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function ConversationList({
  conversations,
  selectedDriverId,
  onSelect,
}: {
  conversations: DriverInboxConversation[];
  selectedDriverId: string | null;
  onSelect: (driverId: string) => void;
}) {
  if (conversations.length === 0) {
    return <p className="px-3 py-4 text-sm text-gray-500">No driver conversations yet.</p>;
  }
  return (
    <ul className="divide-y divide-gray-200">
      {conversations.map((row) => (
        <li key={row.driver_id}>
          <button
            type="button"
            data-testid={`inbox-conversation-${row.driver_id}`}
            className={`flex w-full flex-col gap-1 px-3 py-3 text-left hover:bg-gray-50 ${
              selectedDriverId === row.driver_id ? "bg-slate-100" : ""
            }`}
            onClick={() => onSelect(row.driver_id)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-gray-900">{row.driver_name}</span>
              {row.unread_count > 0 ? (
                <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">{row.unread_count}</span>
              ) : null}
            </div>
            <p className="line-clamp-2 text-xs text-gray-600">{row.latest_message}</p>
            <p className="text-[10px] text-gray-400">{formatWhen(row.latest_at)} · {row.latest_channel}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ThreadPane({
  driverId,
  driverName,
  operatingCompanyId,
  onMarkRead,
}: {
  driverId: string;
  driverName: string;
  operatingCompanyId: string;
  onMarkRead: (messageId: string) => void;
}) {
  const [sendOpen, setSendOpen] = useState(false);
  const threadQuery = useQuery({
    queryKey: ["drivers", "messages", "thread", operatingCompanyId, driverId],
    queryFn: () => getDriverMessageThread(driverId, operatingCompanyId),
    enabled: Boolean(operatingCompanyId && driverId),
  });

  const messages = threadQuery.data?.messages ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{driverName}</h2>
          <Link to={`/drivers/${driverId}/profile`} className="text-xs text-slate-700 hover:underline">
            Open profile
          </Link>
        </div>
        <Button type="button" data-testid="inbox-send-message" onClick={() => setSendOpen(true)}>
          Send Message
        </Button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4" data-testid="inbox-thread">
        {threadQuery.isLoading ? <p className="text-sm text-gray-500">Loading thread…</p> : null}
        {messages.map((msg: DriverInboxMessage) => (
          <div
            key={msg.id}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              msg.sender_side === "office" ? "ml-auto bg-slate-100 text-slate-700" : "mr-auto bg-gray-100 text-gray-900"
            } ${!msg.read_at && msg.sender_side === "driver" ? "ring-2 ring-amber-400" : ""}`}
          >
            <p>{msg.message}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-gray-500">
              <span>{formatWhen(msg.created_at)}</span>
              <span>{msg.channel}</span>
              <span>{msg.delivery_status}</span>
              {!msg.read_at && msg.sender_side === "driver" ? (
                <button type="button" className="font-semibold text-amber-700 underline" onClick={() => onMarkRead(msg.id)}>
                  Mark read
                </button>
              ) : null}
              {msg.read_at ? <span>Read</span> : null}
            </div>
          </div>
        ))}
        {!threadQuery.isLoading && messages.length === 0 ? (
          <p className="text-sm text-gray-500">No messages in this thread yet.</p>
        ) : null}
      </div>
      <SendMessageModal
        open={sendOpen}
        driverId={driverId}
        companyId={operatingCompanyId}
        driverName={driverName}
        onClose={() => setSendOpen(false)}
        onSent={() => void threadQuery.refetch()}
      />
    </div>
  );
}

export function MessagesInboxPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  const inboxQuery = useQuery({
    queryKey: ["drivers", "messages", "inbox", operatingCompanyId],
    queryFn: () => getDriverMessagesInbox(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const conversations = inboxQuery.data?.conversations ?? [];
  const selectedConversation = useMemo(
    () => conversations.find((row) => row.driver_id === selectedDriverId) ?? null,
    [conversations, selectedDriverId]
  );

  const markReadMutation = useMutation({
    mutationFn: (messageId: string) => markDriverMessageRead(messageId, operatingCompanyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["drivers", "messages"] });
    },
  });

  if (!operatingCompanyId) {
    return <div className="p-6 text-sm text-gray-600">Select an operating company to view driver messages.</div>;
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Driver Messages</h1>
          <p className="text-sm text-gray-600">Office inbox — threaded conversations per driver</p>
        </div>
        <Link to="/drivers" className="text-sm text-slate-700 hover:underline">
          Back to Drivers
        </Link>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-lg border border-gray-200 bg-white md:grid-cols-[320px_1fr]">
        <div className="overflow-y-auto border-r border-gray-200">
          <div className="border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Conversations
          </div>
          <ConversationList
            conversations={conversations}
            selectedDriverId={selectedDriverId}
            onSelect={setSelectedDriverId}
          />
        </div>
        <div className="min-h-[320px]">
          {selectedDriverId && selectedConversation ? (
            <ThreadPane
              driverId={selectedDriverId}
              driverName={selectedConversation.driver_name}
              operatingCompanyId={operatingCompanyId}
              onMarkRead={(messageId) => markReadMutation.mutate(messageId)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">Select a driver conversation</div>
          )}
        </div>
      </div>
    </div>
  );
}
