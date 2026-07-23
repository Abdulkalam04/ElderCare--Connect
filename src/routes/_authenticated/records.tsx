import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO, subDays } from "date-fns";
import type { ChangeEvent, ElementType } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Files,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  LockKeyhole,
  Pill,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  TestTube2,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/datetime-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useActiveParent, useCurrentUser } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { createMedicalFileAccessUrl } from "@/lib/api/medicalFiles.functions";
import {
  HEALTH_RECORD_ACCEPT,
  MEDICAL_FILE_MAX_BYTES,
  safeMedicalFilename,
  validateMedicalFile,
} from "@/lib/medicalFiles";

export const Route = createFileRoute("/_authenticated/records")({
  ssr: false,
  component: RecordsPage,
});

const BUCKET = "health-records";

type Category = "all" | "blood_test" | "prescription" | "ecg";
type RecordCategory = Exclude<Category, "all">;

type CategoryMeta = {
  label: string;
  description: string;
  Icon: ElementType;
  iconBackground: string;
  iconColor: string;
  badgeClass: string;
};

const categoryMeta: Record<RecordCategory, CategoryMeta> = {
  blood_test: {
    label: "Blood Test",
    description: "Laboratory and pathology reports",
    Icon: TestTube2,
    iconBackground: "bg-[#f7e9e7]",
    iconColor: "text-[#a7524c]",
    badgeClass: "border-[#ead1ce] bg-[#fbf2f1] text-[#9d4d48]",
  },
  prescription: {
    label: "Prescription",
    description: "Medicine and treatment instructions",
    Icon: Pill,
    iconBackground: "bg-[#e7f0f5]",
    iconColor: "text-[#476e8a]",
    badgeClass: "border-[#cfdee8] bg-[#f0f6f9] text-[#416985]",
  },
  ecg: {
    label: "ECG",
    description: "Cardiac test and rhythm records",
    Icon: Activity,
    iconBackground: "bg-[#e6f2ed]",
    iconColor: "text-[#1d7365]",
    badgeClass: "border-[#cce2da] bg-[#eff8f4] text-[#176b5f]",
  },
};

type RecordRow = {
  id: string;
  parent_id: string;
  title: string | null;
  record_type: string;
  category: RecordCategory;
  record_date: string;
  doctor_name: string | null;
  notes: string | null;
  description: string | null;
  file_url: string | null;
  file_path: string | null;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
};

type UploadForm = {
  title: string;
  category: RecordCategory | "";
  record_date: string;
  doctor_name: string;
  notes: string;
  file: File | null;
};

function emptyForm(): UploadForm {
  return {
    title: "",
    category: "",
    record_date: format(new Date(), "yyyy-MM-dd"),
    doctor_name: "",
    notes: "",
    file: null,
  };
}

