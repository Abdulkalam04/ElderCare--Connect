// Client-side helpers for validating and naming medical file uploads.
// Used before uploading to Supabase Storage (health-records / prescriptions buckets).

export type MedicalFileMime =
  | "application/pdf"
  | "image/jpeg"
  | "image/png"
  | "image/webp";

export const MEDICAL_FILE_MAX_BYTES = 26_214_400; // 25 MB

export const HEALTH_RECORD_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

const MIME_BY_EXTENSION: Record<string, MedicalFileMime> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const EXTENSION_BY_MIME: Record<MedicalFileMime, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extensionOf(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function normaliseBrowserMime(mime: string): MedicalFileMime | null {
  const normalised = mime.toLowerCase().trim();
  if (normalised === "image/jpg") return "image/jpeg";
  if (
    normalised === "application/pdf" ||
    normalised === "image/jpeg" ||
    normalised === "image/png" ||
    normalised === "image/webp"
  ) {
    return normalised as MedicalFileMime;
  }
  return null;
}

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}

async function detectMimeFromMagicBytes(file: File): Promise<MedicalFileMime | null> {
  const buffer = await file.slice(0, 16).arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // PDF: %PDF
  if (hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46])) return "application/pdf";

  // JPEG: FF D8 FF
  if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";

  // PNG: \x89PNG\r\n\x1a\n
  if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";

  // WebP: RIFF????WEBP
  const isWebp =
    hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;

  return isWebp ? "image/webp" : null;
}

export function safeMedicalFilename(value: string, fallback = "medical-document"): string {
  const cleaned = value
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

export type ValidatedMedicalFile = {
  file: File;
  mime: MedicalFileMime;
  extension: string;
  safeOriginalName: string;
};

export async function validateMedicalFile(
  file: File,
  options: {
    allowWebp: boolean;
    maxBytes?: number;
  },
): Promise<ValidatedMedicalFile> {
  const maxBytes = options.maxBytes ?? MEDICAL_FILE_MAX_BYTES;

  if (file.size <= 0) {
    throw new Error("The selected file is empty.");
  }

  if (file.size > maxBytes) {
    throw new Error(`File exceeds the ${Math.floor(maxBytes / 1024 / 1024)} MB limit.`);
  }

  const extension = extensionOf(file.name);
  const extensionMime = MIME_BY_EXTENSION[extension];
  const browserMime = normaliseBrowserMime(file.type);
  const detectedMime = await detectMimeFromMagicBytes(file);

  if (!extensionMime || !detectedMime) {
    throw new Error("The file content is not a supported PDF or image document.");
  }

  if (!options.allowWebp && detectedMime === "image/webp") {
    throw new Error("WebP files are not accepted for prescriptions. Use PDF, JPG, or PNG.");
  }

  if (extensionMime !== detectedMime) {
    throw new Error("The file extension does not match the actual file content.");
  }

  if (browserMime && browserMime !== detectedMime) {
    throw new Error("The browser-reported file type does not match the actual file content.");
  }

  return {
    file,
    mime: detectedMime,
    extension: EXTENSION_BY_MIME[detectedMime],
    safeOriginalName: safeMedicalFilename(file.name, `medical-document.${extension}`),
  };
}
