import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { useActiveParent } from "@/hooks/useProfile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Video,
  Pencil,
  XCircle,
  ShieldAlert,
  Plus,
  Clock,
  CalendarDays,
  Upload,
  FileText,
  Download,
  ExternalLink,
  CheckCircle2,
  Stethoscope,
  ChevronDown,
  ChevronUp,
  Trash2,
  LogIn,
  BellRing,
} from "lucide-react";
import { DateInput, TimeInput } from "@/components/ui/datetime-input";
import { createMedicalFileAccessUrl } from "@/lib/api/medicalFiles.functions";
import {
  MEDICAL_FILE_MAX_BYTES,
  PRESCRIPTION_ACCEPT,
  validateMedicalFile,
} from "@/lib/medicalFiles";
export const Route = createFileRoute("/_authenticated/video")({
  ssr: false,
  component: VideoPage,
});
type ConsultStatus =
  | "scheduled"
  | "waiting"
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";
type Consult = {
  id: string;
  parent_id: string;
  doctor_name: string;
  specialty: string | null;
  consultation_reason: string | null;
  consultation_date: string | null;
  consultation_time: string | null;
  scheduled_at: string;
  meeting_url: string | null;
  notes: string | null;
  status: ConsultStatus;
  reminder_enabled: boolean;
  reminder_minutes_before: number;
  cancellation_reason: string | null;
  waiting_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};
type Prescription = {
  id: string;
  consultation_id: string;
  parent_id: string;
  file_path: string;
  file_url: string | null;
  file_type: string;
  file_name: string | null;
  file_size: number | null;
  uploaded_at: string;
};
const PRESCRIPTION_BUCKET = "prescriptions";
const MAX_BYTES = MEDICAL_FILE_MAX_BYTES;
const ALLOWED_EXT = PRESCRIPTION_ACCEPT;
const STATUS_CONFIG: Record<
  ConsultStatus,
  {
    label: string;
    bg: string;
    text: string;
    dot: string;
  }