function formatFileSize(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function sortRecords(rows: RecordRow[]): RecordRow[] {
  return [...rows].sort((first, second) => {
    const dateComparison = second.record_date.localeCompare(first.record_date);
    if (dateComparison !== 0) return dateComparison;

    return (
      new Date(second.created_at).getTime() -
      new Date(first.created_at).getTime()
    );
  });
}

function RecordsPage() {
  const { data: user } = useCurrentUser();
  const { activeParentId, activeParent, isChildView } = useActiveParent();
  const queryClient = useQueryClient();
  const medicalFileAccess = useServerFn(createMedicalFileAccessUrl);

  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [search, setSearch] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<UploadForm>(() => emptyForm());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const recordsQuery = useQuery({
    queryKey: ["records", activeParentId],
    enabled: Boolean(activeParentId),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("health_records")
        .select("*")
        .eq("parent_id", activeParentId!)
        .order("record_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as RecordRow[];
    },
  });

  const records = useMemo(() => recordsQuery.data ?? [], [recordsQuery.data]);

  useEffect(() => {
    if (!activeParentId) return;

    const channel = supabase
      .channel(`health-records-${activeParentId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "health_records",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["records", activeParentId],
          });
          void queryClient.invalidateQueries({
            queryKey: ["recentReports", activeParentId],
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeParentId, queryClient]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return records.filter((record) => {
      if (activeCategory !== "all" && record.category !== activeCategory) {
        return false;
      }

      if (!term) return true;

      return [
        record.title,
        record.doctor_name,
        record.notes,
        record.description,
        categoryMeta[record.category]?.label,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    });
  }, [activeCategory, records, search]);

  const counts = useMemo(
    () =>
      records.reduce<Record<RecordCategory, number>>(
        (currentCounts, record) => {
          currentCounts[record.category] =
            (currentCounts[record.category] ?? 0) + 1;
          return currentCounts;
        },
        { blood_test: 0, prescription: 0, ecg: 0 },
      ),
    [records],
  );

  const totalStorageBytes = useMemo(
    () =>
      records.reduce(
        (total, record) => total + Math.max(record.file_size ?? 0, 0),
        0,
      ),
    [records],
  );

  const recentlyAddedCount = useMemo(() => {
    const recentBoundary = subDays(new Date(), 30).getTime();

    return records.filter(
      (record) => new Date(record.created_at).getTime() >= recentBoundary,
    ).length;
  }, [records]);

  const latestRecord = records[0] ?? null;

  function resetForm() {
    setForm(emptyForm());
    setProgress(0);
    setUploading(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function validateUpload(): string | null {
    if (!form.category) return "Please select a category.";
    if (!form.record_date) return "Please select the record date.";

    if (form.record_date > format(new Date(), "yyyy-MM-dd")) {
      return "A health record date cannot be in the future.";
    }

    if (!form.file) return "Please choose a file to upload.";
    if (form.file.size === 0) return "The selected file is empty.";

    if (form.file.size > MEDICAL_FILE_MAX_BYTES) {
      return "File exceeds the 25 MB limit.";
    }

    return null;
  }

  const upload = useMutation({
    mutationFn: async () => {
      if (isChildView) {
        throw new Error("You do not have permission to modify health records.");
      }

      if (!activeParentId || !user) {
        throw new Error("Session error. Please refresh and try again.");
      }

      const validationError = validateUpload();
      if (validationError) throw new Error(validationError);

      const file = form.file!;
      const validated = await validateMedicalFile(file, { allowWebp: true });
      const key = `${activeParentId}/${crypto.randomUUID()}.${validated.extension}`;

      setUploading(true);
      setProgress(15);

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(key, file, {
          contentType: validated.mime,
          upsert: false,
          cacheControl: "0",
        });

      if (uploadError) {
        const message = uploadError.message || String(uploadError);
        const lowered = message.toLowerCase();

        if (lowered.includes("bucket") || lowered.includes("not found")) {
          throw new Error(
            "The health-records storage bucket was not found. Apply the Supabase storage migrations first.",
          );
        }

        if (
          lowered.includes("policy") ||
          lowered.includes("rls") ||
          lowered.includes("unauthorized")
        ) {
          throw new Error(`Upload permission denied: ${message}`);
        }

        throw new Error(`Storage upload failed: ${message}`);
      }

      setProgress(70);

      const title = safeMedicalFilename(
        form.title.trim() ||
        validated.safeOriginalName.replace(/\.[^.]+$/, ""),
        "health-record",
      );

      const { data, error: databaseError } = await supabase
        .from("health_records")
        .insert({
          parent_id: activeParentId,
          uploaded_by: user.id,
          title,
          record_type: form.category,
          category: form.category as RecordCategory,
          record_date: form.record_date,
          doctor_name: form.doctor_name.trim() || null,
          notes: form.notes.trim() || null,
          file_path: key,
          file_type: validated.mime,
          file_size: file.size,
        })
        .select("*")
        .single();

      if (databaseError) {
        await supabase.storage.from(BUCKET).remove([key]);
        throw new Error(`Database save failed: ${databaseError.message}`);
      }

      setProgress(100);
      return data as RecordRow;
    },
    onSuccess: (newRecord) => {
      queryClient.setQueryData<RecordRow[]>(
        ["records", activeParentId],
        (current = []) =>
          sortRecords([
            newRecord,
            ...current.filter((record) => record.id !== newRecord.id),
          ]),
      );

      void queryClient.invalidateQueries({
        queryKey: ["recentReports", activeParentId],
      });

      toast.success("Health record uploaded successfully.");
      setOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      setUploading(false);
      setProgress(0);
      toast.error(error.message);
    },
  });

  const remove = useMutation({
    mutationFn: async (record: RecordRow) => {
      if (isChildView) {
        throw new Error("You do not have permission to modify health records.");
      }

      if (!activeParentId) {
        throw new Error("No active parent profile selected.");
      }

      const { data: deletedRow, error: databaseError } = await supabase
        .from("health_records")
        .delete()
        .eq("id", record.id)
        .eq("parent_id", activeParentId)
        .select("id")
        .maybeSingle();

      if (databaseError) throw new Error(databaseError.message);

      if (!deletedRow) {
        throw new Error(
          "The record was not deleted. It may already be removed or blocked by permissions.",
        );
      }

      let storageWarning: string | null = null;

      if (record.file_path) {
        const { error: storageError } = await supabase.storage
          .from(BUCKET)
          .remove([record.file_path]);

        if (storageError) storageWarning = storageError.message;
      }

      return { id: record.id, storageWarning };
    },
    onSuccess: ({ id, storageWarning }) => {
      queryClient.setQueryData<RecordRow[]>(
        ["records", activeParentId],
        (current = []) => current.filter((record) => record.id !== id),
      );

      void queryClient.invalidateQueries({
        queryKey: ["recentReports", activeParentId],
      });

      if (storageWarning) {
        toast.warning(
          "Record deleted, but its stored file could not be cleaned up.",
        );
      } else {
        toast.success("Health record deleted.");
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      if (isChildView) {
        throw new Error("You do not have permission to modify health records.");
      }

      if (!activeParentId) {
        throw new Error("No active parent profile selected.");
      }

      const { data: existing, error: fetchError } = await supabase
        .from("health_records")
        .select("id, file_path")
        .eq("parent_id", activeParentId);

      if (fetchError) throw new Error(fetchError.message);

      if (!existing || existing.length === 0) {
        return { deletedCount: 0, storageCleanupFailed: false };
      }

      const { data: deleted, error: databaseError } = await supabase
        .from("health_records")
        .delete()
        .eq("parent_id", activeParentId)
        .select("id");

      if (databaseError) throw new Error(databaseError.message);

      if (!deleted || deleted.length === 0) {
        throw new Error(
          "No records were deleted. Please check your database permissions.",
        );
      }

      const filePaths = existing
        .map((record) => record.file_path)
        .filter((path): path is string => Boolean(path));

      let storageCleanupFailed = false;

      for (let index = 0; index < filePaths.length; index += 100) {
        const { error: storageError } = await supabase.storage
          .from(BUCKET)
          .remove(filePaths.slice(index, index + 100));

        if (storageError) storageCleanupFailed = true;
      }

      return {
        deletedCount: deleted.length,
        storageCleanupFailed,
      };
    },
    onSuccess: ({ deletedCount, storageCleanupFailed }) => {
      queryClient.setQueryData<RecordRow[]>(["records", activeParentId], []);

      void queryClient.invalidateQueries({
        queryKey: ["recentReports", activeParentId],
      });

      if (storageCleanupFailed) {
        toast.warning(
          `${deletedCount} record${deletedCount === 1 ? "" : "s"} deleted, but some stored files could not be cleaned up.`,
        );
      } else {
        toast.success(
          deletedCount === 1
            ? "1 health record deleted."
            : `${deletedCount} health records deleted.`,
        );
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function createFileUrl(
    record: RecordRow,
    download = false,
  ): Promise<string> {
    if (!record.file_path) {
      throw new Error(
        "This is a legacy record without a private storage file. Re-upload the document to open it securely.",
      );
    }

    const result = await medicalFileAccess({
      data: {
        documentKind: "health_record",
        documentId: record.id,
        action: download ? "download" : "view",
      },
    });

    return result.signedUrl;
  }

  async function previewFile(record: RecordRow) {
    const previewWindow = window.open("about:blank", "_blank");

    if (!previewWindow) {
      toast.error(
        "The browser blocked the preview window. Allow popups and try again.",
      );
      return;
    }

    previewWindow.document.title = "Opening health record…";
    previewWindow.document.body.innerHTML =
      '<p style="font-family:system-ui;padding:24px">Opening health record…</p>';

    try {
      const url = await createFileUrl(record);
      previewWindow.opener = null;
      previewWindow.location.replace(url);
    } catch (error) {
      previewWindow.close();
      toast.error(
        error instanceof Error ? error.message : "Unable to open file.",
      );
    }
  }

  async function downloadFile(record: RecordRow) {
    try {
      const url = await createFileUrl(record, true);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.rel = "noopener noreferrer";
      anchor.download = safeMedicalFilename(record.title || "health-record");
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to download file.",
      );
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;

    if (!file) {
      setForm((current) => ({ ...current, file: null }));
      return;
    }

    try {
      const validated = await validateMedicalFile(file, { allowWebp: true });

      setForm((current) => ({
        ...current,
        file,
        title:
          current.title || validated.safeOriginalName.replace(/\.[^.]+$/, ""),
      }));
    } catch (error) {
      input.value = "";
      setForm((current) => ({ ...current, file: null }));
      toast.error(
        error instanceof Error
          ? error.message
          : "The selected file is not valid.",
      );
    }
  }

  const tabs: Array<{ value: Category; label: string; count: number }> = [
    { value: "all", label: "All records", count: records.length },
    { value: "blood_test", label: "Blood tests", count: counts.blood_test },
    {
      value: "prescription",
      label: "Prescriptions",
      count: counts.prescription,
    },
    { value: "ecg", label: "ECG", count: counts.ecg },
  ];

  return (
    <AppShell>
      <div className="space-y-6 pb-10">
        <section className="overflow-hidden rounded-[1.75rem] border border-[#dce8e4] bg-white shadow-[0_20px_55px_-42px_rgba(22,55,60,0.45)]">
          <div className="flex flex-col gap-6 px-5 py-6 sm:px-7 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-7">
            <div className="max-w-2xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-[#e8f3ef] px-3 py-1.5 text-xs font-bold text-[#176f69]">
                  <LockKeyhole className="size-3.5" />
                  Secure medical archive
                </span>

                {isChildView && (
                  <span className="rounded-full border border-[#d8e5e1] bg-[#f7faf9] px-3 py-1.5 text-xs font-semibold text-[#647b80]">
                    Read-only family view
                  </span>
                )}
              </div>

              <h1 className="text-3xl font-bold tracking-[-0.04em] text-[#122f35] sm:text-4xl">
                Health Records
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-[#667d82] sm:text-base">
                Store, organise and securely access medical documents for{" "}
                <span className="font-semibold text-[#294b50]">
                  {activeParent?.full_name ?? "the selected profile"}
                </span>
                .
              </p>
            </div>

            {!isChildView && activeParentId && (
              <div className="flex flex-col gap-3 sm:flex-row">
                {records.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={clearAll.isPending}
                    className="h-11 rounded-xl border-[#e0cbc7] bg-white px-5 font-semibold text-[#a44f49] hover:border-[#dcb9b4] hover:bg-[#fff6f5] hover:text-[#923f3a]"
                    onClick={() => {
                      const confirmed = window.confirm(
                        "Delete every health record and attached file for this profile? This action cannot be undone.",
                      );

                      if (confirmed) {
                        clearAll.mutate();
                      }
                    }}
                  >
                    {clearAll.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                    {clearAll.isPending ? "Deleting…" : "Delete all"}
                  </Button>
                )}

                <Dialog
                  open={open}
                  onOpenChange={(nextOpen) => {
                    if (upload.isPending && !nextOpen) return;
                    setOpen(nextOpen);
                    if (!nextOpen) resetForm();
                  }}
                >
                  <DialogTrigger asChild>
                    <Button className="h-11 rounded-xl bg-[#0d6665] px-5 font-semibold text-white shadow-[0_14px_30px_-18px_rgba(13,102,101,0.9)] hover:bg-[#0a5958]">
                      <Plus className="size-4" />
                      Upload record
                    </Button>
                  </DialogTrigger>

                  <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[1.5rem] border-[#dce7e3] p-0 sm:max-w-xl">
                    <DialogHeader className="border-b border-[#e3ece9] px-6 py-5 text-left">
                      <div className="flex items-start gap-4">
                        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e5f1ed] text-[#176f69]">
                          <Upload className="size-5" />
                        </span>

                        <div>
                          <DialogTitle className="text-xl font-bold tracking-[-0.03em] text-[#17343a]">
                            Upload health record
                          </DialogTitle>

                          <DialogDescription className="mt-1.5 leading-6 text-[#71858a]">
                            Add a private medical document to the selected
                            profile&apos;s secure archive.
                          </DialogDescription>
                        </div>
                      </div>
                    </DialogHeader>

                    <div className="space-y-5 px-6 py-5">
                      <div className="space-y-2">
                        <Label
                          htmlFor="record-category"
                          className="font-semibold text-[#29484e]"
                        >
                          Category <span className="text-[#a74e49]">*</span>
                        </Label>

                        <Select
                          value={form.category}
                          onValueChange={(value) =>
                            setForm((current) => ({
                              ...current,
                              category: value as RecordCategory,
                            }))
                          }
                          disabled={upload.isPending}
                        >
                          <SelectTrigger
                            id="record-category"
                            className="h-11 rounded-xl border-[#d8e4e0] bg-white"
                          >
                            <SelectValue placeholder="Select a record category" />
                          </SelectTrigger>

                          <SelectContent>
                            <SelectItem value="blood_test">
                              Blood Test
                            </SelectItem>
                            <SelectItem value="prescription">
                              Prescription
                            </SelectItem>
                            <SelectItem value="ecg">ECG</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="record-title"
                          className="font-semibold text-[#29484e]"
                        >
                          Document title{" "}
                          <span className="font-normal text-[#849599]">
                            (optional)
                          </span>
                        </Label>

                        <Input
                          id="record-title"
                          value={form.title}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                          placeholder="e.g. Complete blood count — June 2026"
                          maxLength={120}
                          disabled={upload.isPending}
                          className="h-11 rounded-xl border-[#d8e4e0] bg-white"
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label
                            htmlFor="record-date"
                            className="font-semibold text-[#29484e]"
                          >
                            Record date{" "}
                            <span className="text-[#a74e49]">*</span>
                          </Label>

                          <DateInput
                            id="record-date"
                            value={form.record_date}
                            onChange={(value) =>
                              setForm((current) => ({
                                ...current,
                                record_date: value,
                              }))
                            }
                            placeholder="YYYY-MM-DD"
                            disabled={upload.isPending}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label
                            htmlFor="record-doctor"
                            className="font-semibold text-[#29484e]"
                          >
                            Doctor or clinic
                          </Label>

                          <Input
                            id="record-doctor"
                            value={form.doctor_name}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                doctor_name: event.target.value,
                              }))
                            }
                            placeholder="e.g. Dr. Sharma"
                            maxLength={120}
                            disabled={upload.isPending}
                            className="h-11 rounded-xl border-[#d8e4e0] bg-white"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <Label
                            htmlFor="record-notes"
                            className="font-semibold text-[#29484e]"
                          >
                            Notes
                          </Label>

                          <span className="text-xs text-[#849599]">
                            {form.notes.length}/1000
                          </span>
                        </div>

                        <Textarea
                          id="record-notes"
                          value={form.notes}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              notes: event.target.value,
                            }))
                          }
                          placeholder="Add a short summary, key result or follow-up instruction"
                          rows={3}
                          maxLength={1000}
                          disabled={upload.isPending}
                          className="min-h-24 rounded-xl border-[#d8e4e0] bg-white"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="record-file"
                          className="font-semibold text-[#29484e]"
                        >
                          Medical file <span className="text-[#a74e49]">*</span>
                        </Label>

                        <label
                          htmlFor="record-file"
                          className={`flex min-h-40 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#cbdcd6] bg-[#f8fbfa] px-6 py-7 text-center transition-colors ${upload.isPending
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer hover:border-[#8eb8ad] hover:bg-[#f1f7f4]"
                            }`}
                        >
                          <span className="grid size-11 place-items-center rounded-xl bg-white text-[#176f69] shadow-sm">
                            {form.file ? (
                              <FileCheck2 className="size-5" />
                            ) : (
                              <Upload className="size-5" />
                            )}
                          </span>

                          {form.file ? (
                            <>
                              <span className="mt-4 max-w-full break-all text-sm font-bold text-[#29484e]">
                                {form.file.name}
                              </span>

                              <span className="mt-1 text-xs text-[#72868a]">
                                {formatFileSize(form.file.size)} · Click to
                                replace
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="mt-4 text-sm font-bold text-[#29484e]">
                                Choose a document from your device
                              </span>

                              <span className="mt-1 text-xs leading-5 text-[#72868a]">
                                PDF, JPG, PNG or WebP · Maximum 25 MB
                              </span>
                            </>
                          )}

                          <Input
                            id="record-file"
                            ref={fileInputRef}
                            type="file"
                            accept={HEALTH_RECORD_ACCEPT}
                            className="sr-only"
                            onChange={handleFileChange}
                            disabled={upload.isPending}
                          />
                        </label>
                      </div>

                      {uploading && (
                        <div className="rounded-xl border border-[#dce8e4] bg-[#f7faf9] p-4">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-[#29484e]">
                              <Loader2 className="size-4 animate-spin text-[#0d7774]" />
                              Uploading securely
                            </div>

                            <span className="text-xs font-bold text-[#647b80]">
                              {progress}%
                            </span>
                          </div>

                          <Progress value={progress} className="mt-3 h-2" />
                        </div>
                      )}
                    </div>

                    <DialogFooter className="gap-3 border-t border-[#e4ece9] px-6 py-5 sm:justify-between">
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={upload.isPending}
                        className="h-11 rounded-xl text-[#5f777b] hover:bg-[#f1f5f3]"
                        onClick={() => setOpen(false)}
                      >
                        Cancel
                      </Button>

                      <Button
                        type="button"
                        disabled={upload.isPending}
                        className="h-11 rounded-xl bg-[#0d6665] px-6 text-white hover:bg-[#0a5958]"
                        onClick={() => upload.mutate()}
                      >
                        {upload.isPending ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Uploading…
                          </>
                        ) : (
                          <>
                            <Upload className="size-4" />
                            Upload record
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>

          <div className="grid border-t border-[#e2ece9] bg-[#f7faf9] sm:grid-cols-2 lg:grid-cols-4">
            <SummaryMetric
              icon={Files}
              label="Total records"
              value={String(records.length)}
              detail="Documents in the archive"
              iconBackground="bg-[#e5f1ed]"
              iconColor="text-[#19705f]"
            />

            <SummaryMetric
              icon={CalendarDays}
              label="Added recently"
              value={String(recentlyAddedCount)}
              detail="Uploaded in the last 30 days"
              iconBackground="bg-[#e8eef5]"
              iconColor="text-[#4e6d8b]"
            />

            <SummaryMetric
              icon={HardDrive}
              label="Secure storage"
              value={formatFileSize(totalStorageBytes) ?? "0 B"}
              detail="Attached medical files"
              iconBackground="bg-[#f5eadf]"
              iconColor="text-[#9a653a]"
            />

            <SummaryMetric
              icon={FileCheck2}
              label="Latest record"
              value={
                latestRecord
                  ? format(parseISO(latestRecord.record_date), "MMM d")
                  : "No data"
              }
              detail={
                latestRecord
                  ? latestRecord.title ||
                  categoryMeta[latestRecord.category]?.label ||
                  "Medical record"
                  : "Upload the first document"
              }
              iconBackground="bg-[#e7f0f4]"
              iconColor="text-[#426b87]"
              last
            />
          </div>
        </section>

        {isChildView && (
          <section className="flex items-start gap-4 rounded-2xl border border-[#ead9b7] bg-[#fffaf0] p-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f6ead2] text-[#9b6b2f]">
              <ShieldAlert className="size-5" />
            </span>

            <div>
              <h2 className="text-sm font-bold text-[#574832]">
                Read-only access
              </h2>

              <p className="mt-1 text-sm leading-6 text-[#7c6c56]">
                You can view and download {activeParent?.full_name}&apos;s
                documents, but only the profile owner can upload or remove
                records.
              </p>
            </div>
          </section>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(Object.entries(categoryMeta) as Array<
            [RecordCategory, CategoryMeta]
          >).map(([category, meta]) => {
            const Icon = meta.Icon;
            const count = counts[category];

            return (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`group rounded-2xl border bg-white p-5 text-left shadow-[0_16px_38px_-32px_rgba(16,49,54,0.4)] transition duration-200 hover:-translate-y-0.5 hover:border-[#b8d1c9] ${activeCategory === category
                    ? "border-[#8fb9ae] ring-2 ring-[#0d7774]/10"
                    : "border-[#dce7e3]"
                  }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <span
                    className={`grid size-11 place-items-center rounded-xl ${meta.iconBackground} ${meta.iconColor}`}
                  >
                    <Icon className="size-5" />
                  </span>

                  <span className="rounded-full bg-[#f3f7f5] px-3 py-1 text-xs font-bold text-[#5f777b]">
                    {count} {count === 1 ? "record" : "records"}
                  </span>
                </div>

                <h2 className="mt-5 text-base font-bold tracking-[-0.02em] text-[#1c3b41]">
                  {meta.label}
                </h2>

                <p className="mt-1 text-sm leading-6 text-[#71868a]">
                  {meta.description}
                </p>
              </button>
            );
          })}
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-[#dce8e4] bg-white shadow-[0_18px_50px_-40px_rgba(18,49,54,0.45)]">
          <div className="border-b border-[#e3ece9] px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-bold tracking-[-0.025em] text-[#17343a]">
                  Medical documents
                </h2>

                <p className="mt-1 text-sm text-[#72868a]">
                  Search, preview and download files from the secure archive.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative sm:w-80">
                  <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#849699]" />

                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search records, doctors or notes"
                    className="h-11 rounded-xl border-[#d8e4e0] bg-[#fbfdfc] pl-10"
                  />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  disabled={recordsQuery.isFetching}
                  className="h-11 rounded-xl border-[#d8e4e0] bg-white px-4 text-[#49666b] hover:bg-[#f5f9f7]"
                  onClick={() => void recordsQuery.refetch()}
                >
                  <RefreshCw
                    className={`size-4 ${recordsQuery.isFetching ? "animate-spin" : ""}`}
                  />
                  Refresh
                </Button>
              </div>
            </div>

            <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
              {tabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActiveCategory(tab.value)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${activeCategory === tab.value
                      ? "bg-[#0d6665] text-white shadow-[0_10px_25px_-17px_rgba(13,102,101,0.9)]"
                      : "border border-[#dbe6e2] bg-[#f9fbfa] text-[#5f777b] hover:bg-[#f0f6f3]"
                    }`}
                >
                  {tab.label}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${activeCategory === tab.value
                        ? "bg-white/15 text-white"
                        : "bg-white text-[#687f83]"
                      }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {recordsQuery.isLoading ? (
            <LoadingRecords />
          ) : recordsQuery.isError ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-[#fae8e6] text-[#a94f49]">
                <ShieldAlert className="size-6" />
              </span>

              <h3 className="mt-5 text-lg font-bold text-[#1c3b41]">
                Unable to load health records
              </h3>

              <p className="mt-2 max-w-md text-sm leading-6 text-[#71868a]">
                {recordsQuery.error instanceof Error
                  ? recordsQuery.error.message
                  : "Please try again."}
              </p>

              <Button
                type="button"
                variant="outline"
                className="mt-6 h-11 rounded-xl border-[#d8e4e0] bg-white"
                onClick={() => void recordsQuery.refetch()}
              >
                <RefreshCw className="size-4" />
                Try again
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyRecordsState
              hasSearch={Boolean(search.trim())}
              category={activeCategory}
              canUpload={!isChildView && Boolean(activeParentId)}
              onUpload={() => setOpen(true)}
            />
          ) : (
            <div className="divide-y divide-[#e7eeec]">
              {filtered.map((record) => {
                const isImage = record.file_type?.startsWith("image/");
                const meta = categoryMeta[record.category];
                const Icon = meta?.Icon ?? FileText;
                const isDeleting =
                  remove.isPending && remove.variables?.id === record.id;
                const sizeLabel = formatFileSize(record.file_size);

                return (
                  <article
                    key={record.id}
                    className="group flex flex-col gap-4 px-5 py-5 transition-colors hover:bg-[#fbfdfc] sm:flex-row sm:items-center sm:px-6"
                  >
                    <div
                      className={`grid size-12 shrink-0 place-items-center rounded-xl ${meta?.iconBackground ?? "bg-[#edf2f0]"
                        } ${meta?.iconColor ?? "text-[#61777b]"}`}
                    >
                      {isImage ? (
                        <ImageIcon className="size-5" />
                      ) : (
                        <Icon className="size-5" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="max-w-full truncate text-sm font-bold text-[#234349] sm:text-base">
                          {record.title || "Untitled medical record"}
                        </h3>

                        {meta && (
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${meta.badgeClass}`}
                          >
                            {meta.label}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#75898d]">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="size-3.5" />
                          {format(parseISO(record.record_date), "MMM d, yyyy")}
                        </span>

                        {record.doctor_name && (
                          <span>{record.doctor_name}</span>
                        )}

                        {sizeLabel && <span>{sizeLabel}</span>}
                      </div>

                      {(record.description || record.notes) && (
                        <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-5 text-[#62777b]">
                          {record.description ?? record.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2 sm:justify-end">
                      {(record.file_path || record.file_url) && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-10 rounded-xl border-[#d8e4e0] bg-white text-[#38656a] hover:bg-[#eef6f3] hover:text-[#0d6665]"
                            title="Preview record"
                            aria-label={`Preview ${record.title || "health record"}`}
                            onClick={() => void previewFile(record)}
                          >
                            <Eye className="size-4" />
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-10 rounded-xl border-[#d8e4e0] bg-white text-[#38656a] hover:bg-[#eef6f3] hover:text-[#0d6665]"
                            title="Download record"
                            aria-label={`Download ${record.title || "health record"}`}
                            onClick={() => void downloadFile(record)}
                          >
                            <Download className="size-4" />
                          </Button>
                        </>
                      )}

                      {!isChildView && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={isDeleting}
                          className="size-10 rounded-xl text-[#9b5651] hover:bg-[#fff1ef] hover:text-[#8f413d]"
                          title="Delete record"
                          aria-label={`Delete ${record.title || "health record"}`}
                          onClick={() => {
                            const confirmed = window.confirm(
                              `Delete “${record.title || "this health record"}”? This also removes its attached file.`,
                            );

                            if (confirmed) {
                              remove.mutate(record);
                            }
                          }}
                        >
                          {isDeleting ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="rounded-2xl border border-[#dce8e4] bg-[#0c3f45] p-6 text-white">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-[#a8d7cb]">
                <ShieldCheck className="size-5" />
              </span>

              <div>
                <h2 className="text-base font-bold">
                  Documents are opened through secure temporary links
                </h2>

                <p className="mt-2 text-sm leading-6 text-white/70">
                  Private medical files are not exposed as permanent public
                  URLs. Access links are created only when an authorised user
                  previews or downloads a record.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#e4d8ce] bg-[#fbf7f2] p-6">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f3e4d7] text-[#9c6338]">
                <AlertTriangle className="size-5" />
              </span>

              <div>
                <h2 className="text-base font-bold text-[#3d3c35]">
                  Keep the original medical document
                </h2>

                <p className="mt-2 text-sm leading-6 text-[#756d64]">
                  The digital archive supports family coordination, but it does
                  not replace original hospital records or official reports.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

type SummaryMetricProps = {
  icon: ElementType;
  label: string;
  value: string;
  detail: string;
  iconBackground: string;
  iconColor: string;
  last?: boolean;
};

function SummaryMetric({
  icon: Icon,
  label,
  value,
  detail,
  iconBackground,
  iconColor,
  last = false,
}: SummaryMetricProps) {
  return (
    <div
      className={`flex items-center gap-4 px-5 py-5 sm:px-6 ${last
          ? ""
          : "border-b border-[#e2ebe8] sm:border-r lg:border-b-0"
        }`}
    >
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-xl ${iconBackground} ${iconColor}`}
      >
        <Icon className="size-5" />
      </span>

      <div className="min-w-0">
        <p className="truncate text-xs font-bold uppercase tracking-[0.11em] text-[#7b8f93]">
          {label}
        </p>

        <p className="mt-1 truncate text-xl font-bold tracking-[-0.035em] text-[#17343a]">
          {value}
        </p>

        <p className="mt-0.5 truncate text-xs text-[#768a8e]">{detail}</p>
      </div>
    </div>
  );
}

function LoadingRecords() {
  return (
    <div className="divide-y divide-[#e7eeec]">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="flex animate-pulse items-center gap-4 px-5 py-5 sm:px-6"
        >
          <div className="size-12 rounded-xl bg-[#edf2f0]" />

          <div className="flex-1 space-y-2">
            <div className="h-3 w-44 rounded bg-[#e7eeec]" />
            <div className="h-3 w-64 max-w-full rounded bg-[#f0f4f3]" />
          </div>

          <div className="hidden gap-2 sm:flex">
            <div className="size-10 rounded-xl bg-[#edf2f0]" />
            <div className="size-10 rounded-xl bg-[#edf2f0]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyRecordsState({
  hasSearch,
  category,
  canUpload,
  onUpload,
}: {
  hasSearch: boolean;
  category: Category;
  canUpload: boolean;
  onUpload: () => void;
}) {
  const message = hasSearch
    ? "No documents match the current search. Try another title, doctor or note."
    : category !== "all"
      ? `No ${categoryMeta[category].label.toLowerCase()} records have been uploaded yet.`
      : "The secure archive is empty. Upload the first medical document to begin.";

  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-[#e7f2ee] text-[#176f69]">
        <FolderOpen className="size-6" />
      </span>

      <h3 className="mt-5 text-lg font-bold text-[#1c3b41]">
        No health records found
      </h3>

      <p className="mt-2 max-w-md text-sm leading-6 text-[#71868a]">
        {message}
      </p>

      {canUpload && !hasSearch && (
        <Button
          type="button"
          className="mt-6 h-11 rounded-xl bg-[#0d6665] px-5 text-white hover:bg-[#0a5958]"
          onClick={onUpload}
        >
          <Plus className="size-4" />
          Upload first record
        </Button>
      )}
    </div>
  );
}