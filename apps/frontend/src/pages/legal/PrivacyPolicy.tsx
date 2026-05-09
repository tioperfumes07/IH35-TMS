export function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-white" style={{ color: "var(--slate, #1e293b)" }}>
      <article className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold" style={{ color: "var(--navy, #0f172a)" }}>
          Privacy Policy — IH 35 Transportation LLC
        </h1>
        <p className="mt-4">
          <strong>Effective Date:</strong> May 9, 2026
          <br />
          <strong>Last Updated:</strong> May 9, 2026
        </p>

        <h2 className="mt-8 text-2xl font-semibold">1. About This Policy</h2>
        <p className="mt-3">
          IH 35 Transportation LLC ("Company," "we," "us," or "our") operates the IH 35 TMS internal management
          system at app.ih35dispatch.com, api.ih35dispatch.com, and driver.ih35dispatch.com. This Privacy Policy
          explains how we collect, use, share, and protect information in connection with our internal trucking
          operations and back-office accounting workflows.
        </p>
        <p className="mt-3">
          This is an internal employee tool. We do not offer services to the general public.
        </p>

        <h2 className="mt-8 text-2xl font-semibold">2. Who This Applies To</h2>
        <p className="mt-3">This policy applies to:</p>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>Employees and contractors of IH 35 Transportation LLC, IH 35 Trucking LLC, and USMCA Freight Solutions Inc.</li>
          <li>Authorized users of our internal TMS</li>
          <li>Drivers operating equipment on our authority</li>
          <li>Vendors, customers, and brokers whose information we process for business operations</li>
        </ul>

        <h2 className="mt-8 text-2xl font-semibold">3. Information We Collect</h2>

        <h3 className="mt-5 text-xl font-semibold">3.1 Information from Employees and Drivers</h3>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>Name, contact information, and emergency contacts</li>
          <li>Employment records, training certifications, CDL information</li>
          <li>Background checks and DOT-required documentation</li>
          <li>Hours of Service (HOS) records and trip logs</li>
          <li>Geolocation data while operating Company equipment</li>
          <li>Photos and video for accident, incident, and equipment-condition documentation</li>
        </ul>

        <h3 className="mt-5 text-xl font-semibold">3.2 Information from Customers, Vendors, and Brokers</h3>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>Business name, MC/DOT numbers, contact information</li>
          <li>Tax identification numbers (W-9 information)</li>
          <li>Bank routing/account information for ACH payments</li>
          <li>Credit history and payment terms</li>
          <li>Communications related to load tendering and invoicing</li>
        </ul>

        <h3 className="mt-5 text-xl font-semibold">3.3 Information from Connected Financial Accounts</h3>
        <p className="mt-2">
          We use Plaid to connect to authorized Company bank accounts. Plaid collects banking information directly from
          the financial institution and shares it with us per their privacy practices. We retrieve:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>Account names, numbers, and routing numbers</li>
          <li>Account balances and historical transaction data (up to 24 months)</li>
          <li>Account holder identity information for verification</li>
        </ul>
        <p className="mt-2">
          Plaid&apos;s Privacy Policy:{" "}
          <a
            href="https://plaid.com/legal/"
            target="_blank"
            rel="noreferrer"
            className="underline"
            style={{ color: "var(--navy, #0f172a)" }}
          >
            https://plaid.com/legal/
          </a>
        </p>

        <h3 className="mt-5 text-xl font-semibold">3.4 Information from Other Third-Party Services</h3>
        <p className="mt-2">We integrate with:</p>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>QuickBooks Online (Intuit) - accounting data</li>
          <li>Samsara - telematics and HOS data from Company equipment</li>
          <li>Twilio - phone-based authentication and SMS notifications</li>
          <li>Resend - transactional email delivery</li>
          <li>Cloudflare R2 - encrypted document storage</li>
          <li>Anthropic - AI-assisted document parsing (rate confirmations)</li>
        </ul>

        <h2 className="mt-8 text-2xl font-semibold">4. How We Use Information</h2>
        <p className="mt-3">We use information to:</p>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>Operate the TMS and conduct daily trucking operations</li>
          <li>Process driver payroll, settlements, and reimbursements</li>
          <li>Manage customer billing, factoring, and accounts receivable</li>
          <li>Comply with FMCSA, DOT, IRS, and other regulatory requirements</li>
          <li>Meet Chapter 11 DIP financial reporting obligations (where applicable)</li>
          <li>Reconcile bank transactions and prepare tax filings</li>
          <li>Detect and prevent fraud or unauthorized access</li>
          <li>Maintain audit logs for legal and compliance purposes</li>
        </ul>

        <h2 className="mt-8 text-2xl font-semibold">5. How We Share Information</h2>
        <p className="mt-3">We share information with:</p>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>
            <strong>Service providers</strong> under contract: Render (hosting), Neon (database), Cloudflare
            (CDN/storage), Plaid (banking), QuickBooks Online (accounting), Samsara (telematics), Twilio
            (communications), Resend (email), Anthropic (AI services), Upstash (cache)
          </li>
          <li>
            <strong>Factoring partners</strong>: Faro Factoring (current), and as we may migrate to other partners
          </li>
          <li>
            <strong>Government agencies</strong>: when required by law (FMCSA, DOT, IRS, Bankruptcy Court for Ch.11
            DIP)
          </li>
          <li>
            <strong>Legal counsel and auditors</strong>: under confidentiality obligations
          </li>
          <li>
            <strong>Successors in interest</strong>: in connection with a merger, acquisition, or sale of business
            assets
          </li>
        </ul>
        <p className="mt-3">We do NOT sell personal information to third parties for marketing purposes.</p>

        <h2 className="mt-8 text-2xl font-semibold">6. How We Protect Information</h2>
        <p className="mt-3">We maintain the following safeguards:</p>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>TLS 1.3 encryption for all data in transit</li>
          <li>AES-256 encryption at rest for all databases and file storage</li>
          <li>Multi-factor authentication on all critical systems</li>
          <li>Role-based access controls with least-privilege permissions</li>
          <li>Append-only audit logging of all data access</li>
          <li>Annual review of security practices</li>
        </ul>
        <p className="mt-3">
          For details, see our Information Security Policy (available on request to authorized parties).
        </p>

        <h2 className="mt-8 text-2xl font-semibold">7. Data Retention</h2>
        <p className="mt-3">We retain information per applicable law and operational need:</p>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>Tax records: 7 years per IRS requirement</li>
          <li>Driver safety records: permanent (legal protection)</li>
          <li>Bank transaction history: per accounting/audit needs</li>
          <li>DOT/FMCSA records: per regulatory requirement</li>
          <li>Audit logs: 7 years</li>
        </ul>
        <p className="mt-3">
          Records are voided rather than deleted to preserve audit trails; hard deletion requires Owner authorization.
        </p>

        <h2 className="mt-8 text-2xl font-semibold">8. Your Rights</h2>
        <p className="mt-3">If you are an employee, contractor, driver, or authorized user, you may:</p>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>Request access to information we hold about you</li>
          <li>Request correction of inaccurate information</li>
          <li>Request a copy of your data in a portable format</li>
          <li>Withdraw consent for non-required data processing</li>
        </ul>
        <p className="mt-3">To exercise any right, contact the Company at the email below.</p>

        <h2 className="mt-8 text-2xl font-semibold">9. Children&apos;s Privacy</h2>
        <p className="mt-3">
          Our services are not directed to children under 13 and we do not knowingly collect information from children.
        </p>

        <h2 className="mt-8 text-2xl font-semibold">10. Changes to This Policy</h2>
        <p className="mt-3">
          We may update this Privacy Policy from time to time. Material changes will be communicated via email to
          authorized users. The "Last Updated" date at the top of this policy reflects the most recent revision.
        </p>

        <h2 className="mt-8 text-2xl font-semibold">11. Cross-Border Data Transfers</h2>
        <p className="mt-3">
          Information may be processed in the United States, where our service providers are located. By using our
          systems, you consent to processing in the United States.
        </p>

        <h2 className="mt-8 text-2xl font-semibold">12. Contact Us</h2>
        <p className="mt-3">For questions about this Privacy Policy, contact:</p>
        <p className="mt-3">
          <strong>IH 35 Transportation LLC</strong>
          <br />
          Owner: Jorge Munoz
          <br />
          Email:{" "}
          <a href="mailto:tioperfumes07@gmail.com" className="underline" style={{ color: "var(--navy, #0f172a)" }}>
            tioperfumes07@gmail.com
          </a>
          <br />
          Address: Laredo, Texas, United States
        </p>
      </article>
    </main>
  );
}
