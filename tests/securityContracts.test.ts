import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
function readProjectFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}
describe("authenticated server boundaries", () => {
  it("requires authentication and a parent role before saving a health-risk screening", () => {
    const source = readProjectFile("src/lib/api/healthRisk.functions.ts");
    expect(source).toContain(".middleware([requireSupabaseAuth])");
    expect(source).toContain('profile?.role !== "parent"');
    expect(source).toContain("Only the care-recipient account can run a health risk check");
  });
  it("requires authentication for secure medical-file links and records access", () => {
    const source = readProjectFile("src/lib/api/medicalFiles.functions.ts");
    expect(source).toContain(".middleware([requireSupabaseAuth])");
    expect(source).toContain("medical_file_access_logs");
    expect(source).toContain("createSignedUrl");
    expect(source).toContain("120");
  });
  it("permits only the SOS owner to send family and caregiver emails", () => {
    const source = readProjectFile("src/lib/api/sosNotify.functions.ts");
    expect(source).toContain(".middleware([requireSupabaseAuth])");
    expect(source).toContain("context.userId !== alert.parent_id");
    expect(source).toContain("trusted_caregivers");
    expect(source).toContain("Only the care-recipient account can send SOS notifications");
  });
});
describe("background push security", () => {
  it("protects the Edge Function with the private cron secret", () => {
    const source = readProjectFile("supabase/functions/care-push/index.ts");
    expect(source).toContain('getRequiredEnv("CARE_PUSH_CRON_SECRET")');
    expect(source).toContain('request.headers.get("x-care-push-secret")');
    expect(source).toContain('error: "Unauthorized."');
  });
  it("removes expired browser subscriptions after 404 or 410 responses", () => {
    const source = readProjectFile("supabase/functions/care-push/index.ts");
    expect(source).toContain("statusCode === 404 || statusCode === 410");
    expect(source).toContain('from("push_subscriptions")');
    expect(source).toContain('status: "stale"');
  });
  it("opens the notification-specific route from the service worker", () => {
    const source = readProjectFile("public/sw.js");
    expect(source).toContain('"notificationclick"');
    expect(source).toContain("event.notification.data.url");
    expect(source).toContain("self.clients.openWindow");
  });
});
