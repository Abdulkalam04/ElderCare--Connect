import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const root = process.cwd();
function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}
describe("AI Companion integration", () => {
  it("uses one active Companion server implementation", () => {
    expect(existsSync(resolve(root, "src/lib/api/companion.functions.ts"))).toBe(true);
    expect(existsSync(resolve(root, "src/integrations/supabase/companion.functions.ts"))).toBe(
      false,
    );
  });
  it("contains free local care-data answers and Gemini fallback", () => {
    const companion = source("src/lib/api/companion.functions.ts");
    expect(companion).toContain('source: "local"');
    expect(companion).toContain('source: "local_fallback"');
    expect(companion).toContain("medicine_schedule");
    expect(companion).toContain("video_consultation");
    expect(companion).toContain("emergency_contact");
    expect(companion).toContain("daily_plan");
    expect(companion).toContain("raise_companion_safety_alert");
  });
  it("exposes the Companion voice and privacy controls in Settings", () => {
    const settings = source("src/routes/_authenticated/settings.tsx");
    expect(settings).toContain("companion_auto_read_responses");
    expect(settings).toContain("companion_emergency_escalation_enabled");
    expect(settings).toContain("Automatically read Companion replies aloud");
    expect(settings).toContain("Alert linked family for urgent Companion messages");
  });
});