> = {
  scheduled: {
    label: "Scheduled",
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500",
  },
  waiting: {
    label: "Waiting",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-400",
  },
  pending: {
    label: "Pending",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-400",
  },
  in_progress: {
    label: "In Progress",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  completed: {
    label: "Completed",
    bg: "bg-stone-100",
    text: "text-stone-600",
    dot: "bg-stone-400",
  },
  cancelled: {
    label: "Cancelled",
    bg: "bg-red-50",
    text: "text-red-600",
    dot: "bg-red-400",
  },
};
const CANCELLABLE: ConsultStatus[] = ["scheduled", "waiting", "pending"];
const EDITABLE: ConsultStatus[] = ["scheduled", "waiting", "pending"];
const JOINABLE: ConsultStatus[] = ["scheduled", "waiting", "pending", "in_progress"];
const JOIN_EARLY_MINUTES = 15;
const REMINDER_OPTIONS = [
  { value: "15", label: "15 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "120", label: "2 hours before" },
  { value: "1440", label: "1 day before" },
] as const;
function todayString() {
  return format(new Date(), "yyyy-MM-dd");
}
function formatDisplayDate(d: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(`${d}T00:00:00`), "EEE, MMM d, yyyy");
  } catch {
    return d;
  }
}
function formatDisplayTime(t: string | null) {
  if (!t) return "—";
  try {
    const [h, m] = t.split(":");
    const d = new Date();
    d.setHours(parseInt(h), parseInt(m));
    return format(d, "h:mm a");
  } catch {
    return t;
  }
}
function generateJitsiRoom() {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `eldercare-${suffix}`;
}
function normalizeDoctorName(value: string) {
  return value.trim().replace(/^dr\.?\s+/i, "");
}
function displayDoctorName(value: string) {
  const clean = value.trim();
  return /^dr\.?\s+/i.test(clean) ? clean : `Dr. ${clean}`;
}
function parseLocalSchedule(date: string, time: string) {
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function getConsultTime(consult: Consult) {
  const parsed = new Date(consult.scheduled_at);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}
function isValidHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}
function StatusBadge({ status }: { status: ConsultStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide ${cfg.bg} ${cfg.text}`}
    >
      <span className={`size-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
function VideoPage() {
  const { activeParentId, activeParent, isChildView } = useActiveParent();
  const qc = useQueryClient();
  const medicalFileAccess = useServerFn(createMedicalFileAccessUrl);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editingConsult, setEditingConsult] = useState<Consult | null>(null);
  const [uploadConsult, setUploadConsult] = useState<Consult | null>(null);
  const [cancelConsultTarget, setCancelConsultTarget] = useState<Consult | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [doctorName, setDoctorName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [consultReason, setConsultReason] = useState("");
  const [consultDate, setConsultDate] = useState("");
  const [consultTime, setConsultTime] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState("60");
  const [nowMs, setNowMs] = useState(Date.now());
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const { data: consults, isLoading } = useQuery({
    queryKey: ["video", activeParentId],
    enabled: !!activeParentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("video_consultations")
        .select("*")
        .eq("parent_id", activeParentId!)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Consult[];
    },
  });
  const { data: prescriptions } = useQuery({
    queryKey: ["prescriptions", activeParentId],
    queryFn: async () => {
      const consultIds = (consults ?? []).map((c) => c.id);
      if (consultIds.length === 0) return [] as Prescription[];
      const { data, error } = await supabase
        .from("consultation_prescriptions")
        .select("*")
        .in("consultation_id", consultIds)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Prescription[];
    },
    enabled: !!activeParentId && (consults?.length ?? 0) > 0,
  });
  useEffect(() => {
    if (!activeParentId) return;
    const channel = supabase
      .channel(`video-consults-${activeParentId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "video_consultations",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["video", activeParentId] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "consultation_prescriptions",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["prescriptions", activeParentId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeParentId, qc]);
  function resetForm() {
    setDoctorName("");
    setSpecialty("");
    setConsultReason("");
    setConsultDate("");
    setConsultTime("");
    setMeetingUrl("");
    setNotes("");
    setReminderEnabled(true);
    setReminderMinutesBefore("60");
  }
  function openNew() {
    if (isChildView) {
      toast.error("You do not have permission to manage telehealth consultations.");
      return;
    }
    setEditingConsult(null);
    resetForm();
    setScheduleOpen(true);
  }
  function openEdit(c: Consult) {
    if (isChildView) {
      toast.error("You do not have permission to manage telehealth consultations.");
      return;
    }
    setEditingConsult(c);
    setDoctorName(c.doctor_name);
    setSpecialty(c.specialty ?? "");
    setConsultReason(c.consultation_reason ?? "");
    setConsultDate(c.consultation_date ?? "");
    setConsultTime(c.consultation_time ? c.consultation_time.slice(0, 5) : "");
    setMeetingUrl(c.meeting_url ?? "");
    setNotes(c.notes ?? "");
    setReminderEnabled(c.reminder_enabled !== false);
    setReminderMinutesBefore(String(c.reminder_minutes_before ?? 60));
    setScheduleOpen(true);
  }
  function closeSchedule() {
    setScheduleOpen(false);
    setEditingConsult(null);
    resetForm();
  }
  function closeUpload() {
    setUploadConsult(null);
    setUploadFile(null);
    setUploading(false);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
  function validateConsult(): boolean {
    if (!doctorName.trim()) {
      toast.error("Doctor name is required.");
      return false;
    }
    if (!consultDate) {
      toast.error("Consultation date is required.");
      return false;
    }
    if (consultDate < todayString()) {
      toast.error("Please select a future date.");
      return false;
    }
    if (!consultTime) {
      toast.error("Consultation time is required.");
      return false;
    }
    const scheduled = parseLocalSchedule(consultDate, consultTime);
    if (!scheduled) {
      toast.error("Please enter a valid consultation date and time.");
      return false;
    }
    if (scheduled.getTime() <= Date.now()) {
      toast.error("Consultation date and time must be in the future.");
      return false;
    }
    if (!consultReason.trim()) {
      toast.error("Consultation reason is required.");
      return false;
    }
    if (meetingUrl.trim() && !isValidHttpsUrl(meetingUrl.trim())) {
      toast.error("Meeting link must be a valid HTTPS URL.");
      return false;
    }
    return true;
  }
  const book = useMutation({
    mutationFn: async () => {
      if (isChildView)
        throw new Error("You do not have permission to manage telehealth consultations.");
      if (!activeParentId) throw new Error("No active parent profile selected.");
      const scheduled = parseLocalSchedule(consultDate, consultTime);
      if (!scheduled) throw new Error("Invalid consultation date or time.");
      const finalMeetingUrl = meetingUrl.trim() || `https://meet.jit.si/${generateJitsiRoom()}`;
      const { data, error } = await supabase
        .from("video_consultations")
        .insert({
          parent_id: activeParentId!,
          requested_by: activeParentId!,
          doctor_name: normalizeDoctorName(doctorName),
          specialty: specialty.trim() || null,
          consultation_reason: consultReason.trim(),
          consultation_date: consultDate,
          consultation_time: consultTime,
          scheduled_at: scheduled.toISOString(),
          meeting_url: finalMeetingUrl,
          notes: notes.trim() || null,
          reminder_enabled: reminderEnabled,
          reminder_minutes_before: Number(reminderMinutesBefore),
          status: "scheduled",
        })
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The consultation could not be created.");
    },
    onSuccess: () => {
      toast.success("Consultation scheduled successfully.");
      closeSchedule();
      qc.invalidateQueries({ queryKey: ["video"] });
    },
    onError: (e: Error) => {
      if (e.message.includes("permission")) toast.error(e.message);
      else toast.error("Please try again later.");
    },
  });
  const edit = useMutation({
    mutationFn: async (id: string) => {
      if (isChildView)
        throw new Error("You do not have permission to manage telehealth consultations.");
      if (!activeParentId) throw new Error("No active parent profile selected.");
      const scheduled = parseLocalSchedule(consultDate, consultTime);
      if (!scheduled) throw new Error("Invalid consultation date or time.");
      const finalMeetingUrl = meetingUrl.trim() || `https://meet.jit.si/${generateJitsiRoom()}`;
      const { data, error } = await supabase
        .from("video_consultations")
        .update({
          doctor_name: normalizeDoctorName(doctorName),
          specialty: specialty.trim() || null,
          consultation_reason: consultReason.trim(),
          consultation_date: consultDate,
          consultation_time: consultTime,
          scheduled_at: scheduled.toISOString(),
          meeting_url: finalMeetingUrl,
          notes: notes.trim() || null,
          reminder_enabled: reminderEnabled,
          reminder_minutes_before: Number(reminderMinutesBefore),
        })
        .eq("id", id)
        .eq("parent_id", activeParentId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The consultation was not found or could not be updated.");
    },
    onSuccess: () => {
      toast.success("Consultation updated successfully.");
      closeSchedule();
      qc.invalidateQueries({ queryKey: ["video"] });
    },
    onError: (e: Error) => {
      if (e.message.includes("permission")) toast.error(e.message);
      else toast.error("Please try again later.");
    },
  });
  const cancelConsult = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      if (isChildView)
        throw new Error("You do not have permission to manage telehealth consultations.");
      if (!activeParentId) throw new Error("No active parent profile selected.");
      const { data, error } = await supabase
        .from("video_consultations")
        .update({ status: "cancelled", cancellation_reason: reason.trim() })
        .eq("id", id)
        .eq("parent_id", activeParentId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The consultation was not found or could not be cancelled.");
    },
    onSuccess: () => {
      toast.success("Consultation cancelled.");
      setCancelConsultTarget(null);
      setCancelReason("");
      qc.invalidateQueries({ queryKey: ["video"] });
    },
    onError: (e: Error) => {
      if (e.message.includes("permission")) toast.error(e.message);
      else toast.error("Please try again later.");
    },
  });
  const clearAll = useMutation({
    mutationFn: async () => {
      if (isChildView)
        throw new Error("You do not have permission to manage telehealth consultations.");
      if (!activeParentId) throw new Error("No active parent profile selected.");
      const { data: files, error: fileQueryError } = await supabase
        .from("consultation_prescriptions")
        .select("file_path")
        .eq("parent_id", activeParentId);
      if (fileQueryError) throw fileQueryError;
      const { data, error } = await supabase
        .from("video_consultations")
        .delete()
        .eq("parent_id", activeParentId)
        .select("id");
      if (error) throw error;
      let cleanupFailed = false;
      const paths = (files ?? []).map((file) => file.file_path).filter(Boolean);
      if (paths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from(PRESCRIPTION_BUCKET)
          .remove(paths);
        cleanupFailed = !!storageError;
      }
      return { deletedCount: data?.length ?? 0, cleanupFailed };
    },
    onSuccess: ({ deletedCount, cleanupFailed }) => {
      toast.success(`${deletedCount} consultation${deletedCount === 1 ? "" : "s"} deleted.`);
      if (cleanupFailed) {
        toast.warning(
          "Consultations were deleted, but some old prescription files could not be cleaned up.",
        );
      }
      qc.invalidateQueries({ queryKey: ["video"] });
      qc.invalidateQueries({ queryKey: ["prescriptions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const checkInConsult = useMutation({
    mutationFn: async (id: string) => {
      if (isChildView)
        throw new Error("You do not have permission to manage telehealth consultations.");
      if (!activeParentId) throw new Error("No active parent profile selected.");
      const { data, error } = await supabase
        .from("video_consultations")
        .update({ status: "waiting" })
        .eq("id", id)
        .eq("parent_id", activeParentId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The consultation was not found or could not be checked in.");
    },
    onSuccess: () => {
      toast.success("Checked in. The consultation is now waiting to start.");
      qc.invalidateQueries({ queryKey: ["video", activeParentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const completeConsult = useMutation({
    mutationFn: async (id: string) => {
      if (isChildView)
        throw new Error("You do not have permission to manage telehealth consultations.");
      if (!activeParentId) throw new Error("No active parent profile selected.");
      const { data, error } = await supabase
        .from("video_consultations")
        .update({ status: "completed" })
        .eq("id", id)
        .eq("parent_id", activeParentId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The consultation was not found or could not be completed.");
    },
    onSuccess: () => {
      toast.success("Consultation marked as completed.");
      qc.invalidateQueries({ queryKey: ["video", activeParentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteConsult = useMutation({
    mutationFn: async (consult: Consult) => {
      if (isChildView)
        throw new Error("You do not have permission to manage telehealth consultations.");
      if (!activeParentId) throw new Error("No active parent profile selected.");
      const consultFiles = (prescriptions ?? []).filter(
        (prescription) => prescription.consultation_id === consult.id,
      );
      const { data, error } = await supabase
        .from("video_consultations")
        .delete()
        .eq("id", consult.id)
        .eq("parent_id", activeParentId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The consultation was not found or could not be deleted.");
      let cleanupFailed = false;
      const paths = consultFiles.map((file) => file.file_path).filter(Boolean);
      if (paths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from(PRESCRIPTION_BUCKET)
          .remove(paths);
        cleanupFailed = !!storageError;
      }
      return { consultId: consult.id, cleanupFailed };
    },
    onSuccess: ({ consultId, cleanupFailed }) => {
      qc.setQueryData<Consult[]>(["video", activeParentId], (old) =>
        (old ?? []).filter((consult) => consult.id !== consultId),
      );
      qc.setQueryData<Prescription[]>(["prescriptions", activeParentId], (old) =>
        (old ?? []).filter((prescription) => prescription.consultation_id !== consultId),
      );
      toast.success("Consultation deleted.");
      if (cleanupFailed) {
        toast.warning(
          "The consultation was deleted, but an old prescription file could not be cleaned up.",
        );
      }
      qc.invalidateQueries({ queryKey: ["video", activeParentId] });
      qc.invalidateQueries({ queryKey: ["prescriptions", activeParentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deletePrescription = useMutation({
    mutationFn: async (prescription: Prescription) => {
      if (isChildView) throw new Error("You do not have permission to manage prescriptions.");
      if (!activeParentId) throw new Error("No active parent profile selected.");
      const { data, error } = await supabase
        .from("consultation_prescriptions")
        .delete()
        .eq("id", prescription.id)
        .eq("parent_id", activeParentId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The prescription was not found or could not be deleted.");
      const { error: storageError } = await supabase.storage
        .from(PRESCRIPTION_BUCKET)
        .remove([prescription.file_path]);
      return { prescriptionId: prescription.id, cleanupFailed: !!storageError };
    },
    onSuccess: ({ prescriptionId, cleanupFailed }) => {
      qc.setQueryData<Prescription[]>(["prescriptions", activeParentId], (old) =>
        (old ?? []).filter((prescription) => prescription.id !== prescriptionId),
      );
      toast.success("Prescription deleted.");
      if (cleanupFailed) {
        toast.warning(
          "The prescription record was deleted, but its storage file could not be cleaned up.",
        );
      }
      qc.invalidateQueries({ queryKey: ["prescriptions", activeParentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const uploadPrescription = useMutation({
    mutationFn: async () => {
      if (isChildView)
        throw new Error("You do not have permission to manage telehealth consultations.");
      if (!uploadFile) throw new Error("__validation__");
      if (!uploadConsult) throw new Error("No consultation selected.");
      const validated = await validateMedicalFile(uploadFile, { allowWebp: false });
      setUploading(true);
      setUploadProgress(15);
      const key = `${activeParentId}/${uploadConsult.id}/${crypto.randomUUID()}.${validated.extension}`;
      const { error: upErr } = await supabase.storage
        .from(PRESCRIPTION_BUCKET)
        .upload(key, validated.file, { contentType: validated.mime, upsert: false });
      if (upErr) throw new Error(upErr.message || "Unable to upload prescription.");
      setUploadProgress(70);
      const { error: dbErr } = await supabase.from("consultation_prescriptions").insert({
        consultation_id: uploadConsult.id,
        parent_id: activeParentId!,
        file_path: key,
        file_type: validated.mime,
        file_name: validated.safeOriginalName,
        file_size: validated.file.size,
      });
      if (dbErr) {
        await supabase.storage.from(PRESCRIPTION_BUCKET).remove([key]);
        throw new Error("Unable to upload prescription.");
      }
      setUploadProgress(100);
    },
    onSuccess: () => {
      toast.success("Prescription uploaded successfully.");
      closeUpload();
      qc.invalidateQueries({ queryKey: ["prescriptions"] });
    },
    onError: (e: Error) => {
      setUploading(false);
      setUploadProgress(0);
      if (e.message !== "__validation__") toast.error(e.message);
    },
  });
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setUploadFile(null);
      return;
    }
    try {
      await validateMedicalFile(f, { allowWebp: false });
      setUploadFile(f);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid prescription file.");
      e.target.value = "";
      setUploadFile(null);
    }
  }
  async function openPrescription(p: Prescription) {
    try {
      const result = await medicalFileAccess({
        data: {
          documentKind: "prescription",
          documentId: p.id,
          action: "view",
        },
      });
      window.open(result.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open file");
    }
  }
  async function handleJoin(c: Consult) {
    if (!c.meeting_url) {
      toast.error("Consultation is not available.");
      return;
    }
    if (!isValidHttpsUrl(c.meeting_url)) {
      toast.error("The consultation meeting link is invalid.");
      return;
    }
    if (!JOINABLE.includes(c.status)) {
      toast.error("Consultation is not available.");
      return;
    }
    const scheduledMs = getConsultTime(c);
    const joinOpensAt = scheduledMs - JOIN_EARLY_MINUTES * 60 * 1000;
    if (c.status !== "in_progress" && scheduledMs > 0 && Date.now() < joinOpensAt) {
      toast.error(`Join will be available ${JOIN_EARLY_MINUTES} minutes before the consultation.`);
      return;
    }
    window.open(c.meeting_url, "_blank", "noopener,noreferrer");
    if (c.status !== "in_progress" && !isChildView) {
      const { error } = await supabase
        .from("video_consultations")
        .update({ status: "in_progress" })
        .eq("id", c.id)
        .eq("parent_id", activeParentId!);
      if (error) {
        toast.warning("Meeting opened, but the consultation status could not be updated.");
      } else {
        qc.invalidateQueries({ queryKey: ["video", activeParentId] });
      }
    }
  }
  const activeConsults = useMemo(
    () =>
      (consults ?? [])
        .filter((c) => c.status !== "cancelled" && c.status !== "completed")
        .sort((a, b) => getConsultTime(a) - getConsultTime(b)),
    [consults],
  );
  const historyConsults = useMemo(
    () =>
      (consults ?? [])
        .filter((c) => c.status === "cancelled" || c.status === "completed")
        .sort((a, b) => getConsultTime(b) - getConsultTime(a)),
    [consults],
  );
  const getPrescriptions = (consultId: string) =>
    (prescriptions ?? []).filter((p) => p.consultation_id === consultId);
  const isPending = editingConsult ? edit.isPending : book.isPending;
  return (
    <AppShell>
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold italic">Telehealth</h1>
          <p className="text-muted-foreground mt-1">
            Video consultations for {activeParent?.full_name ?? "—"}
          </p>
        </div>
        {!isChildView && (
          <div className="flex items-center gap-2">
            {activeParentId && consults && consults.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  if (
                    confirm(
                      "Are you sure you want to delete ALL consultations? This action cannot be undone.",
                    )
                  ) {
                    clearAll.mutate();
                  }
                }}
                disabled={clearAll.isPending}
                className="rounded-xl text-destructive hover:bg-destructive/5 hover:text-destructive border-destructive/20"
              >
                <Trash2 className="size-4 mr-2" />
                Delete All
              </Button>
            )}
            <Button
              disabled={!activeParentId}
              onClick={openNew}
              className="rounded-xl cursor-pointer"
              id="btn-new-consultation"
            >
              <Plus className="size-4 mr-2" />
              Schedule Consultation
            </Button>
          </div>
        )}
      </div>

      {isChildView && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-sm text-amber-800">
          <ShieldAlert className="size-4 shrink-0" />
          You do not have permission to manage telehealth consultations. Viewing in read-only mode.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {(["scheduled", "waiting", "in_progress", "completed"] as ConsultStatus[]).map((s) => {
          const count = (consults ?? []).filter((c) => c.status === s).length;
          const cfg = STATUS_CONFIG[s];
          return (
            <div
              key={s}
              className="bg-card border border-border p-4 rounded-2xl flex flex-col gap-1"
            >
              <span className={`text-[10px] font-mono uppercase tracking-widest ${cfg.text}`}>
                {cfg.label}
              </span>
              <p className="text-2xl font-bold">{count}</p>
            </div>
          );
        })}
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="font-display text-xl font-bold mb-4">Upcoming Consultations</h2>
          {isLoading ? (
            <div className="bg-card border border-border rounded-3xl p-12 text-center text-muted-foreground animate-pulse">
              Loading consultations…
            </div>
          ) : activeConsults.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-3xl p-14 text-center text-muted-foreground">
              <Video className="size-10 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-base">No consultations found.</p>
              {!isChildView && (
                <p className="text-sm mt-1">Click "Schedule Consultation" to get started.</p>
              )}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-3xl overflow-hidden divide-y divide-border">
              {activeConsults.map((c) => (
                <ConsultRow
                  key={c.id}
                  consult={c}
                  isChildView={isChildView}
                  expanded={expandedId === c.id}
                  onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  prescriptions={getPrescriptions(c.id)}
                  onEdit={() => openEdit(c)}
                  onCheckIn={() => checkInConsult.mutate(c.id)}
                  onCancel={() => {
                    if (isChildView) {
                      toast.error("You do not have permission to manage telehealth consultations.");
                      return;
                    }
                    setCancelConsultTarget(c);
                    setCancelReason("");
                  }}
                  onJoin={() => handleJoin(c)}
                  onComplete={() => {
                    if (isChildView) {
                      toast.error("You do not have permission to manage telehealth consultations.");
                      return;
                    }
                    if (confirm("Mark this consultation as completed?")) {
                      completeConsult.mutate(c.id);
                    }
                  }}
                  onDelete={() => {}}
                  onUploadRx={() => {
                    if (isChildView) {
                      toast.error("You do not have permission to manage telehealth consultations.");
                      return;
                    }
                    setUploadConsult(c);
                  }}
                  onOpenRx={openPrescription}
                  onDeleteRx={(prescription) => {
                    if (confirm(`Delete ${prescription.file_name ?? "this prescription"}?`)) {
                      deletePrescription.mutate(prescription);
                    }
                  }}
                  nowMs={nowMs}
                />
              ))}
            </div>
          )}
        </div>

        {historyConsults.length > 0 && (
          <div>
            <h2 className="font-display text-xl font-bold mb-4 text-muted-foreground">History</h2>
            <div className="bg-card border border-border rounded-3xl overflow-hidden divide-y divide-border opacity-75">
              {historyConsults.map((c) => (
                <ConsultRow
                  key={c.id}
                  consult={c}
                  isChildView={isChildView}
                  expanded={expandedId === c.id}
                  onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  prescriptions={getPrescriptions(c.id)}
                  onEdit={() => openEdit(c)}
                  onCheckIn={() => {}}
                  onCancel={() => {}}
                  onJoin={() => handleJoin(c)}
                  onComplete={() => {}}
                  onDelete={() => {
                    if (isChildView) {
                      toast.error("You do not have permission to manage telehealth consultations.");
                      return;
                    }
                    if (confirm("Permanently delete this consultation and its prescriptions?")) {
                      deleteConsult.mutate(c);
                    }
                  }}
                  onUploadRx={() => {
                    if (isChildView) {
                      toast.error("You do not have permission to manage telehealth consultations.");
                      return;
                    }
                    setUploadConsult(c);
                  }}
                  onOpenRx={openPrescription}
                  onDeleteRx={(prescription) => {
                    if (confirm(`Delete ${prescription.file_name ?? "this prescription"}?`)) {
                      deletePrescription.mutate(prescription);
                    }
                  }}
                  nowMs={nowMs}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={scheduleOpen}
        onOpenChange={(v) => {
          if (!v) closeSchedule();
          else setScheduleOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-[500px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-bold">
              {editingConsult ? "Edit Consultation" : "Schedule Consultation"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="vc-doctor">
                Doctor Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="vc-doctor"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                placeholder="e.g. Sharma"
                maxLength={120}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vc-specialty">
                Specialty <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="vc-specialty"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                placeholder="e.g. Diabetologist"
                maxLength={80}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vc-reason">
                Consultation Reason <span className="text-destructive">*</span>
              </Label>
              <Input
                id="vc-reason"
                value={consultReason}
                onChange={(e) => setConsultReason(e.target.value)}
                placeholder="e.g. Diabetes Follow-up"
                maxLength={200}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="vc-date">
                  Date <span className="text-destructive">*</span>
                </Label>
                <DateInput
                  id="vc-date"
                  value={consultDate}
                  min={todayString()}
                  onChange={setConsultDate}
                  placeholder="YYYY-MM-DD"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vc-time">
                  Time <span className="text-destructive">*</span>
                </Label>
                <TimeInput
                  id="vc-time"
                  value={consultTime}
                  onChange={setConsultTime}
                  placeholder="HH:MM"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vc-meeting-link">
                Meeting Link <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="vc-meeting-link"
                type="url"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder="https://meet.google.com/... or Zoom link"
                maxLength={500}
              />
              <p className="text-[11px] text-muted-foreground">
                Paste the link supplied by the doctor. Leave it blank to create a Jitsi meeting
                room.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-stone-50/70 p-4 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="vc-reminder" className="flex items-center gap-2">
                    <BellRing className="size-4 text-blue-600" />
                    Consultation reminder
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Creates an in-app reminder for the parent and linked children.
                  </p>
                </div>
                <Switch
                  id="vc-reminder"
                  checked={reminderEnabled}
                  onCheckedChange={setReminderEnabled}
                />
              </div>

              {reminderEnabled && (
                <div className="space-y-1.5">
                  <Label htmlFor="vc-reminder-time">Remind family</Label>
                  <Select value={reminderMinutesBefore} onValueChange={setReminderMinutesBefore}>
                    <SelectTrigger id="vc-reminder-time">
                      <SelectValue placeholder="Select reminder time" />
                    </SelectTrigger>
                    <SelectContent>
                      {REMINDER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vc-notes">
                Notes <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="vc-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Patient recently switched insulin dosage"
                rows={3}
                maxLength={400}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeSchedule} disabled={isPending}>
              Cancel
            </Button>
            <Button
              id="btn-submit-consultation"
              onClick={() => {
                if (!validateConsult()) return;
                if (editingConsult) {
                  edit.mutate(editingConsult.id);
                } else {
                  book.mutate();
                }
              }}
              disabled={isPending || !activeParentId}
            >
              {isPending
                ? editingConsult
                  ? "Saving…"
                  : "Scheduling…"
                : editingConsult
                  ? "Save Changes"
                  : "Schedule Consultation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!cancelConsultTarget}
        onOpenChange={(open) => {
          if (!open) {
            setCancelConsultTarget(null);
            setCancelReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[440px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">
              Cancel Consultation
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {cancelConsultTarget && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                {displayDoctorName(cancelConsultTarget.doctor_name)} ·{" "}
                {formatDisplayDate(cancelConsultTarget.consultation_date)} at{" "}
                {formatDisplayTime(cancelConsultTarget.consultation_time)}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="vc-cancel-reason">
                Cancellation reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="vc-cancel-reason"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="e.g. Doctor requested a new date"
                maxLength={300}
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                This reason is shared with linked family members.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCancelConsultTarget(null);
                setCancelReason("");
              }}
              disabled={cancelConsult.isPending}
            >
              Keep Consultation
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!cancelConsultTarget) return;
                if (cancelReason.trim().length < 3) {
                  toast.error("Please enter a cancellation reason.");
                  return;
                }
                cancelConsult.mutate({
                  id: cancelConsultTarget.id,
                  reason: cancelReason,
                });
              }}
              disabled={cancelConsult.isPending || cancelReason.trim().length < 3}
            >
              {cancelConsult.isPending ? "Cancelling…" : "Cancel Consultation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!uploadConsult}
        onOpenChange={(v) => {
          if (!v) closeUpload();
        }}
      >
        <DialogContent className="sm:max-w-[440px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">
              Upload Prescription
            </DialogTitle>
          </DialogHeader>

          {uploadConsult && (
            <div className="space-y-4 py-2">
              <div className="bg-stone-50 border border-stone-100 rounded-xl px-3 py-2 text-xs text-stone-600">
                <span className="font-semibold">For:</span>{" "}
                {displayDoctorName(uploadConsult.doctor_name)}
                {uploadConsult.consultation_reason && ` · ${uploadConsult.consultation_reason}`}
              </div>

              <div className="space-y-1.5">
                <Label>
                  File <span className="text-destructive">*</span>{" "}
                  <span className="text-xs text-muted-foreground">PDF, JPG, PNG · max 25 MB</span>
                </Label>
                <label
                  htmlFor="rx-file"
                  className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-6 cursor-pointer hover:bg-stone-50 transition-colors"
                >
                  <Upload className="size-6 text-muted-foreground mb-2" />
                  {uploadFile ? (
                    <span className="text-sm font-medium text-center break-all">
                      {uploadFile.name}{" "}
                      <span className="text-muted-foreground font-normal">
                        ({(uploadFile.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Click to choose a file</span>
                  )}
                  <Input
                    id="rx-file"
                    ref={fileInputRef}
                    type="file"
                    accept={ALLOWED_EXT}
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                </label>
              </div>

              {uploading && (
                <div className="space-y-1.5">
                  <Label>Uploading…</Label>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeUpload} disabled={uploadPrescription.isPending}>
              Cancel
            </Button>
            <Button
              id="btn-submit-prescription"
              onClick={() => uploadPrescription.mutate()}
              disabled={!uploadFile || uploadPrescription.isPending}
            >
              {uploadPrescription.isPending ? "Uploading…" : "Upload Prescription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
function ConsultRow({
  consult: c,
  isChildView,
  expanded,
  onToggle,
  prescriptions,
  onEdit,
  onCheckIn,
  onCancel,
  onJoin,
  onComplete,
  onDelete,
  onUploadRx,
  onOpenRx,
  onDeleteRx,
  nowMs,
}: {
  consult: Consult;
  isChildView: boolean;
  expanded: boolean;
  onToggle: () => void;
  prescriptions: Prescription[];
  onEdit: () => void;
  onCheckIn: () => void;
  onCancel: () => void;
  onJoin: () => void;
  onComplete: () => void;
  onDelete: () => void;
  onUploadRx: () => void;
  onOpenRx: (p: Prescription) => void;
  onDeleteRx: (p: Prescription) => void;
  nowMs: number;
}) {
  const canEdit = !isChildView && EDITABLE.includes(c.status);
  const canCheckIn = !isChildView && ["scheduled", "pending"].includes(c.status);
  const canCancel = !isChildView && CANCELLABLE.includes(c.status);
  const canComplete = !isChildView && c.status === "in_progress";
  const canDelete = !isChildView && (c.status === "completed" || c.status === "cancelled");
  const scheduledMs = getConsultTime(c);
  const joinAvailable =
    c.status === "in_progress" ||
    scheduledMs === 0 ||
    nowMs >= scheduledMs - JOIN_EARLY_MINUTES * 60 * 1000;
  const checkInAvailable =
    scheduledMs === 0 || nowMs >= scheduledMs - JOIN_EARLY_MINUTES * 60 * 1000;
  const canJoin = JOINABLE.includes(c.status) && !!c.meeting_url;
  const canUpload = !isChildView && (c.status === "completed" || c.status === "in_progress");
  const isActive = c.status === "in_progress" || c.status === "waiting";
  const isPastDue =
    !["completed", "cancelled", "in_progress"].includes(c.status) &&
    scheduledMs > 0 &&
    nowMs > scheduledMs;
  return (
    <div
      className={`hover:bg-stone-50/50 transition-colors ${isActive ? "border-l-4 border-emerald-400" : ""}`}
    >
      <div className="p-5 flex items-start gap-5">
        <div
          className={`size-12 rounded-2xl flex items-center justify-center shrink-0 ${isActive ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}
        >
          <Video className="size-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-base">
              {displayDoctorName(c.doctor_name)}
              {c.specialty && (
                <span className="text-muted-foreground font-normal text-sm"> · {c.specialty}</span>
              )}
            </p>
            <StatusBadge status={c.status} />
            {isPastDue && (
              <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600">
                Past due
              </span>
            )}
          </div>

          {c.consultation_reason && (
            <p className="text-sm text-stone-600 mt-0.5">{c.consultation_reason}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1.5">
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {formatDisplayDate(c.consultation_date)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" />
              {formatDisplayTime(c.consultation_time)}
            </span>
            {prescriptions.length > 0 && (
              <span className="flex items-center gap-1 text-blue-600 font-medium">
                <FileText className="size-3.5" />
                {prescriptions.length} prescription{prescriptions.length > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {c.notes && (
            <div className="bg-stone-50 border border-stone-100 rounded-xl px-3 py-2 mt-2 text-xs text-stone-600 italic">
              {c.notes}
            </div>
          )}

          {c.reminder_enabled && !["completed", "cancelled"].includes(c.status) && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-blue-600">
              <BellRing className="size-3.5" />
              Family reminder{" "}
              {c.reminder_minutes_before >= 1440
                ? "1 day"
                : c.reminder_minutes_before >= 60
                  ? `${c.reminder_minutes_before / 60} hour${c.reminder_minutes_before === 60 ? "" : "s"}`
                  : `${c.reminder_minutes_before} minutes`}{" "}
              before
            </p>
          )}

          {c.status === "cancelled" && c.cancellation_reason && (
            <div className="mt-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
              <span className="font-semibold">Cancellation reason:</span> {c.cancellation_reason}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {canCheckIn && (
            <Button
              size="sm"
              variant="outline"
              id={`btn-check-in-${c.id}`}
              className="rounded-lg text-xs h-8 gap-1.5"
              onClick={onCheckIn}
              disabled={!checkInAvailable}
              title={
                checkInAvailable
                  ? "Check in for the consultation"
                  : `Check-in opens ${JOIN_EARLY_MINUTES} minutes before the consultation`
              }
            >
              <LogIn className="size-3" />
              Check In
            </Button>
          )}

          {canJoin && (
            <Button
              size="sm"
              id={`btn-join-${c.id}`}
              className="rounded-lg text-xs h-8 gap-1.5"
              onClick={onJoin}
              disabled={!joinAvailable}
              title={
                joinAvailable
                  ? "Open consultation"
                  : `Available ${JOIN_EARLY_MINUTES} minutes before the consultation`
              }
            >
              <ExternalLink className="size-3" />
              {joinAvailable ? "Join" : "Not Open Yet"}
            </Button>
          )}

          <div className="flex items-center gap-1">
            {canEdit && (
              <button
                id={`btn-edit-${c.id}`}
                onClick={onEdit}
                className="p-2 text-stone-400 hover:text-stone-800 transition-colors cursor-pointer rounded-lg hover:bg-stone-100"
                title="Edit consultation"
              >
                <Pencil className="size-4" />
              </button>
            )}

            {canCancel && (
              <button
                id={`btn-cancel-${c.id}`}
                onClick={onCancel}
                className="p-2 text-stone-400 hover:text-amber-700 transition-colors cursor-pointer rounded-lg hover:bg-amber-50"
                title="Cancel consultation"
              >
                <XCircle className="size-4" />
              </button>
            )}

            {canComplete && (
              <button
                id={`btn-complete-${c.id}`}
                onClick={onComplete}
                className="p-2 text-stone-400 hover:text-emerald-700 transition-colors cursor-pointer rounded-lg hover:bg-emerald-50"
                title="Mark consultation completed"
              >
                <CheckCircle2 className="size-4" />
              </button>
            )}

            {canDelete && (
              <button
                id={`btn-delete-${c.id}`}
                onClick={onDelete}
                className="p-2 text-stone-400 hover:text-destructive transition-colors cursor-pointer rounded-lg hover:bg-destructive/5"
                title="Delete consultation"
              >
                <Trash2 className="size-4" />
              </button>
            )}

            {canUpload && (
              <button
                id={`btn-upload-rx-${c.id}`}
                onClick={onUploadRx}
                className="p-2 text-stone-400 hover:text-blue-600 transition-colors cursor-pointer rounded-lg hover:bg-blue-50"
                title="Upload prescription"
              >
                <Upload className="size-4" />
              </button>
            )}

            {prescriptions.length > 0 && (
              <button
                onClick={onToggle}
                className="p-2 text-stone-400 hover:text-stone-700 transition-colors cursor-pointer rounded-lg hover:bg-stone-100"
                title={expanded ? "Collapse" : "View prescriptions"}
              >
                {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {expanded && prescriptions.length > 0 && (
        <div className="mx-5 mb-4 border border-border rounded-2xl overflow-hidden divide-y divide-border bg-stone-50/50">
          <div className="px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Prescriptions
          </div>
          {prescriptions.map((p) => {
            const isImg = p.file_type?.startsWith("image/");
            return (
              <div key={p.id} className="px-4 py-3 flex items-center gap-3">
                <div
                  className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${isImg ? "bg-blue-50 text-blue-600" : "bg-stone-100 text-stone-600"}`}
                >
                  {isImg ? <Stethoscope className="size-4" /> : <FileText className="size-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.file_name ?? "Prescription"}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(p.uploaded_at), "MMM d, yyyy")}
                    {p.file_size && ` · ${(p.file_size / 1024 / 1024).toFixed(2)} MB`}
                  </p>
                </div>
                <button
                  onClick={() => onOpenRx(p)}
                  className="p-1.5 text-primary hover:opacity-80 transition-opacity"
                  title="View prescription"
                >
                  <Download className="size-4" />
                </button>
                {!isChildView && (
                  <button
                    onClick={() => onDeleteRx(p)}
                    className="p-1.5 text-stone-400 hover:text-destructive transition-colors"
                    title="Delete prescription"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
