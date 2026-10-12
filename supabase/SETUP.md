# Switching on accounts, alerts and matching

Everything is built and tested. Until the steps below are done, the site shows an
example of My Home and the lead form keeps its email fallback. About 30 minutes,
all on free plans.

## 1. Supabase (database and sign-in)

1. Sign in at supabase.com and create a project: name `audityourhome`, region
   **Canada (Central)**, Free plan. Save the database password in your password
   manager. (The free plan allows two active projects; paused ones don't count.)
2. SQL Editor → New query → paste all of
   `supabase/migrations/20261012120000_accounts.sql` → Run. It is safe to run again.
3. Authentication → URL Configuration: Site URL `https://audityourhome.com/account/`;
   add the redirect URL `https://audityourhome.com/**`.
4. Project Settings → API Keys: note the **Project URL** and the **publishable key**
   (`sb_publishable_…`). Both are public and go in `src/config/accounts.json`.
   The **secret key** (`sb_secret_…`) is private: it goes only into GitHub (step 3).

## 2. Resend (sends sign-in codes and alerts)

Required: Supabase's built-in email only reaches the project's own team.

1. Sign up at resend.com (free: 3,000 emails a month, 100 a day).
2. Domains → Add domain → `updates.audityourhome.com`. Add the DNS records it shows
   at GoDaddy (or use GoDaddy's automatic setup) and wait for "Verified".
3. API Keys → create a sending key for that domain.
4. Supabase → Authentication → Emails → SMTP Settings → enable custom SMTP:
   sender `signin@updates.audityourhome.com`, name `AuditYourHome`, host
   `smtp.resend.com`, port `465`, username `resend`, password = the Resend key.
5. Supabase → Authentication → Emails → Templates: paste
   `supabase/templates/confirm-signup.html` into "Confirm signup" and
   `supabase/templates/magic-link.html` into "Magic link"; subject for both:
   `Your AuditYourHome sign-in code`. (Free projects can edit templates only after
   custom SMTP is on.)

## 3. GitHub (the hourly alert job)

Repository → Settings → Secrets and variables → Actions.

- Secrets: `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`.
- Variables: `SUPABASE_URL`, `MAILING_ADDRESS` (required by CASL in every alert),
  and optionally `ADMIN_NOTIFY` (comma-separated; default dave@clickshift.ca) and
  `ALERTS_FROM` (default `AuditYourHome <alerts@updates.audityourhome.com>`).

Then Actions → "Alerts and match notices" → Run workflow with "Dry run" ticked.
The job runs hourly, and its database query keeps the free project from pausing.

## 4. Switch it on

Fill in `src/config/accounts.json` (Project URL, publishable key, mailing address)
and push. Sign in at audityourhome.com/account/ with dave@clickshift.ca: that address
is an admin automatically. Add others (Kyle) from the admin console.

## Compliance notes

- Quebec Law 25: Supabase keeps data in Montréal. Resend processes email addresses
  in the United States, so do a privacy impact assessment and keep Resend's data
  processing agreement on file before switching on (s. 17).
- CASL: sign-ups record the consent wording and time; every alert names the sender
  with the mailing address and has a one-click unsubscribe that takes effect at once.
- Review /privacy/ before launch.

## How it fits together

- `supabase/migrations/…_accounts.sql`: tables, row-level security, functions.
- `src/lib/account/`: My Home (`app.ts`), admin console (`admin.ts`), shared client.
- `src/pages/account/`: My Home, admin console, unsubscribe. `src/pages/alerts.astro`,
  `src/pages/updates.astro`: public pages.
- `src/components/LeadForm.astro`, `AccountSignup.astro`: forms that hold a request
  until the email address is confirmed with a code or link.
- `tools/alerts/run.mjs` + `.github/workflows/alerts.yml`: hourly emails.
- `src/data/program-updates.json`: add program changes here; they appear on
  /updates/ and are emailed to subscribers in those provinces.
