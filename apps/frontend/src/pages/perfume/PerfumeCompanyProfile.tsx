/**
 * PERFUME — the company profile page (owner 2026-11-28 13:57 CT: "I AM IN CUSTOMERS, I CLICK ON COMPANY A OR B TO SEE THE PROFILE,
 * THE DATA, THE EMAIL ETC, AND THERE IS NO PROFILE PAGE … AS IN THE CONTROL I SHOWED YOU, COMPANY NAME ADDRESS, EMAILS ASSOCIATED TO
 * THAT COMPANY … TRANSACTIONS IS ANOTHER REPORT").
 *
 * Owner 14:02 CT: "IT SHOULD LOOK SIMILAR TO QUICKBOOKS THE CUSTOMER PROFILE, THEN UNDER THAT YOU HAVE THE TABS TO VIEW THE
 * TRANSACTIONS ETC … YOU ARE MIXING SO MANY THINGS IN ONE".
 * One page per company, opened in place from Customers / Vendors / All leads (never sent to another tab). QuickBooks customer page:
 *   header — the profile: company name, what it is, billing address, main email, phone, website; on the right the open balance,
 *            overdue and what we owe them; Edit · Back.
 *   tabs   — ONE subject each: Transactions (default, as QuickBooks) · Statement · Customer details · Emails & contacts ·
 *            Account & credit · Notes · History.
 * Read from the one company record (GET /api/v1/perfume/contacts/:id); edits go through PerfumeCompanyEdit (the one writer).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { ParityTable } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { getPerfumeCompanyActivity, getPerfumeCompanyCenter, getPerfumeCompanyLocations, getPerfumeContact, perfumeContactHistory, type PerfumeContactProfile, type PerfumeContactRole } from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { PerfumeCompanyEdit } from "./PerfumeCompanyEdit";
import { PerfumeCompanyCenter } from "./PerfumeCompanyCenter";
import { CompanyRoleEditor } from "./PerfumeCompanyRole";
import { KpiCard } from "../../components/layout/KpiCard";
import { PerfumeCompanyLocations } from "./PerfumeDuplicatesCard";
import { PerfumeHistoryTable } from "./PerfumeHistoryTable";
import { ScentsxCustomerLink } from "./ScentsxCustomerLink";
import { PersonDrawer, RemovePersonModal, RenameCompanyButton, type EditablePerson } from "./PerfumeCompanyPeople";

const DASH = "—";
const usDate = (d: string | null | undefined) => (d ? `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}` : DASH);
const ROLE_TEXT: Record<PerfumeContactRole, string> = { vendor: "Vendor", customer: "Customer", both: "Vendor + customer" };
type Person = PerfumeContactProfile["people"][number] & { title?: string | null; other_emails?: string[] | null; opted_out_at?: string | null; bounced_at?: string | null; sent_lists?: boolean | null };
type EmailRow = { email: string; person: string; title: string | null; primary: boolean; status: string; last: string | null; count: number | null };

/** Every email on file for the company: each person's main email and their other emails, one row each, never repeated. */
export function companyEmails(people: Person[]): EmailRow[] {
  const seen = new Set<string>();
  const out: EmailRow[] = [];
  for (const p of people) {
    const status = p.bounced_at ? "Bounced" : p.opted_out_at ? "Opted out" : "Active";
    const all = [p.email, ...(p.other_emails ?? [])].filter((e): e is string => Boolean(e && e.trim()));
    all.forEach((e, i) => {
      const k = e.trim().toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ email: e.trim(), person: p.name ?? DASH, title: p.title ?? null, primary: i === 0 && e === p.email, status, last: i === 0 ? p.last_email_on : null, count: i === 0 ? p.email_count : null });
    });
  }
  return out;
}

type Tab = "txns" | "statement" | "details" | "emails" | "account" | "notes" | "history";
const money = (c: number | null | undefined) => (c == null ? DASH : (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }));

