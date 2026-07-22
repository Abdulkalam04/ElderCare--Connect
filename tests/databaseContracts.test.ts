import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const migrations = join(process.cwd(), "supabase", "migrations");
function readMigration(name: string) {
  return readFileSync(join(migrations, name), "utf8");
}
function compactSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}
describe("database workflow contracts", () => {
  it("enforces the caregiver lifecycle and assignment checks", () => {
    const sql = compactSql(readMigration("20260719130000_free_caregiver_booking_workflow.sql"));
    expect(sql).toContain("old.status = 'pending' and new.status in ('confirmed', 'cancelled')");
    expect(sql).toContain("old.status = 'confirmed' and new.status in ('assigned', 'cancelled')");
    expect(sql).toContain("invalid caregiver booking status change");
    expect(sql).toContain("new.trusted_caregiver_id is null");
  });
  it("enforces transport transitions, driver details, and cancellation reasons", () => {
    const sql = compactSql(
      readMigration("20260719140000_free_transport_coordination_workflow.sql"),
    );
    expect(sql).toContain("old_status = 'pending' and new_status = 'confirmed'");
    expect(sql).toContain("old_status = 'arrived' and new_status = 'completed'");
    expect(sql).toContain("invalid transport status change");
    expect(sql).toContain("cancellation reason");
    expect(sql).toContain("driver_phone");
    expect(sql).toContain("driver_vehicle");
  });
  it("enforces the video-consultation lifecycle and parent-owned prescriptions", () => {
    const sql = compactSql(readMigration("20260719150000_free_video_consultation_workflow.sql"));
    expect(sql).toContain("new_status = 'waiting'");
    expect(sql).toContain("new_status = 'in_progress'");
    expect(sql).toContain("old_status = 'in_progress' and new_status = 'completed'");
    expect(sql).toContain('create policy "insert prescriptions (parent only)"');
    expect(sql).toContain("validate_consultation_prescription");
  });
});
describe("medical data security contracts", () => {
  const sql = compactSql(readMigration("20260719200000_medical_file_security.sql"));
  it("keeps both medical storage buckets private", () => {
    expect(sql).toContain("'health-records'");
    expect(sql).toContain("'prescriptions'");
    expect(sql).toContain("insert into storage.buckets");
    expect(sql).toContain("public = excluded.public");
  });
  it("makes stored medical objects immutable", () => {
    expect(sql).toContain("health-record ownership and stored file are immutable");
    expect(sql).toContain("prescription ownership and stored file are immutable");
  });
  it("allows linked-family reading but parent-only creation and deletion", () => {
    expect(sql).toContain('create policy "view health records (parent+child)"');
    expect(sql).toContain('create policy "insert health records (parent only)"');
    expect(sql).toContain('create policy "delete health records (parent only)"');
    expect(sql).toContain('create policy "view prescriptions (parent+child)"');
    expect(sql).toContain('create policy "insert prescriptions (parent only)"');
    expect(sql).toContain('create policy "delete prescriptions (parent only)"');
  });
  it("records secure file access in an audited RLS table", () => {
    expect(sql).toContain("create table if not exists public.medical_file_access_logs");
    expect(sql).toContain("alter table public.medical_file_access_logs enable row level security");
    expect(sql).toContain('create policy "parents view medical file audit"');
  });
});
describe("background safety and push contracts", () => {
  it("schedules AI care-issue detection every 15 minutes", () => {
    const sql = compactSql(readMigration("20260719160000_free_ai_emergency_detection.sql"));
    expect(sql).toContain("detect_care_issues");
    expect(sql).toContain("*/15 * * * *");
    expect(sql).toContain("last_app_activity_at");
    expect(sql).toContain("care_alerts");
  });
  it("queues and schedules unified background push delivery", () => {
    const sql = compactSql(readMigration("20260719190000_complete_free_web_push.sql"));
    expect(sql).toContain("care_push_queue");
    expect(sql).toContain("queue_parent_notification_web_push");
    expect(sql).toContain("invoke_care_push_delivery");
    expect(sql).toContain("* * * * *");
  });
});
