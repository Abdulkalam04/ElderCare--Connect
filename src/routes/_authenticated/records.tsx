import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useActiveParent, useCurrentUser } from "@/hooks/useProfile";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  Activity,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Pill,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  TestTube2,
  Trash2,
  Upload,
} from "lucide-react";
import { DateInput } from "@/components/ui/datetime-input";
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
function formatFileSize(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
type Category = "all" | "blood_test" | "prescription" | "ecg";
type RecordCategory = Exclude<Category, "all">;
const categoryMeta: Record<
  RecordCategory,
  {
    label: string;
    Icon: React.ElementType;
    bg: string;
    text: string;
    border: string;
  }
> = {
  blood_test: {
    label: "Blood Test",
    Icon: TestTube2,
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
  },
  prescription: {
    label: "Prescription",
    Icon: Pill,
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  ecg: {
    label: "ECG",
    Icon: Activity,
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-200",
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
function sortRecords(rows: RecordRow[]): RecordRow[] {
  return [...rows].sort((a, b) => {
    const dateComparison = b.record_date.localeCompare(a.record_date);
    if (dateComparison !== 0) return dateComparison;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
function RecordsPage() {
  const { data: user } = useCurrentUser();
  const { activeParentId, activeParent, isChildView } = useActiveParent();
  const qc = useQueryClient();
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
    enabled: !!activeParentId,
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
          void qc.invalidateQueries({ queryKey: ["records", activeParentId] });
          void qc.invalidateQueries({ queryKey: ["recentReports", activeParentId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeParentId, qc]);
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
        (acc, record) => {
          acc[record.category] = (acc[record.category] ?? 0) + 1;
          return acc;
        },
        { blood_test: 0, prescription: 0, ecg: 0 },
      ),
    [records],
  );
  function resetForm() {
    setForm(emptyForm());
    setProgress(0);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
  function validateUpload(): string | null {
    if (!form.category) return "Please select a category.";
    if (!form.record_date) return "Please select the record date.";
    if (form.record_date > format(new Date(), "yyyy-MM-dd")) {
      return "A health record date cannot be in the future.";
    }
    if (!form.file) return "Please choose a file to upload.";
    if (form.file.size === 0) return "The selected file is empty.";
    if (form.file.size > MEDICAL_FILE_MAX_BYTES) return "File exceeds the 25 MB limit.";
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
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(key, file, {
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
        form.title.trim() || validated.safeOriginalName.replace(/\.[^.]+$/, ""),
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
      qc.setQueryData<RecordRow[]>(["records", activeParentId], (current = []) =>
        sortRecords([newRecord, ...current.filter((row) => row.id !== newRecord.id)]),
      );
      void qc.invalidateQueries({ queryKey: ["recentReports", activeParentId] });
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
      if (!activeParentId) throw new Error("No active parent profile selected.");
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
      qc.setQueryData<RecordRow[]>(["records", activeParentId], (current = []) =>
        current.filter((record) => record.id !== id),
      );
      void qc.invalidateQueries({ queryKey: ["recentReports", activeParentId] });
      if (storageWarning) {
        toast.warning("Record deleted, but its stored file could not be cleaned up.");
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
      if (!activeParentId) throw new Error("No active parent profile selected.");
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
        throw new Error("No records were deleted. Please check your database permissions.");
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
      qc.setQueryData<RecordRow[]>(["records", activeParentId], []);
      void qc.invalidateQueries({ queryKey: ["recentReports", activeParentId] });
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
  async function createFileUrl(record: RecordRow, download = false): Promise<string> {
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
      toast.error("The browser blocked the preview window. Allow popups and try again.");
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
      toast.error(error instanceof Error ? error.message : "Unable to open file.");
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
      toast.error(error instanceof Error ? error.message : "Unable to download file.");
    }
  }
  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
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
        title: current.title || validated.safeOriginalName.replace(/\.[^.]+$/, ""),
      }));
    } catch (error) {
      input.value = "";
      setForm((current) => ({ ...current, file: null }));
      toast.error(error instanceof Error ? error.message : "The selected file is not valid.");
    }
  }
  const tabs: {
    value: Category;
    label: string;
    count: number;
  }[] = [
    { value: "all", label: "All", count: records.length },
    { value: "blood_test", label: "Blood Test", count: counts.blood_test },
    { value: "prescription", label: "Prescription", count: counts.prescription },
    { value: "ecg", label: "ECG", count: counts.ecg },
  ];
  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold italic sm:text-4xl">Health Records</h1>
          <p className="mt-1 text-muted-foreground">
            Medical documents for {activeParent?.full_name ?? "—"}
          </p>
        </div>

        {!isChildView && activeParentId && (
          <div className="flex flex-wrap items-center gap-2">
            {records.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  if (
                    window.confirm(
                      "Are you sure you want to delete ALL health records? This permanently removes every record and attached file.",
                    )
                  ) {
                    clearAll.mutate();
                  }
                }}
                disabled={clearAll.isPending}
                className="rounded-xl border-destructive/20 text-destructive hover:bg-destructive/5 hover:text-destructive"
              >
                {clearAll.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 size-4" />
                )}
                Delete All
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
                <Button className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                  <Plus className="mr-2 size-4" /> Upload record
                </Button>
              </DialogTrigger>

              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="font-display">Upload health record</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="record-category">
                      Category <span className="text-destructive">*</span>
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
                      <SelectTrigger id="record-category">
                        <SelectValue placeholder="Select a category…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="blood_test">🩸 Blood Test</SelectItem>
                        <SelectItem value="prescription">💊 Prescription</SelectItem>
                        <SelectItem value="ecg">💓 ECG</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="record-title">
                      Title <span className="text-xs text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="record-title"
                      value={form.title}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, title: event.target.value }))
                      }
                      placeholder="e.g. CBC Report June 2026"
                      maxLength={120}
                      disabled={upload.isPending}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="record-date">
                        Record date <span className="text-destructive">*</span>
                      </Label>
                      <DateInput
                        id="record-date"
                        value={form.record_date}
                        onChange={(value) =>
                          setForm((current) => ({ ...current, record_date: value }))
                        }
                        placeholder="YYYY-MM-DD"
                        disabled={upload.isPending}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="record-doctor">Doctor name</Label>
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
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="record-notes">Notes</Label>
                    <Textarea
                      id="record-notes"
                      value={form.notes}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, notes: event.target.value }))
                      }
                      placeholder="Add a short summary or important result…"
                      rows={3}
                      maxLength={1000}
                      disabled={upload.isPending}
                    />
                    <p className="text-right text-xs text-muted-foreground">
                      {form.notes.length}/1000
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="record-file">
                      File <span className="text-destructive">*</span>{" "}
                      <span className="text-xs text-muted-foreground">
                        PDF, JPG, PNG, WebP · max 25 MB
                      </span>
                    </Label>
                    <label
                      htmlFor="record-file"
                      className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-6 transition-colors ${
                        upload.isPending
                          ? "cursor-not-allowed opacity-60"
                          : "cursor-pointer hover:bg-stone-50"
                      }`}
                    >
                      <Upload className="mb-2 size-6 text-muted-foreground" />
                      {form.file ? (
                        <span className="break-all text-center text-sm font-medium text-foreground">
                          {form.file.name}{" "}
                          <span className="font-normal text-muted-foreground">
                            ({formatFileSize(form.file.size)})
                          </span>
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Click to choose a file
                        </span>
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
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label>Uploading…</Label>
                        <span className="text-xs text-muted-foreground">{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={upload.isPending}
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button disabled={upload.isPending} onClick={() => upload.mutate()}>
                    {upload.isPending ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" /> Uploading…
                      </>
                    ) : (
                      "Upload record"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {isChildView && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <ShieldAlert className="size-4 shrink-0" />
          You are viewing {activeParent?.full_name}&apos;s health records in read-only mode.
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveCategory(tab.value)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
              activeCategory === tab.value
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-border bg-white text-muted-foreground hover:bg-stone-50"
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs ${
                activeCategory === tab.value
                  ? "bg-white/20 text-white"
                  : "bg-stone-100 text-stone-600"
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by title, doctor, notes, or category…"
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void recordsQuery.refetch()}
          disabled={recordsQuery.isFetching}
          className="rounded-xl"
        >
          <RefreshCw className={`mr-2 size-4 ${recordsQuery.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="overflow-hidden rounded-3xl border border-border bg-card">
        {recordsQuery.isLoading ? (
          <div className="p-16 text-center text-muted-foreground">
            <Loader2 className="mx-auto mb-3 size-8 animate-spin opacity-60" />
            <p className="font-medium">Loading health records…</p>
          </div>
        ) : recordsQuery.isError ? (
          <div className="p-16 text-center text-muted-foreground">
            <ShieldAlert className="mx-auto mb-3 size-10 text-destructive/60" />
            <p className="font-medium text-foreground">Unable to load health records</p>
            <p className="mt-1 text-sm">
              {recordsQuery.error instanceof Error
                ? recordsQuery.error.message
                : "Please try again."}
            </p>
            <Button variant="outline" className="mt-4" onClick={() => void recordsQuery.refetch()}>
              Try again
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground">
            <FolderOpen className="mx-auto mb-3 size-10 opacity-30" />
            <p className="font-medium">No health records found</p>
            {search.trim() ? (
              <p className="mt-1 text-sm">Try another search term or category.</p>
            ) : activeCategory !== "all" ? (
              <p className="mt-1 text-sm">No {categoryMeta[activeCategory]?.label} records yet.</p>
            ) : !isChildView ? (
              <p className="mt-1 text-sm">Upload the first record using the button above.</p>
            ) : null}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((record) => {
              const isImage = record.file_type?.startsWith("image/");
              const meta = categoryMeta[record.category];
              const Icon = meta?.Icon ?? FileText;
              const isDeleting = remove.isPending && remove.variables?.id === record.id;
              const sizeLabel = formatFileSize(record.file_size);
              return (
                <div
                  key={record.id}
                  className="group flex items-start gap-4 p-4 transition-colors hover:bg-stone-50/60 sm:p-6"
                >
                  <div
                    className={`grid size-10 shrink-0 place-items-center rounded-2xl sm:size-12 ${meta ? `${meta.bg} ${meta.text}` : "bg-stone-100 text-stone-600"}`}
                  >
                    {isImage ? (
                      <ImageIcon className="size-4 sm:size-5" />
                    ) : (
                      <Icon className="size-4 sm:size-5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold">{record.title || "Untitled record"}</p>
                      {meta && (
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-xs ${meta.bg} ${meta.text} ${meta.border}`}
                        >
                          {meta.label}
                        </span>
                      )}
                    </div>

                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {format(parseISO(record.record_date), "MMM d, yyyy")}
                      {record.doctor_name && ` · ${record.doctor_name}`}
                      {sizeLabel && ` · ${sizeLabel}`}
                    </p>

                    {(record.description || record.notes) && (
                      <p className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">
                        {record.description ?? record.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {(record.file_path || record.file_url) && (
                      <>
                        <button
                          type="button"
                          onClick={() => void previewFile(record)}
                          className="rounded-lg p-2 text-primary transition-colors hover:bg-primary/10"
                          title="Preview record"
                          aria-label={`Preview ${record.title || "health record"}`}
                        >
                          <Eye className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void downloadFile(record)}
                          className="rounded-lg p-2 text-primary transition-colors hover:bg-primary/10"
                          title="Download record"
                          aria-label={`Download ${record.title || "health record"}`}
                        >
                          <Download className="size-4" />
                        </button>
                      </>
                    )}

                    {!isChildView && (
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete “${record.title || "this health record"}”? This also removes its attached file.`,
                            )
                          ) {
                            remove.mutate(record);
                          }
                        }}
                        className="rounded-lg p-2 text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Delete record"
                        aria-label={`Delete ${record.title || "health record"}`}
                      >
                        {isDeleting ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
