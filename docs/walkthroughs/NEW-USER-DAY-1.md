# New User — Day 1 Walkthrough

This walkthrough takes a brand-new operator from first login through the
onboarding wizard and a guided tour of every module using sample data.

## 1. Log in

1. Open the app URL provided in your invite email.
2. Sign in with your email + password (or the password-setup link from your invite).
3. On first login with no configured data, head to **Operator onboarding**.

## 2. Run the onboarding wizard

The wizard has six steps and a progress bar. Each step saves automatically
(`PATCH /api/v1/onboarding/state`) so you can stop and resume any time.

1. **Company** — enter company name, EIN, address, MC#, DOT#, NAICS code, and
   select your operating states. (Company name, MC#, and DOT# are required to advance.)
2. **QuickBooks** — click **Connect QBO** and authorize. You'll return to the wizard
   with a green "Connected" badge.
3. **Samsara** — paste your API key + webhook secret, then **Test connection & pull fleet**.
4. **Bank (Plaid)** — click **Connect bank account** and link at least one account
   through Plaid Link.
5. **Invite team** — add teammates by email and assign `admin` / `operator` / `driver`.
   Invitations are emailed when you press **Save & continue**.
6. **Sample data** — leave **Seed sample data for tutorial** checked and click
   **Seed sample data**. Then click **Finish onboarding**.

## 3. Explore each module with sample data

After seeding, the following flagged (`is_sample_data = true`) records exist:

- Customer: **Sample Customer Inc**
- Vendor: **Sample Vendor Co**
- Driver: **John Tester**
- Truck: **TEST-001**
- Load: **LD-SAMPLE-001** (Laredo → San Antonio)

Click through each area to see how data connects:

1. **Dispatch** — open load `LD-SAMPLE-001`, view its pickup/delivery stops.
2. **Drivers** — open **John Tester**; note the truck assignment to `TEST-001`.
3. **Customers / Vendors** — review **Sample Customer Inc** and **Sample Vendor Co**.
4. **Banking** — see your linked Plaid account and any imported transactions.
5. **Accounting** — confirm the QBO connection badge is green.
6. **Reports** — run AR aging / dispatch margin to see how the sample load appears.

## 4. Clean up later

Sample rows are flagged and safe to remove once you no longer need the tutorial
data. An admin can remove them later without touching real records.

## Next

Continue to [NEW-USER-WEEK-1.md](./NEW-USER-WEEK-1.md) to connect real data and
run your first real operations.
