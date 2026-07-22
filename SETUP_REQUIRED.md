# ElderCare Connect — Required Setup

The application code builds successfully only after dependencies are installed. Database, authentication, storage, AI, email, voice and push features also require the external services below.

## 1. Install and run

```bash
npm ci
npm run dev
```

The development server normally starts on port `8080`. When that port is occupied, Vite selects the next available port.

Production checks:

```bash
npx tsc --noEmit
npm run build
npm run preview
```

`npm run preview` uses Wrangler because the default Nitro output is a Cloudflare Worker build.

## 2. Environment variables

Copy `.env.example` to `.env` and replace every placeholder that you need.

Minimum for authentication and normal database pages:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Server-side SOS administration and push delivery additionally require:

```env
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

Never expose `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `GEMINI_API_KEY`, `RESEND_API_KEY`, or `LOVABLE_API_KEY` with a `VITE_` prefix.

Optional integrations:

- `GEMINI_API_KEY` — AI Companion and AI-enhanced Risk Check wording.
- `VITE_VAPI_PUBLIC_KEY` — AI Companion voice calls.
- `RESEND_API_KEY` or Lovable email connector — SOS email delivery.
- VAPID keys — browser push notifications.

Generate VAPID keys with:

```bash
npx web-push generate-vapid-keys --curve prime256v1
```

## 3. Supabase database

### Existing database

Apply every migration that has not already been run, in filename order. The newest feature migrations are:

```text
20260718000000_add_notification_soft_delete.sql
20260718010000_transport_round_trip_fields.sql
20260718020000_health_records_realtime.sql
20260718030000_secure_family_linking.sql
20260718040000_emergency_contacts_improvements.sql
20260718050000_settings_controls_and_validation.sql
20260718060000_ai_risk_and_companion_improvements.sql
20260718070000_sos_alert_reliability.sql
```

Do not rerun `MASTER_SETUP.sql` on an existing database.

### New database

Run the baseline migrations in `supabase/migrations` in chronological filename order, or use your normal Supabase migration command. After the baseline, ensure all July 2026 migrations above have also been applied.

The `health-records` private Storage bucket and its RLS policies are required for Health Records and consultation prescription uploads.

## 4. Feature limitations

- Medicine and exact appointment alarm dialogs require the application to be open in a browser tab. They are not an operating-system background scheduler.
- Browsers cannot silently place telephone calls. SOS auto-call can open the dialler, but the user must confirm the call.
- Uber and Ola links open the provider service; no real cab is booked without an official provider API integration.
- SMS links open the device messaging application. Automatic server-side SMS requires a provider such as Twilio and is not configured in this project.
- AI Risk Check is a screening aid, not a diagnosis or disease probability.

## 5. Verification commands

```bash
npm ci --dry-run
npx tsc --noEmit
npm run build
npm audit --omit=dev --audit-level=high
```

A successful local build does not verify live Supabase RLS, external API keys, browser notification permission, GPS permission, microphone permission, or email/push delivery. Those must be tested against the configured deployment.
