import { describe, expect, it } from "vitest";
import {
  MEDICAL_FILE_MAX_BYTES,
  safeMedicalFilename,
  validateMedicalFile,
} from "@/lib/medicalFiles";
function fileFromBytes(bytes: number[], name: string, type: string) {
  return new File([Uint8Array.from(bytes)], name, { type });
}
describe("safeMedicalFilename", () => {
  it("removes path separators and unsafe filename characters", () => {
    expect(safeMedicalFilename(" ../blood:*?report<>|.pdf ")).toBe("blood-report-.pdf");
  });
  it("uses the fallback when the filename contains no usable characters", () => {
    expect(safeMedicalFilename("...", "record.pdf")).toBe("record.pdf");
  });
});
describe("validateMedicalFile", () => {
  it("accepts a valid PDF signature", async () => {
    const file = fileFromBytes(
      [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37],
      "report.pdf",
      "application/pdf",
    );
    await expect(validateMedicalFile(file, { allowWebp: false })).resolves.toMatchObject({
      mime: "application/pdf",
      extension: "pdf",
      safeOriginalName: "report.pdf",
    });
  });
  it("accepts valid JPEG, PNG, and WebP health records", async () => {
    const jpeg = fileFromBytes([0xff, 0xd8, 0xff, 0xe0], "scan.jpg", "image/jpeg");
    const png = fileFromBytes(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      "scan.png",
      "image/png",
    );
    const webp = fileFromBytes(
      [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
      "scan.webp",
      "image/webp",
    );
    await expect(validateMedicalFile(jpeg, { allowWebp: true })).resolves.toMatchObject({
      mime: "image/jpeg",
    });
    await expect(validateMedicalFile(png, { allowWebp: true })).resolves.toMatchObject({
      mime: "image/png",
    });
    await expect(validateMedicalFile(webp, { allowWebp: true })).resolves.toMatchObject({
      mime: "image/webp",
    });
  });
  it("rejects an executable or text file renamed to PDF", async () => {
    const file = fileFromBytes([0x4d, 0x5a, 0x90, 0x00], "fake.pdf", "application/pdf");
    await expect(validateMedicalFile(file, { allowWebp: false })).rejects.toThrow(
      "not a supported PDF or image",
    );
  });
  it("rejects an extension that does not match the actual content", async () => {
    const file = fileFromBytes(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      "scan.jpg",
      "image/png",
    );
    await expect(validateMedicalFile(file, { allowWebp: true })).rejects.toThrow(
      "extension does not match",
    );
  });
  it("rejects a browser MIME type that conflicts with the actual content", async () => {
    const file = fileFromBytes([0x25, 0x50, 0x44, 0x46, 0x2d], "report.pdf", "image/png");
    await expect(validateMedicalFile(file, { allowWebp: false })).rejects.toThrow(
      "browser-reported file type",
    );
  });
  it("rejects WebP prescriptions", async () => {
    const file = fileFromBytes(
      [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
      "prescription.webp",
      "image/webp",
    );
    await expect(validateMedicalFile(file, { allowWebp: false })).rejects.toThrow(
      "WebP files are not accepted for prescriptions",
    );
  });
  it("rejects empty and oversized files", async () => {
    const empty = new File([], "empty.pdf", { type: "application/pdf" });
    const oversized = new File([new Uint8Array(11)], "large.pdf", {
      type: "application/pdf",
    });
    await expect(validateMedicalFile(empty, { allowWebp: false })).rejects.toThrow("empty");
    await expect(
      validateMedicalFile(oversized, { allowWebp: false, maxBytes: 10 }),
    ).rejects.toThrow("exceeds");
    expect(MEDICAL_FILE_MAX_BYTES).toBe(25 * 1024 * 1024);
  });
});
