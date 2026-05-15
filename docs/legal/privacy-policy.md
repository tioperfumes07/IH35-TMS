# Privacy Policy — IH 35 Dispatch (Product)

**Last updated:** May 13, 2026  

**Contact:** privacy@ih35transportation.com (replace with your production contact before launch)

IH 35 Transportation LLC and its affiliated operating carriers (collectively, **“we,” “us,”** or **“our”**) operate **IH 35 Dispatch**, a trucking transportation management system (the **“Service”**). This Privacy Policy explains what personal and business information we collect when you use the Service, how we use it, when we share it, how long we keep it, and the choices available to you.

This policy is written to support regulated financial integrations (including bank linking through **Plaid**) and accounting synchronization (including **Intuit QuickBooks Online**, **“QBO”**). It is a **draft template**: your counsel should review and localize it before you market the Service to external customers.

---

## 1. Scope and roles

The Service is used by authorized employees, contractors, owner-operators, and other business partners you designate. Depending on your relationship with us, we may process:

- **Workforce data** about drivers, dispatchers, mechanics, accountants, and administrators.
- **Commercial contact and account data** about customers, vendors, brokers, and factoring partners.
- **Financial account metadata and transactions** when a user with authority links a bank account through Plaid.
- **Location, operational, and safety-related records** generated during transportation and compliance workflows.

We process this information to operate motor carrier services, comply with Department of Transportation and contractual obligations, invoice and pay counterparties, and maintain the security and integrity of our systems.

---

## 2. Data we collect

### 2.1 Account and identity data

We collect names, work email addresses, phone numbers, role assignments, and authentication events necessary to grant access to the Service. We may collect device and connection metadata (IP address, user agent, approximate location derived from network signals) for security monitoring and fraud prevention.

### 2.2 Transportation, safety, and HR records

We collect information required to qualify drivers and equipment and to evidence compliant operations, including CDL details, medical and safety documentation, inspection records, Hours-of-Service-related data, incident reports, maintenance logs, cargo paperwork, and similar operational artifacts supplied by users or connected telematics vendors.

### 2.3 Counterparty and accounting records

We collect business registration details, tax identifiers (such as EIN or SSN where legally collected for 1099/W-9 workflows), remittance instructions, credit and collections notes, rate confirmations, and billing contacts for customers and vendors. We also process accounting entries, invoices, bills, payments, and synchronization artifacts relating to QBO.

### 2.4 Financial data via Plaid

When an authorized user links a bank account, **Plaid, Inc.** collects credentials and retrieves account identifiers, institution metadata, balances, and transaction histories according to Plaid’s own privacy practices. We receive a subset of that data through Plaid to display banking workflows, support reconciliation, and post to accounting systems where configured. We do not ask Plaid for data categories beyond what is needed for those features.

You should also review Plaid’s consumer disclosure materials at `https://plaid.com/legal/`.

### 2.5 Data we collect automatically

We log application activity (audit trails for privileged actions), webhook deliveries from integrated partners, error reports, and performance telemetry needed to keep the Service available. Where we enable integrations (for example, QBO or fleet telematics vendors), those partners may send us additional records in accordance with their terms.

---

## 3. How we use information

We use collected data to:

- Provide dispatch, safety, maintenance, fuel, accounting, and reporting features.
- Authenticate users, enforce role-based permissions, investigate misuse, and protect account security.
- Process payroll, settlements, factoring, invoicing, and vendor payments subject to your internal controls.
- Link, categorize, and reconcile bank transactions; prepare exports or journal activity for QBO when enabled.
- Comply with carrier safety regulations, tax obligations, litigation holds, and lawful governmental requests after appropriate review.
- Improve reliability and diagnose defects using aggregated or de-identified metrics where permitted.

We do not sell personal information and do not use Plaid data for unrelated targeted advertising.

---

## 4. How Plaid fits in the IH 35 Dispatch architecture

Plaid acts as an intermediary between our Service and your financial institution. **You** (or your designated banking administrator) initiate linking from inside IH 35 Dispatch; Plaid handles credentialing with the institution and returns tokens and financial data to our systems through secured APIs.

We use Plaid-derived data strictly for:

- Displaying linked accounts and recent transactions to authorized finance users.
- Supporting reconciliation labels, categorization rules, and exception handling inside IH 35 Dispatch.
- Feeding validated financial records into downstream accounting workflows (including optional QBO sync) when those features are toggled on and properly authorized.

If you revoke Plaid access at the institution or disconnect a link inside IH 35 Dispatch, we stop receiving new transaction data from Plaid for that link, subject to reasonable processing delays.

---

## 5. Data sharing, including QuickBooks Online

We share information only with:

- **Service providers** who host infrastructure, deliver email/SMS, or provide specialized compliance tooling under written agreements requiring confidentiality and security safeguards.
- **Plaid** to initiate and maintain account links you authorize.
- **Intuit QuickBooks Online** when your administrators configure QBO sync. That typically includes commercial counterparties, invoices, payments, chart-of-account mappings, and classes necessary to mirror your books.
- **Professional advisers** (lawyers, auditors, insurers) bound by professional obligations.
- **Regulators or courts** when disclosure is legally required.

We enter data processing or business associate-style terms where appropriate and require subprocessors to limit use to our instructions.

---

## 6. Data retention

We retain records long enough to meet operational, tax, and regulatory needs. Retention periods vary: motor carrier safety files, payroll and settlement evidence, and accounting ledgers may be retained for multiple years, while ephemeral logs may roll off sooner. Bank transaction history imported through Plaid is retained in the Service until you delete the underlying records or purge the environment, subject to litigation holds.

When backup systems retain snapshots, deletion in the live database may not instantly purge all archival copies; we overwrite backups on rolling schedules consistent with our disaster recovery policy.

---

## 7. Security

We implement administrative, technical, and physical controls appropriate to the sensitivity of transportation and financial data, including encryption in transit, access controls tied to job roles, audit logging for high-risk actions, and vendor due diligence. No online system is perfectly secure; please protect your credentials and report suspected incidents promptly.

---

## 8. Your rights and choices

Depending on your jurisdiction, you may have rights to access, correct, delete, or export certain personal information, or to object to particular processing. Workforce members should contact their HR or compliance administrator; external counterparties should contact the email below. We will verify requests to prevent unauthorized disclosure.

Where processing is contractually limited (for example, brokered loads), we may need to coordinate with the broker or shipper that engaged you.

---

## 9. Children’s data

The Service is not directed to children under 16, and we do not knowingly collect their personal information for marketing.

---

## 10. International transfers

If you access the Service from outside the United States, your information may be processed in the United States or other countries where we or our vendors maintain facilities. We implement safeguards required by applicable law for cross-border transfers.

---

## 11. Changes to this Policy

We may update this Privacy Policy to reflect new features, partner requirements (including Plaid or Intuit updates), or legal obligations. We will revise the “Last updated” date and, where appropriate, provide additional notice inside the Service or by email.

---

## 12. Contact

Questions about this Privacy Policy or our privacy practices may be directed to **privacy@ih35transportation.com** or your designated IH 35 Dispatch administrator.

---

**TEMPLATE — These documents are draft templates for Plaid OAuth submission. Final versions should be reviewed by legal counsel before production launch to real customers.**
