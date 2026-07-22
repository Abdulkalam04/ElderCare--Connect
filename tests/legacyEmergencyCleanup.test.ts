import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const root = process.cwd();
describe("legacy emergency implementation cleanup", () => {
  it.each([
    "src/lib/api/emergencyDetection.functions.ts",
    "src/integrations/supabase/emergencyDetection.functions.ts",
    "supabase/functions/emergency-check",
  ])("removes obsolete path %s", (relativePath) => {
    expect(existsSync(resolve(root, relativePath))).toBe(false);
  });
  it("keeps only the current care-push Edge Function configuration", () => {
    const config = readFileSync(resolve(root, "supabase/config.toml"), "utf8");
    expect(config).toContain("[functions.care-push]");
    expect(config).not.toContain("[functions.emergency-check]");
    expect(config).not.toContain("functions/emergency-check");
  });
  it("keeps the SQL-based emergency detector migration", () => {
    const migration = readFileSync(
      resolve(root, "supabase/migrations/20260719160000_free_ai_emergency_detection.sql"),
      "utf8",
    ).toLowerCase();
    expect(migration).toContain("create table if not exists public.care_alerts");
    expect(migration).toContain("detect_care_issues");
    expect(migration).toContain("cron.schedule");
  });
});
