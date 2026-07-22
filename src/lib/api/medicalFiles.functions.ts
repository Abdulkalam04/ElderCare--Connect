import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const requestSchema = z.discriminatedUnion("documentKind", [
  z.object({
    documentKind: z.literal("health_record"),
    documentId: z.string().uuid(),
    action: z.enum(["view", "download"]),
  }),
  z.object({
    documentKind: z.literal("prescription"),
    documentId: z.string().uuid(),
    action: z.enum(["view", "download"]),
  }),
]);
function safeDownloadName(value: string | null | undefined, fallback: string): string {
  const cleaned = (value ?? "")
    .normalize("NFKC")
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 180);
  return cleaned || fallback;
}
function extensionForMime(mime: string | null | undefined): string {
  switch ((mime ?? "").toLowerCase()) {
    case "application/pdf":
      return "pdf";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "";
  }
}
export const createMedicalFileAccessUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(requestSchema)
  .handler(async ({ data, context }) => {
    let bucket: "health-records" | "prescriptions";
    let parentId: string;
    let filePath: string;
    let fileType: string | null;
    let displayName: string;
    if (data.documentKind === "health_record") {
      const { data: record, error } = await context.supabase
        .from("health_records")
        .select("id,parent_id,title,file_path,file_type")
        .eq("id", data.documentId)
        .single();
      if (error || !record?.file_path) {
        throw new Error("The health record was not found or is not accessible.");
      }
      bucket = "health-records";
      parentId = record.parent_id;
      filePath = record.file_path;
      fileType = record.file_type;
      displayName = record.title || "health-record";
    } else {
      const { data: prescription, error } = await context.supabase
        .from("consultation_prescriptions")
        .select("id,parent_id,file_path,file_type,file_name")
        .eq("id", data.documentId)
        .single();
      if (error || !prescription?.file_path) {
        throw new Error("The prescription was not found or is not accessible.");
      }
      bucket = "prescriptions";
      parentId = prescription.parent_id;
      filePath = prescription.file_path;
      fileType = prescription.file_type;
      displayName = prescription.file_name || "prescription";
    }
    const extension = extensionForMime(fileType);
    const safeName = safeDownloadName(displayName, data.documentKind.replace("_", "-"));
    const filename = safeName.includes(".") || !extension ? safeName : `${safeName}.${extension}`;
    const { data: signed, error: signedError } = await context.supabase.storage
      .from(bucket)
      .createSignedUrl(
        filePath,
        120,
        data.action === "download" ? { download: filename } : undefined,
      );
    if (signedError || !signed?.signedUrl) {
      throw new Error(signedError?.message ?? "Unable to create a secure medical-file link.");
    }
    const { error: auditError } = await context.supabase.from("medical_file_access_logs").insert({
      actor_id: context.userId,
      parent_id: parentId,
      document_kind: data.documentKind,
      document_id: data.documentId,
      action: data.action,
      file_path: filePath,
    });
    if (auditError) {
      console.error("Unable to record medical-file access audit:", auditError);
    }
    return {
      signedUrl: signed.signedUrl,
      expiresInSeconds: 120,
      filename,
    };
  });
