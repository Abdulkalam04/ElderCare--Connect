import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

async function sendEmail(to: string, subject: string, html: string) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  let response: Response;

  if (lovableKey) {
    response = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey ?? "",
      },
      body: JSON.stringify({
        from: "ElderCare Connect <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });
  } else if (resendKey) {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "ElderCare Connect <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });
  } else {
    throw new Error(
      "Email service is not configured. Add RESEND_API_KEY to the environment.",
    );
  }

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `Resend ${response.status}: ${text.slice(0, 300)}`,
    );
  }

  return response.json();
}

function escapeHtml(value: string | null | undefined) {
  return (value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildHtml(options: {
  elderName: string;
  alertType: string;
  message: string;
  timestamp: string;
  address?: string | null;
  mapsUrl?: string | null;
}) {
  const elderName = escapeHtml(options.elderName);
  const alertType = escapeHtml(options.alertType);
  const message = escapeHtml(options.message);
  const timestamp = escapeHtml(options.timestamp);
  const address = escapeHtml(options.address);
  const mapsUrl = options.mapsUrl
    ? escapeHtml(options.mapsUrl)
    : null;

  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff;color:#1a1a1a">
    <h1 style="color:#b91c1c;margin:0 0 12px">
      🚨 Emergency alert
    </h1>

    <p style="font-size:16px;margin:0 0 16px">
      <strong>${elderName}</strong> has activated an SOS alert.
    </p>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
      <tr>
        <td style="padding:6px 0;color:#666">Type</td>
        <td style="padding:6px 0">
          <strong>${alertType}</strong>
        </td>
      </tr>

      <tr>
        <td style="padding:6px 0;color:#666">Message</td>
        <td style="padding:6px 0">${message}</td>
      </tr>

      <tr>
        <td style="padding:6px 0;color:#666">Time</td>
        <td style="padding:6px 0">${timestamp}</td>
      </tr>

      ${address
      ? `
            <tr>
              <td style="padding:6px 0;color:#666;vertical-align:top">
                Location
              </td>
              <td style="padding:6px 0">
                ${address}
              </td>
            </tr>
          `
      : ""
    }
    </table>

    ${mapsUrl
      ? `
          <p>
            <a
              href="${mapsUrl}"
              style="display:inline-block;background:#b91c1c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none"
            >
              View location on map
            </a>
          </p>
        `
      : ""
    }

    <p style="color:#666;font-size:12px;margin-top:24px">
      This is an automated emergency notification from ElderCare
      Connect. Contact the care recipient directly and call local
      emergency services when required.
    </p>
  </div>
  `;
}

export const notifySosAlert = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      alertId: z.string().uuid(),
      alertType: z.string().default("manual"),
    }),
  )
  .handler(async ({ data, context }) => {
    /*
     * Get the SOS alert through the authenticated Supabase client.
     * Supabase RLS first verifies that the current user can access it.
     */
    const { data: alert, error: alertError } =
      await context.supabase
        .from("sos_alerts")
        .select(
          `
            id,
            parent_id,
            message,
            created_at,
            latitude,
            longitude,
            address,
            parent_name
          `,
        )
        .eq("id", data.alertId)
        .single();

    if (alertError || !alert) {
      throw new Error(
        "Alert not found or not accessible.",
      );
    }

    /*
     * A linked child may be allowed to view an SOS alert, but only the
     * parent who owns the alert should be able to send or resend all
     * external SOS emails.
     */
    if (context.userId !== alert.parent_id) {
      throw new Error(
        "Only the care-recipient account can send SOS notifications.",
      );
    }

    /*
     * Check whether the parent has disabled email notifications.
     */
    const {
      data: settings,
      error: settingsError,
    } = await (context.supabase as any)
      .from("elder_settings")
      .select("notify_email")
      .eq("parent_id", alert.parent_id)
      .maybeSingle();

    if (settingsError) {
      console.error(
        "Could not read SOS email settings:",
        settingsError,
      );
    }

    if (settings?.notify_email === false) {
      return {
        sent: 0,
        failed: 0,
        recipients: 0,
        skipped:
          "email_notifications_disabled_in_settings",
      };
    }

    /*
     * Set automatically prevents duplicate email addresses.
     *
     * For example, when the same person is both an emergency
     * contact and a trusted caregiver, only one email is sent.
     */
    const recipients = new Set<string>();

    /*
     * 1. Find linked children.
     */
    const {
      data: links,
      error: linksError,
    } = await context.supabase
      .from("parent_child_links")
      .select("child_id")
      .eq("parent_id", alert.parent_id);

    if (linksError) {
      console.error(
        "Could not load linked family members for SOS email:",
        linksError,
      );
    }

    const childIds = (links ?? []).map(
      (link) => link.child_id,
    );

    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    /*
     * Get the linked child's authentication email when the
     * service-role key is available.
     */
    if (serviceKey && childIds.length > 0) {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );

      for (const childId of childIds) {
        try {
          const { data: userResult } =
            await supabaseAdmin.auth.admin.getUserById(
              childId,
            );

          const email =
            userResult?.user?.email
              ?.trim()
              .toLowerCase();

          if (
            email &&
            z.string().email().safeParse(email).success
          ) {
            recipients.add(email);
          }
        } catch (error) {
          console.error(
            "Could not read linked family auth email:",
            error,
          );
        }
      }
    }

    /*
     * Also check the child's profile email.
     * This provides a fallback when the service-role key is absent.
     */
    if (childIds.length > 0) {
      const {
        data: childProfiles,
        error: childProfilesError,
      } = await context.supabase
        .from("profiles")
        .select("id,email")
        .in("id", childIds);

      if (childProfilesError) {
        console.error(
          "Could not read linked family profile emails:",
          childProfilesError,
        );
      }

      for (const childProfile of childProfiles ?? []) {
        const email = childProfile.email
          ?.trim()
          .toLowerCase();

        if (
          email &&
          z.string().email().safeParse(email).success
        ) {
          recipients.add(email);
        }
      }
    }

    /*
     * 2. Add configured emergency contacts.
     */
    const {
      data: emergencyContacts,
      error: contactsError,
    } = await (context.supabase as any)
      .from("emergency_contacts")
      .select("email")
      .eq("parent_id", alert.parent_id)
      .not("email", "is", null);

    if (contactsError) {
      console.error(
        "Could not read emergency-contact emails:",
        contactsError,
      );
    }

    for (const contact of emergencyContacts ?? []) {
      const email = contact.email
        ?.trim()
        .toLowerCase();

      if (
        email &&
        z.string().email().safeParse(email).success
      ) {
        recipients.add(email);
      }
    }

    /*
     * 3. Add trusted caregivers.
     *
     * Only caregivers marked as available receive automatic
     * emergency emails.
     */
    const {
      data: trustedCaregivers,
      error: trustedCaregiversError,
    } = await (context.supabase as any)
      .from("trusted_caregivers")
      .select("email")
      .eq("parent_id", alert.parent_id)
      .eq("available", true)
      .not("email", "is", null);

    if (trustedCaregiversError) {
      /*
       * Do not stop the complete SOS process when an older Supabase
       * project has not applied the trusted-caregiver migration.
       */
      console.warn(
        "Could not read trusted-caregiver emails:",
        trustedCaregiversError,
      );
    }

    for (const caregiver of trustedCaregivers ?? []) {
      const email = caregiver.email
        ?.trim()
        .toLowerCase();

      if (
        email &&
        z.string().email().safeParse(email).success
      ) {
        recipients.add(email);
      }
    }

    if (recipients.size === 0) {
      return {
        sent: 0,
        failed: 0,
        recipients: 0,
        skipped: "no_email_addresses_found",
      };
    }

    /*
     * Get the elderly person's name for the subject and body.
     */
    const { data: elder } =
      await context.supabase
        .from("profiles")
        .select("full_name")
        .eq("id", alert.parent_id)
        .maybeSingle();

    const elderName =
      elder?.full_name ||
      alert.parent_name ||
      "Your family member";

    const timestamp = new Date(
      alert.created_at,
    ).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
      timeZoneName: "short",
    });

    /*
     * Create the Google Maps link when coordinates exist.
     */
    const mapsUrl =
      alert.latitude != null &&
        alert.longitude != null
        ? `https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`
        : null;

    const html = buildHtml({
      elderName,
      alertType: data.alertType,
      message:
        alert.message ??
        "Emergency assistance requested",
      timestamp,
      address: alert.address,
      mapsUrl,
    });

    const subject = `🚨 SOS from ${elderName}`;

    /*
     * Use the admin client for notification logging when available.
     */
    const logsClient = serviceKey
      ? (
        await import(
          "@/integrations/supabase/client.server"
        )
      ).supabaseAdmin
      : context.supabase;

    const logs = (logsClient as any).from(
      "notification_logs",
    );

    let sent = 0;
    let failed = 0;

    /*
     * Send each recipient separately.
     *
     * Each failed email is retried one time.
     * A failure for one recipient does not prevent delivery to others.
     */
    for (const recipient of recipients) {
      let attempt = 0;
      let success = false;
      let lastError: string | null = null;

      while (attempt < 2 && !success) {
        attempt += 1;

        try {
          await sendEmail(
            recipient,
            subject,
            html,
          );

          success = true;
          sent += 1;

          await logs
            .insert({
              alert_id: data.alertId,
              channel: "email",
              recipient,
              status: "sent",
              attempt,
            })
            .catch(() => { });
        } catch (error) {
          lastError =
            error instanceof Error
              ? error.message
              : String(error);
        }
      }

      if (!success) {
        failed += 1;

        await logs
          .insert({
            alert_id: data.alertId,
            channel: "email",
            recipient,
            status: "failed",
            error: lastError,
            attempt,
          })
          .catch(() => { });
      }
    }

    return {
      sent,
      failed,
      recipients: recipients.size,
    };
  });