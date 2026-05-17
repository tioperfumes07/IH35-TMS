import { useState } from "react";
import { sendLiabilityAckRequest } from "../../../api/liabilities";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  liabilityId: string | null;
  onClose: () => void;
  onSent: () => void;
};

export function SendAckRequestModal({ open, operatingCompanyId, liabilityId, onClose, onSent }: Props) {
  const { pushToast } = useToast();
  const [channel, setChannel] = useState<"whatsapp" | "sms" | "email">("whatsapp");
  const [message, setMessage] = useState("Please review and acknowledge this liability.");
  const [loading, setLoading] = useState(false);

  const send = async () => {
    if (!liabilityId) return;
    setLoading(true);
    try {
      await sendLiabilityAckRequest(liabilityId, operatingCompanyId, { channel, message });
      pushToast("Acknowledgment request sent", "success");
      onSent();
      onClose();
    } catch (error) {
      pushToast(String((error as Error).message || "Failed"), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Send Acknowledgment Request">
      <div className="space-y-2 text-xs">
        <label className="block">
          Channel
          <SelectCombobox
            className="mt-1 h-8 w-full rounded border border-gray-300 px-2"
            value={channel}
            onChange={(event) => setChannel(event.target.value as "whatsapp" | "sms" | "email")}
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
          </SelectCombobox>
        </label>
        <label className="block">
          Message
          <textarea
            rows={4}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={loading} onClick={() => void send()}>Send Request</Button>
        </div>
      </div>
    </Modal>
  );
}