export function PerfumeCompanyProfile({ id, onClose, backLabel }: { id: string; onClose: () => void; backLabel: string }) {
  const p = useQuery({ queryKey: ["perfume", "contact", id], queryFn: () => getPerfumeContact(id) });
  const [tab, setTab] = useState<Tab>("txns");
  const [editPerson, setEditPerson] = useState<EditablePerson | "new" | null>(null);
  const [removing, setRemoving] = useState<EditablePerson | null>(null);
  const center = useQuery({ queryKey: ["perfume", "company-center", id], queryFn: () => getPerfumeCompanyCenter(id) });
  if (p.isError) return <ListErrorState title={tr("perfume.profile.error", "Couldn't load the company")} status={0} message={(p.error as Error)?.message} onRetry={() => void p.refetch()} />;
  const co = p.data?.company;
  const s = (k: string) => { const v = co?.[k]; return v == null || v === "" ? null : Array.isArray(v) ? (v.length ? v.join(" · ") : null) : String(v); };
  const role = (co?.["role"] as PerfumeContactRole | null) ?? null;
  const cityLine = [s("city"), [s("state"), s("zip")].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const people = (p.data?.people ?? []) as Person[];
  const emails = companyEmails(people);
  const website = s("website");
  // Imported addresses often carry the whole line ("784 Main St, Johnson City, NY 13790"): show the city line only when it adds something.
  const addr = s("address");
  const cityShown = cityLine && !(addr ?? "").toLowerCase().includes((s("city") ?? "\u0000").toLowerCase()) ? cityLine : null;
  // The main phone: the company's, else its first person's (QuickBooks shows the customer's phone, wherever it was entered).
  const mainPhone = s("phone") ?? people.find((x) => x.phones.length)?.phones[0] ?? null;
  const tabBtn = (k: Tab, label: string) => (
    <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`perfume-profile-tab-${k}`}
      className={`h-[34px] border-b-2 px-3 text-xs ${tab === k ? "border-[#14314F] font-semibold text-[#14314F]" : "border-transparent text-[#64748B] hover:text-[#14314F]"}`}>{label}</button>
  );
  const field = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2 border-b border-[#E8EDF2] py-1.5 text-xs">
      <span className="text-[#64748B]">{label}</span><span className="break-words">{value ?? DASH}</span>
    </div>
  );

  return (
    <div className="space-y-3" data-testid="perfume-company-profile">
      <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose} data-testid="perfume-profile-back">{`← ${backLabel}`}</Button>
      <header className="space-y-1 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-profile-header">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-page-title break-words text-[#14314F]" data-testid="perfume-profile-name">{co?.name ?? "…"}</h2>
            <div className="text-xs text-[#334155]" data-testid="perfume-profile-kind">
              {[role ? ROLE_TEXT[role] : "Lead (not a customer or vendor yet)", s("customer_type"), s("vendor_type")].filter(Boolean).join(" · ")}
            </div>
          </div>
          {co ? (
            <div className="flex flex-wrap gap-2">
              <RenameCompanyButton id={id} name={String(co.name ?? "")} onSaved={() => void p.refetch()} />
              <PerfumeCompanyEdit id={id} co={co} onSaved={() => void p.refetch()} />
            </div>
          ) : null}
        </div>
        <div className="grid grid-cols-3 gap-[10px]" data-testid="perfume-profile-balances">
          <KpiCard label="Open balance (they owe us)" number={money(center.data?.open_ar_cents)} />
          <KpiCard label="Overdue" number={money(center.data ? center.data.ar_aging.b1 + center.data.ar_aging.b2 + center.data.ar_aging.b3 : null)} />
          <KpiCard label="We owe them (A/P)" number={money(center.data?.open_ap_cents)} />
        </div>
        <div className="grid gap-x-6 gap-y-0.5 text-xs text-[#1F2A44] md:grid-cols-3" data-testid="perfume-profile-contactline">
          <div>{addr ?? DASH}{cityShown ? <><br />{cityShown}</> : null}{s("country") ? <><br />{s("country")}</> : null}</div>
          <div>{mainPhone ? <a className="underline" href={`tel:${mainPhone}`}>{mainPhone}</a> : "No phone"}<br />
            {emails[0] ? <a className="underline" href={`mailto:${emails[0].email}`}>{emails[0].email}</a> : "No email"}</div>
          <div>{website ? <a className="underline" href={website} target="_blank" rel="noreferrer">{website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a> : "No website"}</div>
        </div>
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-[#D8E0E8]" role="tablist" aria-label={tr("perfume.profile.sections", "Company sections")}>
        {tabBtn("txns", "Transactions")}
        {tabBtn("statement", "Statement")}
        {tabBtn("details", "Customer details")}
        {tabBtn("emails", `Emails & contacts (${emails.length})`)}
        {tabBtn("account", "Account & credit")}
        {tabBtn("notes", "Notes")}
        {tabBtn("history", "History")}
      </nav>

      {tab === "details" ? (
        <div className="space-y-3 lg:max-w-[760px]">
            <section className="rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label="Company information" data-testid="perfume-profile-info">
              <div className="text-card-title mb-1">{tr("perfume.profile.info", "Company information")}</div>
              {field("Company name", co?.name)}
              {field("Address", s("address"))}
              {field("City · state · zip", cityLine || null)}
              {field("Country", s("country"))}
              {field("Main phone", mainPhone)}
              {field("Website", website)}
              {field("Customer type", s("customer_type"))}
              {field("Vendor type", s("vendor_type"))}
              {field("Business type", s("segment"))}
              {field("Owner", s("owner_name"))}
              {field("Region", s("region"))}
              {field("First contact", co?.["first_contact_on"] ? usDate(String(co["first_contact_on"])) : null)}
              {field("Last email", co?.["last_email_on"] ? usDate(String(co["last_email_on"])) : null)}
              {field("Notes", s("notes"))}
            </section>
            <RoleBlock id={id} />
        </div>
      ) : null}
      {tab === "emails" ? (
        <div className="space-y-3">
            <div className="flex justify-end">
              <Button type="button" variant="primary" className="h-[34px] px-3 text-xs" onClick={() => setEditPerson("new")} data-testid="perfume-profile-add-person">+ Add person</Button>
            </div>
            <ParityTable<EmailRow>
              cardTitle title={`${tr("perfume.profile.emails", "Emails")} (${emails.length})`}
              rows={emails}
              rowKey={(e) => e.email}
              loading={p.isLoading}
              storageKey="perfume-profile-emails-v1"
              exportFilename={`${co?.name ?? "Company"} emails`}
              exportExcel
              suppressToolbarSearch
              emptyText="No email on file for this company."
              columns={[
                { key: "email", label: "Email", sortable: true, render: (e) => <a className="font-semibold text-[#14314F] underline" href={`mailto:${e.email}`}>{e.email}</a> },
                { key: "person", label: "Person", sortable: true, render: (e) => (e.title ? `${e.person} · ${e.title}` : e.person) },
                { key: "primary", label: "Main", sortable: true, render: (e) => (e.primary ? "Main" : "Other") },
                { key: "status", label: "Status", sortable: true, render: (e) => <span className={e.status === "Active" ? "" : "text-[#B91C1C]"}>{e.status}</span> },
                { key: "last", label: "Last email", sortable: true, cellClass: "text-right tabular-nums", render: (e) => usDate(e.last) },
                { key: "count", label: "Emails", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (e) => (e.count == null ? DASH : e.count.toLocaleString("en-US")) },
              ]}
            />
            <ParityTable<Person>
              cardTitle title={`${tr("perfume.profile.contacts", "Contacts")} (${people.length})`}
              rows={people}
              rowKey={(x) => x.id}
              loading={p.isLoading}
              storageKey="perfume-profile-people-v1"
              exportFilename={`${co?.name ?? "Company"} contacts`}
              exportExcel
              suppressToolbarSearch
              emptyText="No person on file yet."
              columns={[
                { key: "name", label: "Name", sortable: true, render: (x) => <span className="font-semibold">{x.name ?? DASH}</span> },
                { key: "title", label: "Title", sortable: true, render: (x) => x.title ?? DASH },
                { key: "email", label: "Email", sortable: true, render: (x) => (x.email ? <a className="underline" href={`mailto:${x.email}`}>{x.email}</a> : DASH) },
                { key: "phones", label: "Phones", sortable: true, render: (x) => x.phones.join(" · ") || DASH },
                { key: "role", label: "Role", sortable: true, render: (x) => (x.role ? ROLE_TEXT[x.role] : DASH) },
                { key: "last_email_on", label: "Last email", sortable: true, cellClass: "text-right tabular-nums", render: (x) => usDate(x.last_email_on) },
                { key: "actions", label: "", render: (x) => (
                  <span className="flex gap-1">
                    <Button type="button" variant="secondary" className="h-[26px] px-2 text-xs" onClick={(e) => { e.stopPropagation(); setEditPerson(x as EditablePerson); }} data-testid={`perfume-person-edit-${x.id}`}>Edit</Button>
                    <Button type="button" variant="secondary" className="h-[26px] px-2 text-xs" onClick={(e) => { e.stopPropagation(); setRemoving(x as EditablePerson); }} data-testid={`perfume-person-remove-${x.id}`}>Remove</Button>
                  </span>), exportValue: () => "" },
              ]}
            />
            {editPerson ? <PersonDrawer companyId={id} person={editPerson === "new" ? null : editPerson} onClose={() => setEditPerson(null)} onSaved={() => void p.refetch()} /> : null}
            {removing ? <RemovePersonModal person={removing} onClose={() => setRemoving(null)} onSaved={() => void p.refetch()} /> : null}
        </div>
      ) : null}
      {tab === "account" ? (
        <div className="text-xs lg:max-w-[520px]" data-testid="perfume-profile-account">
          {co ? <ScentsxCustomerLink contactId={id} name={String(co.name ?? "")} email={emails[0]?.email ?? null} phone={s("phone")} /> : null}
        </div>
      ) : null}
      {tab === "txns" ? <PerfumeCompanyCenter companyId={id} view="txns" /> : null}
      {tab === "statement" ? <PerfumeCompanyCenter companyId={id} view="statement" /> : null}
      {tab === "notes" ? <PerfumeCompanyCenter companyId={id} view="notes" /> : null}
      {tab === "history" ? <div className="space-y-3"><Origins rows={p.data?.origins ?? []} loading={p.isLoading} /><History id={id} /></div> : null}
    </div>
  );
}

/** Customer / vendor / both and its type — the one writer (PerfumeCompanyRole), on the details tab. */
function RoleBlock({ id }: { id: string }) {
  const a = useQuery({ queryKey: ["perfume", "company-activity", id], queryFn: () => getPerfumeCompanyActivity(id) });
  return a.data ? <CompanyRoleEditor company={a.data.company} /> : null;
}

function Origins({ rows, loading }: { rows: PerfumeContactProfile["origins"]; loading: boolean }) {
  return (
    <ParityTable<PerfumeContactProfile["origins"][number]>
      cardTitle title={tr("perfume.contacts.how_and_when_this_relationship_started", "How and when this relationship started")}
      rows={rows} rowKey={(o) => o.id} loading={loading} storageKey="perfume-profile-origins-v1" exportFilename="Company origins" exportExcel suppressToolbarSearch
      emptyText="No origin recorded."
      columns={[
        { key: "occurred_on", label: "Date", sortable: true, cellClass: "text-right tabular-nums", render: (o) => usDate(o.occurred_on) },
        { key: "how", label: "How", sortable: true },
        { key: "source", label: "Where (source)", sortable: true, render: (o) => (o.source_url ? <a className="text-[#14314F] underline" href={o.source_url} target="_blank" rel="noreferrer">{o.source}</a> : o.source) },
        { key: "person_name", label: "Who", sortable: true, render: (o) => o.person_name ?? DASH },
        { key: "detail", label: "Detail", sortable: true, render: (o) => o.detail ?? DASH },
      ]}
    />
  );
}

function History({ id }: { id: string }) {
  const history = useQuery({ queryKey: ["perfume", "contact", id, "history"], queryFn: () => perfumeContactHistory(id) });
  const locs = useQuery({ queryKey: ["perfume", "contact-locations", id], queryFn: () => getPerfumeCompanyLocations(id) });
  return (
    <div className="space-y-3">
      <PerfumeCompanyLocations rows={locs.data?.locations ?? []} />
      <PerfumeHistoryTable events={history.data?.events ?? []} loading={history.isLoading} storageKey="perfume-profile-history-v1" exportName="Company history" />
    </div>
  );
}
