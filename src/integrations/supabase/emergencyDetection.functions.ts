import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CareIssueDetectionResult = {
  missed_medicine_alerts: number;
  no_checkin_alerts: number;
  no_activity_alerts: number;
};

/**
 * Runs the same free, deterministic care checks that are scheduled by pg_cron.
 *
 * This detects:
 * - missed medicine schedules,
 * - a missing daily wellbeing check-in after the configured cutoff, and
 * - no activity inside ElderCare Connect for more than 24 hours.
 *
 * It intentionally does not claim to measure activity across the entire phone;
 * a normal web application does not have permission to do that.
 */
export const checkEmergencies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("detect_care_issues");

    if (error) {
      throw new Error(`Care issue detection failed: ${error.message}`);
    }

    const result = data?.[0] as CareIssueDetectionResult | undefined;

    return (
      result ?? {
        missed_medicine_alerts: 0,
        no_checkin_alerts: 0,
        no_activity_alerts: 0,
      }
    );
  });
