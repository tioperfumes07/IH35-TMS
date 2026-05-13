import { BookOpen, CircleDollarSign, FileText, Wrench } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { ManualInvoiceModal } from "../accounting/modals/ManualInvoiceModal";
import { BookLoadModalV4 } from "../dispatch/components/BookLoadModalV4";
import { CreateWorkOrderModal } from "../maintenance/components/CreateWorkOrderModal";

type Props = {
  operatingCompanyId: string | null | undefined;
};

export function QuickActionsBar({ operatingCompanyId }: Props) {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [bookOpen, setBookOpen] = useState(false);
  const [woOpen, setWoOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const cid = operatingCompanyId ?? "";

  function requireCompany(): string | null {
    if (!cid) {
      pushToast("Select operating company first", "error");
      return null;
    }
    return cid;
  }

  return (
    <>
      <div className="quick-actions flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-start">
        <Button
          type="button"
          className="w-full justify-center sm:w-auto"
          onClick={() => {
            if (!requireCompany()) return;
            setBookOpen(true);
          }}
        >
          <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
          + Book Load
        </Button>
        <Button
          type="button"
          className="w-full justify-center sm:w-auto"
          onClick={() => {
            if (!requireCompany()) return;
            setWoOpen(true);
          }}
        >
          <Wrench className="h-4 w-4 shrink-0" aria-hidden />
          + Create WO
        </Button>
        <Button
          type="button"
          className="w-full justify-center sm:w-auto"
          onClick={() => {
            if (!requireCompany()) return;
            setInvoiceOpen(true);
          }}
        >
          <FileText className="h-4 w-4 shrink-0" aria-hidden />
          + Create Invoice
        </Button>
        <Button
          type="button"
          className="w-full justify-center sm:w-auto"
          onClick={() => {
            if (!requireCompany()) return;
            navigate("/accounting/expenses");
          }}
        >
          <CircleDollarSign className="h-4 w-4 shrink-0" aria-hidden />
          + Record Expense
        </Button>
      </div>

      {cid ? (
        <>
          <BookLoadModalV4 open={bookOpen} operatingCompanyId={cid} onClose={() => setBookOpen(false)} onCreated={() => setBookOpen(false)} />
          <CreateWorkOrderModal open={woOpen} operatingCompanyId={cid} onClose={() => setWoOpen(false)} onCreated={() => setWoOpen(false)} />
          <ManualInvoiceModal
            open={invoiceOpen}
            operatingCompanyId={cid}
            onClose={() => setInvoiceOpen(false)}
            onCreated={(invoiceId) => {
              setInvoiceOpen(false);
              navigate(`/accounting/invoices/${invoiceId}`);
            }}
          />
        </>
      ) : null}
    </>
  );
}
