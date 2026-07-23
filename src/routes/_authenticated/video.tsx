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
    bg: "bg-[#e8f1f4]",
    text: "text-[#365f73]",
    dot: "bg-[#4f8198]",
  },
  waiting: {
    label: "Waiting",
    bg: "bg-[#f7eddf]",
    text: "text-[#97633c]",
    dot: "bg-[#c18450]",
  },
  pending: {
    label: "Pending",
    bg: "bg-[#f4efe4]",
    text: "text-[#80683f]",
    dot: "bg-[#ad8d4f]",
  },
  in_progress: {
    label: "In progress",
    bg: "bg-[#e2f1ec]",
    text: "text-[#176c60]",
    dot: "bg-[#2f8d78]",
  },
  completed: {
    label: "Completed",
    bg: "bg-[#edf2f0]",
    text: "text-[#526a6d]",
    dot: "bg-[#71898c]",
  },
  cancelled: {
    label: "Cancelled",
    bg: "bg-[#f8e8e6]",
    text: "text-[#a54e49]",
    dot: "bg-[#bd625b]",
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
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${cfg.bg} ${cfg.text}`}
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

  const statusCounts = {
    scheduled: (consults ?? []).filter((consult) => consult.status === "scheduled").length,
    waiting: (consults ?? []).filter(
      (consult) => consult.status === "waiting" || consult.status === "pending",
    ).length,
    inProgress: (consults ?? []).filter((consult) => consult.status === "in_progress").length,
    completed: historyConsults.filter((consult) => consult.status === "completed").length,
  };

  const nextConsultation = activeConsults[0] ?? null;
  const prescriptionCount = prescriptions?.length ?? 0;

  return (
    <AppShell>
      <div className="space-y-6 pb-10">
        <section className="overflow-hidden rounded-[1.75rem] border border-[#dce8e4] bg-white shadow-[0_20px_55px_-42px_rgba(22,55,60,0.45)]">
          <div className="flex flex-col gap-6 px-5 py-6 sm:px-7 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-7">
            <div className="max-w-2xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-[#e7f2ee] px-3 py-1.5 text-xs font-bold text-[#176f69]">
                  <Video className="size-3.5" />
                  Secure telehealth
                </span>

                {isChildView && (
                  <span className="rounded-full border border-[#d8e5e1] bg-[#f7faf9] px-3 py-1.5 text-xs font-semibold text-[#647b80]">
                    Family view
                  </span>
                )}
              </div>

              <h1 className="text-3xl font-bold tracking-[-0.04em] text-[#122f35] sm:text-4xl">
                Video consultations
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-[#667d82] sm:text-base">
                Schedule and manage online doctor visits for{" "}
                <span className="font-semibold text-[#294b50]">
                  {activeParent?.full_name ?? "the selected profile"}
                </span>
                , join securely and keep prescriptions connected to each consultation.
              </p>
            </div>

            {!isChildView && (
              <div className="flex flex-col gap-3 sm:flex-row">
                {activeParentId && consults && consults.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={clearAll.isPending}
                    className="h-11 rounded-xl border-[#e0cbc7] bg-white px-5 font-semibold text-[#a44f49] hover:border-[#dcb9b4] hover:bg-[#fff6f5] hover:text-[#923f3a]"
                    onClick={() => {
                      const confirmed = window.confirm(
                        "Delete every consultation and its prescription records? This action cannot be undone.",
                      );

                      if (confirmed) {
                        clearAll.mutate();
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                    {clearAll.isPending ? "Deleting…" : "Delete all"}
                  </Button>
                )}

                <Button
                  id="btn-new-consultation"
                  type="button"
                  disabled={!activeParentId}
                  onClick={openNew}
                  className="h-11 rounded-xl bg-[#0d6665] px-5 font-semibold text-white shadow-[0_14px_30px_-18px_rgba(13,102,101,0.9)] hover:bg-[#0a5958]"
                >
                  <Plus className="size-4" />
                  Schedule consultation
                </Button>
              </div>
            )}
          </div>

          <div className="grid border-t border-[#e2ece9] bg-[#f7faf9] sm:grid-cols-2 xl:grid-cols-4">
            <ConsultMetric
              icon={CalendarDays}
              label="Scheduled"
              value={String(statusCounts.scheduled)}
              detail="Upcoming appointments"
              iconClass="bg-[#e8f1f4] text-[#3e687b]"
            />

            <ConsultMetric
              icon={Clock}
              label="Waiting"
              value={String(statusCounts.waiting)}
              detail="Checked in or pending"
              iconClass="bg-[#f6ecdf] text-[#97633c]"
            />

            <ConsultMetric
              icon={Video}
              label="Live now"
              value={String(statusCounts.inProgress)}
              detail="Consultations in progress"
              iconClass="bg-[#e2f1ec] text-[#176c60]"
            />

            <ConsultMetric
              icon={FileText}
              label="Prescriptions"
              value={String(prescriptionCount)}
              detail={`${statusCounts.completed} completed visits`}
              iconClass="bg-[#edf1f5] text-[#536c88]"
              last
            />
          </div>
        </section>

        {isChildView && (
          <section className="flex items-start gap-3 rounded-2xl border border-[#ead9be] bg-[#fbf6ec] px-5 py-4 text-sm text-[#795d37]">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-bold">Read-only family access</p>
              <p className="mt-1 leading-5 text-[#8a704e]">
                You can review consultation details and join available meetings, but only the parent
                account can schedule, edit, cancel or upload prescriptions.
              </p>
            </div>
          </section>
        )}

        <section className="grid gap-5 lg:grid-cols-[1.18fr_0.82fr]">
          <div className="rounded-[1.6rem] border border-[#dce8e4] bg-[#0c3f45] p-6 text-white shadow-[0_22px_50px_-38px_rgba(11,55,60,0.75)] sm:p-7">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-xl">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#a7d5cb]">
                  Next consultation
                </p>

                {nextConsultation ? (
                  <>
                    <h2 className="mt-3 text-2xl font-bold tracking-[-0.035em]">
                      {displayDoctorName(nextConsultation.doctor_name)}
                    </h2>

                    <p className="mt-1 text-sm text-white/65">
                      {nextConsultation.specialty || "General consultation"}
                    </p>

                    <div className="mt-5 flex flex-wrap gap-3 text-sm">
                      <span className="inline-flex items-center gap-2 rounded-xl bg-white/8 px-3 py-2 text-white/85">
                        <CalendarDays className="size-4 text-[#a7d5cb]" />
                        {formatDisplayDate(nextConsultation.consultation_date)}
                      </span>

                      <span className="inline-flex items-center gap-2 rounded-xl bg-white/8 px-3 py-2 text-white/85">
                        <Clock className="size-4 text-[#a7d5cb]" />
                        {formatDisplayTime(nextConsultation.consultation_time)}
                      </span>
                    </div>

                    {nextConsultation.consultation_reason && (
                      <p className="mt-5 text-sm leading-6 text-white/70">
                        {nextConsultation.consultation_reason}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <h2 className="mt-3 text-2xl font-bold tracking-[-0.035em]">
                      No upcoming consultation
                    </h2>

                    <p className="mt-3 max-w-lg text-sm leading-6 text-white/65">
                      Schedule a secure video visit when medical guidance is needed without an
                      in-person journey.
                    </p>
                  </>
                )}
              </div>

              <div className="grid size-16 shrink-0 place-items-center rounded-2xl border border-white/12 bg-white/8 text-[#acd9ce]">
                <Stethoscope className="size-7" />
              </div>
            </div>

            {nextConsultation && (
              <div className="mt-7 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row">
                <Button
                  type="button"
                  onClick={() => handleJoin(nextConsultation)}
                  disabled={
                    !JOINABLE.includes(nextConsultation.status) || !nextConsultation.meeting_url
                  }
                  className="h-11 rounded-xl bg-white px-5 font-semibold text-[#0c3f45] hover:bg-[#edf6f3]"
                >
                  <ExternalLink className="size-4" />
                  Open consultation
                </Button>

                {!isChildView && EDITABLE.includes(nextConsultation.status) && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => openEdit(nextConsultation)}
                    className="h-11 rounded-xl border-white/20 bg-transparent px-5 font-semibold text-white hover:bg-white/10 hover:text-white"
                  >
                    <Pencil className="size-4" />
                    Edit details
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="rounded-[1.6rem] border border-[#dce8e4] bg-white p-6 shadow-[0_18px_45px_-38px_rgba(18,49,54,0.45)] sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#7d9094]">
                  Consultation readiness
                </p>
                <h2 className="mt-2 text-lg font-bold tracking-[-0.025em] text-[#17343a]">
                  Prepare before joining
                </h2>
              </div>

              <span className="grid size-10 place-items-center rounded-xl bg-[#e7f2ee] text-[#176f69]">
                <CheckCircle2 className="size-5" />
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {[
                "Use a stable internet connection",
                "Keep medicine and recent vital details ready",
                "Join from a quiet, well-lit place",
                "Upload the prescription after the visit",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 rounded-xl bg-[#f7faf9] px-4 py-3"
                >
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#dceee8] text-[#176f69]">
                    <CheckCircle2 className="size-3" />
                  </span>
                  <p className="text-sm leading-5 text-[#5f767a]">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-[#dce8e4] bg-white shadow-[0_18px_50px_-40px_rgba(18,49,54,0.45)]">
          <div className="flex flex-col gap-3 border-b border-[#e3ece9] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-lg font-bold tracking-[-0.025em] text-[#17343a]">
                Upcoming consultations
              </h2>
              <p className="mt-1 text-sm text-[#72868a]">
                Review meeting access, reminders and preparation notes.
              </p>
            </div>

            <span className="rounded-full bg-[#edf4f2] px-3 py-1.5 text-xs font-bold text-[#5c7478]">
              {activeConsults.length} active
            </span>
          </div>

          {isLoading ? (
            <ConsultLoadingState />
          ) : activeConsults.length === 0 ? (
            <ConsultEmptyState isChildView={isChildView} onSchedule={openNew} />
          ) : (
            <div className="divide-y divide-[#e6eeeb]">
              {activeConsults.map((consult) => (
                <ConsultRow
                  key={consult.id}
                  consult={consult}
                  isChildView={isChildView}
                  expanded={expandedId === consult.id}
                  onToggle={() => setExpandedId(expandedId === consult.id ? null : consult.id)}
                  prescriptions={getPrescriptions(consult.id)}
                  onEdit={() => openEdit(consult)}
                  onCheckIn={() => checkInConsult.mutate(consult.id)}
                  onCancel={() => {
                    if (isChildView) {
                      toast.error(
                        "You do not have permission to manage telehealth consultations.",
                      );
                      return;
                    }

                    setCancelConsultTarget(consult);
                    setCancelReason("");
                  }}
                  onJoin={() => handleJoin(consult)}
                  onComplete={() => {
                    if (isChildView) {
                      toast.error(
                        "You do not have permission to manage telehealth consultations.",
                      );
                      return;
                    }

                    if (window.confirm("Mark this consultation as completed?")) {
                      completeConsult.mutate(consult.id);
                    }
                  }}
                  onDelete={() => { }}
                  onUploadRx={() => {
                    if (isChildView) {
                      toast.error(
                        "You do not have permission to manage telehealth consultations.",
                      );
                      return;
                    }

                    setUploadConsult(consult);
                  }}
                  onOpenRx={openPrescription}
                  onDeleteRx={(prescription) => {
                    if (
                      window.confirm(
                        `Delete ${prescription.file_name ?? "this prescription"}?`,
                      )
                    ) {
                      deletePrescription.mutate(prescription);
                    }
                  }}
                  nowMs={nowMs}
                />
              ))}
            </div>
          )}
        </section>

        {historyConsults.length > 0 && (
          <section className="overflow-hidden rounded-[1.75rem] border border-[#dce8e4] bg-white shadow-[0_18px_50px_-40px_rgba(18,49,54,0.45)]">
            <div className="flex items-center justify-between border-b border-[#e3ece9] px-5 py-5 sm:px-6">
              <div>
                <h2 className="text-lg font-bold tracking-[-0.025em] text-[#17343a]">
                  Consultation history
                </h2>
                <p className="mt-1 text-sm text-[#72868a]">
                  Completed and cancelled consultations.
                </p>
              </div>

              <span className="rounded-full bg-[#f1f4f3] px-3 py-1.5 text-xs font-bold text-[#677c80]">
                {historyConsults.length} records
              </span>
            </div>

            <div className="divide-y divide-[#e6eeeb]">
              {historyConsults.map((consult) => (
                <ConsultRow
                  key={consult.id}
                  consult={consult}
                  isChildView={isChildView}
                  expanded={expandedId === consult.id}
                  onToggle={() => setExpandedId(expandedId === consult.id ? null : consult.id)}
                  prescriptions={getPrescriptions(consult.id)}
                  onEdit={() => openEdit(consult)}
                  onCheckIn={() => { }}
                  onCancel={() => { }}
                  onJoin={() => handleJoin(consult)}
                  onComplete={() => { }}
                  onDelete={() => {
                    if (isChildView) {
                      toast.error(
                        "You do not have permission to manage telehealth consultations.",
                      );
                      return;
                    }

                    if (
                      window.confirm(
                        "Permanently delete this consultation and its prescriptions?",
                      )
                    ) {
                      deleteConsult.mutate(consult);
                    }
                  }}
                  onUploadRx={() => {
                    if (isChildView) {
                      toast.error(
                        "You do not have permission to manage telehealth consultations.",
                      );
                      return;
                    }

                    setUploadConsult(consult);
                  }}
                  onOpenRx={openPrescription}
                  onDeleteRx={(prescription) => {
                    if (
                      window.confirm(
                        `Delete ${prescription.file_name ?? "this prescription"}?`,
                      )
                    ) {
                      deletePrescription.mutate(prescription);
                    }
                  }}
                  nowMs={nowMs}
                />
              ))}
            </div>
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#dce8e4] bg-[#f8fbfa] p-6">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e2f1ec] text-[#176c60]">
                <ShieldAlert className="size-5" />
              </span>

              <div>
                <h2 className="text-base font-bold text-[#29484e]">Private meeting access</h2>
                <p className="mt-2 text-sm leading-6 text-[#6b8084]">
                  Meeting links open in a separate browser tab. Share the link only with the doctor
                  and trusted members of the care circle.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#e4d8ce] bg-[#fbf7f2] p-6">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f3e4d7] text-[#9c6338]">
                <Stethoscope className="size-5" />
              </span>

              <div>
                <h2 className="text-base font-bold text-[#3d3c35]">Not for urgent emergencies</h2>
                <p className="mt-2 text-sm leading-6 text-[#756d64]">
                  Use emergency services or SOS controls for chest pain, severe breathing trouble,
                  loss of consciousness or rapidly worsening symptoms.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <Dialog
        open={scheduleOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeSchedule();
          } else {
            setScheduleOpen(true);
          }
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[1.5rem] border-[#dce7e3] p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-[#e3ece9] px-6 py-5 text-left">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e7f2ee] text-[#176f69]">
                <Video className="size-5" />
              </span>

              <div>
                <DialogTitle className="text-xl font-bold tracking-[-0.03em] text-[#17343a]">
                  {editingConsult ? "Edit consultation" : "Schedule consultation"}
                </DialogTitle>
                <p className="mt-1.5 text-sm leading-6 text-[#71858a]">
                  Enter the doctor, reason and meeting details. A private Jitsi room is created when
                  no meeting link is supplied.
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vc-doctor" className="font-semibold text-[#29484e]">
                  Doctor name <span className="text-[#b34f49]">*</span>
                </Label>
                <Input
                  id="vc-doctor"
                  value={doctorName}
                  onChange={(event) => setDoctorName(event.target.value)}
                  placeholder="e.g. Sharma"
                  maxLength={120}
                  className="h-11 rounded-xl border-[#d8e4e0] bg-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vc-specialty" className="font-semibold text-[#29484e]">
                  Specialty <span className="font-normal text-[#849599]">(optional)</span>
                </Label>
                <Input
                  id="vc-specialty"
                  value={specialty}
                  onChange={(event) => setSpecialty(event.target.value)}
                  placeholder="e.g. Diabetologist"
                  maxLength={80}
                  className="h-11 rounded-xl border-[#d8e4e0] bg-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vc-reason" className="font-semibold text-[#29484e]">
                Consultation reason <span className="text-[#b34f49]">*</span>
              </Label>
              <Input
                id="vc-reason"
                value={consultReason}
                onChange={(event) => setConsultReason(event.target.value)}
                placeholder="e.g. Diabetes follow-up"
                maxLength={200}
                className="h-11 rounded-xl border-[#d8e4e0] bg-white"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vc-date" className="font-semibold text-[#29484e]">
                  Date <span className="text-[#b34f49]">*</span>
                </Label>
                <DateInput
                  id="vc-date"
                  value={consultDate}
                  min={todayString()}
                  onChange={setConsultDate}
                  placeholder="YYYY-MM-DD"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vc-time" className="font-semibold text-[#29484e]">
                  Time <span className="text-[#b34f49]">*</span>
                </Label>
                <TimeInput
                  id="vc-time"
                  value={consultTime}
                  onChange={setConsultTime}
                  placeholder="HH:MM"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vc-meeting-link" className="font-semibold text-[#29484e]">
                Meeting link <span className="font-normal text-[#849599]">(optional)</span>
              </Label>
              <Input
                id="vc-meeting-link"
                type="url"
                value={meetingUrl}
                onChange={(event) => setMeetingUrl(event.target.value)}
                placeholder="https://meet.google.com/... or Zoom link"
                maxLength={500}
                className="h-11 rounded-xl border-[#d8e4e0] bg-white"
              />
              <p className="text-xs leading-5 text-[#7a8e92]">
                Paste the doctor&apos;s secure link or leave this blank to generate a Jitsi room.
              </p>
            </div>

            <div className="rounded-2xl border border-[#dfe9e6] bg-[#f8fbfa] p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label
                    htmlFor="vc-reminder"
                    className="flex items-center gap-2 font-semibold text-[#29484e]"
                  >
                    <BellRing className="size-4 text-[#176f69]" />
                    Consultation reminder
                  </Label>
                  <p className="mt-1 text-xs leading-5 text-[#74898d]">
                    Notify the parent and linked family members before the visit.
                  </p>
                </div>

                <Switch
                  id="vc-reminder"
                  checked={reminderEnabled}
                  onCheckedChange={setReminderEnabled}
                />
              </div>

              {reminderEnabled && (
                <div className="mt-4 space-y-2 border-t border-[#e2ebe8] pt-4">
                  <Label htmlFor="vc-reminder-time" className="font-semibold text-[#29484e]">
                    Reminder time
                  </Label>
                  <Select
                    value={reminderMinutesBefore}
                    onValueChange={setReminderMinutesBefore}
                  >
                    <SelectTrigger
                      id="vc-reminder-time"
                      className="h-11 rounded-xl border-[#d8e4e0] bg-white"
                    >
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

            <div className="space-y-2">
              <Label htmlFor="vc-notes" className="font-semibold text-[#29484e]">
                Preparation notes <span className="font-normal text-[#849599]">(optional)</span>
              </Label>
              <Textarea
                id="vc-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="e.g. Patient recently switched insulin dosage"
                rows={4}
                maxLength={400}
                className="min-h-24 resize-none rounded-xl border-[#d8e4e0] bg-white"
              />
            </div>
          </div>

          <DialogFooter className="border-t border-[#e5ecea] px-6 py-5">
            <Button
              type="button"
              variant="outline"
              onClick={closeSchedule}
              disabled={isPending}
              className="h-11 rounded-xl border-[#d6e2de] bg-white px-5 text-[#466267] hover:bg-[#f5f9f7]"
            >
              Cancel
            </Button>

            <Button
              id="btn-submit-consultation"
              type="button"
              disabled={isPending || !activeParentId}
              onClick={() => {
                if (!validateConsult()) {
                  return;
                }

                if (editingConsult) {
                  edit.mutate(editingConsult.id);
                } else {
                  book.mutate();
                }
              }}
              className="h-11 rounded-xl bg-[#0d6665] px-6 text-white hover:bg-[#0a5958]"
            >
              {isPending
                ? editingConsult
                  ? "Saving…"
                  : "Scheduling…"
                : editingConsult
                  ? "Save changes"
                  : "Schedule consultation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(cancelConsultTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setCancelConsultTarget(null);
            setCancelReason("");
          }
        }}
      >
        <DialogContent className="rounded-[1.5rem] border-[#dce7e3] p-0 sm:max-w-md">
          <DialogHeader className="border-b border-[#e3ece9] px-6 py-5 text-left">
            <DialogTitle className="text-xl font-bold tracking-[-0.03em] text-[#17343a]">
              Cancel consultation
            </DialogTitle>
            <p className="mt-1.5 text-sm leading-6 text-[#71858a]">
              Add a clear reason so linked family members understand the change.
            </p>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
            {cancelConsultTarget && (
              <div className="rounded-xl border border-[#ecd8d4] bg-[#fff7f5] px-4 py-3 text-sm text-[#8e4e49]">
                <p className="font-bold">{displayDoctorName(cancelConsultTarget.doctor_name)}</p>
                <p className="mt-1 text-xs text-[#9b6661]">
                  {formatDisplayDate(cancelConsultTarget.consultation_date)} ·{" "}
                  {formatDisplayTime(cancelConsultTarget.consultation_time)}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="vc-cancel-reason" className="font-semibold text-[#29484e]">
                Cancellation reason <span className="text-[#b34f49]">*</span>
              </Label>
              <Textarea
                id="vc-cancel-reason"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="e.g. Doctor requested a new date"
                maxLength={300}
                rows={4}
                className="min-h-24 resize-none rounded-xl border-[#d8e4e0] bg-white"
              />
            </div>
          </div>

          <DialogFooter className="border-t border-[#e5ecea] px-6 py-5">
            <Button
              type="button"
              variant="outline"
              disabled={cancelConsult.isPending}
              onClick={() => {
                setCancelConsultTarget(null);
                setCancelReason("");
              }}
              className="h-11 rounded-xl border-[#d6e2de] bg-white px-5"
            >
              Keep consultation
            </Button>

            <Button
              type="button"
              disabled={cancelConsult.isPending || cancelReason.trim().length < 3}
              onClick={() => {
                if (!cancelConsultTarget) {
                  return;
                }

                if (cancelReason.trim().length < 3) {
                  toast.error("Please enter a cancellation reason.");
                  return;
                }

                cancelConsult.mutate({
                  id: cancelConsultTarget.id,
                  reason: cancelReason,
                });
              }}
              className="h-11 rounded-xl bg-[#aa4e48] px-5 text-white hover:bg-[#95413c]"
            >
              {cancelConsult.isPending ? "Cancelling…" : "Cancel consultation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(uploadConsult)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeUpload();
          }
        }}
      >
        <DialogContent className="rounded-[1.5rem] border-[#dce7e3] p-0 sm:max-w-md">
          <DialogHeader className="border-b border-[#e3ece9] px-6 py-5 text-left">
            <DialogTitle className="text-xl font-bold tracking-[-0.03em] text-[#17343a]">
              Upload prescription
            </DialogTitle>
            <p className="mt-1.5 text-sm leading-6 text-[#71858a]">
              Add the prescription or medical instructions received after the consultation.
            </p>
          </DialogHeader>

          {uploadConsult && (
            <div className="space-y-5 px-6 py-5">
              <div className="rounded-xl border border-[#dfe8e5] bg-[#f8fbfa] px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7d9094]">
                  Consultation
                </p>
                <p className="mt-1 text-sm font-bold text-[#29484e]">
                  {displayDoctorName(uploadConsult.doctor_name)}
                </p>
                {uploadConsult.consultation_reason && (
                  <p className="mt-1 text-xs text-[#75898d]">
                    {uploadConsult.consultation_reason}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="font-semibold text-[#29484e]">
                  Prescription file <span className="text-[#b34f49]">*</span>
                </Label>

                <label
                  htmlFor="rx-file"
                  className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#cbdcd6] bg-[#fbfdfc] px-5 py-8 text-center transition hover:border-[#8eb9ad] hover:bg-[#f4f9f7]"
                >
                  <span className="grid size-11 place-items-center rounded-xl bg-[#e7f2ee] text-[#176f69]">
                    <Upload className="size-5" />
                  </span>

                  {uploadFile ? (
                    <>
                      <span className="mt-4 max-w-full break-all text-sm font-bold text-[#29484e]">
                        {uploadFile.name}
                      </span>
                      <span className="mt-1 text-xs text-[#7a8d91]">
                        {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="mt-4 text-sm font-bold text-[#35565b]">
                        Select a prescription file
                      </span>
                      <span className="mt-1 text-xs text-[#7a8d91]">
                        PDF, JPG or PNG · maximum 25 MB
                      </span>
                    </>
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
                <div className="space-y-2 rounded-xl border border-[#dfe8e5] bg-[#f8fbfa] p-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#5f777b]">
                    <span>Uploading securely</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="border-t border-[#e5ecea] px-6 py-5">
            <Button
              type="button"
              variant="outline"
              onClick={closeUpload}
              disabled={uploadPrescription.isPending}
              className="h-11 rounded-xl border-[#d6e2de] bg-white px-5"
            >
              Cancel
            </Button>

            <Button
              id="btn-submit-prescription"
              type="button"
              disabled={!uploadFile || uploadPrescription.isPending}
              onClick={() => uploadPrescription.mutate()}
              className="h-11 rounded-xl bg-[#0d6665] px-5 text-white hover:bg-[#0a5958]"
            >
              {uploadPrescription.isPending ? "Uploading…" : "Upload prescription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function ConsultMetric({
  icon: Icon,
  label,
  value,
  detail,
  iconClass,
  last = false,
}: {
  icon: typeof Video;
  label: string;
  value: string;
  detail: string;
  iconClass: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-4 px-5 py-5 sm:px-6 ${last ? "" : "border-b border-[#e2ebe8] sm:border-r xl:border-b-0"
        }`}
    >
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${iconClass}`}>
        <Icon className="size-5" />
      </span>

      <div className="min-w-0">
        <p className="truncate text-xs font-bold uppercase tracking-[0.11em] text-[#7b8f93]">
          {label}
        </p>
        <p className="mt-1 text-xl font-bold tracking-[-0.035em] text-[#17343a]">{value}</p>
        <p className="mt-0.5 truncate text-xs text-[#768a8e]">{detail}</p>
      </div>
    </div>
  );
}

function ConsultLoadingState() {
  return (
    <div className="space-y-1 p-5 sm:p-6">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex animate-pulse items-center gap-4 rounded-xl px-1 py-4">
          <div className="size-12 rounded-xl bg-[#edf2f0]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 rounded bg-[#e8efed]" />
            <div className="h-3 w-56 rounded bg-[#f0f4f3]" />
          </div>
          <div className="h-9 w-24 rounded-xl bg-[#e8efed]" />
        </div>
      ))}
    </div>
  );
}

function ConsultEmptyState({
  isChildView,
  onSchedule,
}: {
  isChildView: boolean;
  onSchedule: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-[#e7f2ee] text-[#176f69]">
        <Video className="size-6" />
      </span>

      <h3 className="mt-5 text-lg font-bold text-[#1c3b41]">No upcoming consultation</h3>

      <p className="mt-2 max-w-md text-sm leading-6 text-[#71868a]">
        {isChildView
          ? "No video consultations are currently scheduled for this profile."
          : "Schedule a secure doctor consultation and keep the meeting, reminders and prescription in one place."}
      </p>

      {!isChildView && (
        <Button
          type="button"
          onClick={onSchedule}
          className="mt-6 h-11 rounded-xl bg-[#0d6665] px-5 text-white hover:bg-[#0a5958]"
        >
          <Plus className="size-4" />
          Schedule consultation
        </Button>
      )}
    </div>
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
  onOpenRx: (prescription: Prescription) => void;
  onDeleteRx: (prescription: Prescription) => void;
  nowMs: number;
}) {
  const canEdit = !isChildView && EDITABLE.includes(c.status);
  const canCheckIn = !isChildView && ["scheduled", "pending"].includes(c.status);
  const canCancel = !isChildView && CANCELLABLE.includes(c.status);
  const canComplete = !isChildView && c.status === "in_progress";
  const canDelete =
    !isChildView && (c.status === "completed" || c.status === "cancelled");
  const scheduledMs = getConsultTime(c);
  const joinAvailable =
    c.status === "in_progress" ||
    scheduledMs === 0 ||
    nowMs >= scheduledMs - JOIN_EARLY_MINUTES * 60 * 1000;
  const checkInAvailable =
    scheduledMs === 0 ||
    nowMs >= scheduledMs - JOIN_EARLY_MINUTES * 60 * 1000;
  const canJoin = JOINABLE.includes(c.status) && Boolean(c.meeting_url);
  const canUpload =
    !isChildView && (c.status === "completed" || c.status === "in_progress");
  const isActive = c.status === "in_progress" || c.status === "waiting";
  const isPastDue =
    !["completed", "cancelled", "in_progress"].includes(c.status) &&
    scheduledMs > 0 &&
    nowMs > scheduledMs;

  return (
    <article
      className={`px-5 py-5 transition-colors hover:bg-[#fbfdfc] sm:px-6 ${isActive ? "border-l-4 border-l-[#2f8d78]" : ""
        }`}
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 gap-4">
          <div
            className={`grid size-12 shrink-0 place-items-center rounded-xl ${isActive
                ? "bg-[#e2f1ec] text-[#176c60]"
                : "bg-[#e8f1f4] text-[#3e687b]"
              }`}
          >
            <Video className="size-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold tracking-[-0.02em] text-[#203f45]">
                {displayDoctorName(c.doctor_name)}
              </h3>

              {c.specialty && (
                <span className="text-sm text-[#71868a]">· {c.specialty}</span>
              )}

              <StatusBadge status={c.status} />

              {isPastDue && (
                <span className="inline-flex items-center rounded-full bg-[#f8e8e6] px-2.5 py-1 text-[11px] font-bold text-[#a54e49]">
                  Past due
                </span>
              )}
            </div>

            {c.consultation_reason && (
              <p className="mt-1.5 text-sm leading-5 text-[#60777b]">
                {c.consultation_reason}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-[#74898d]">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5 text-[#4e777b]" />
                {formatDisplayDate(c.consultation_date)}
              </span>

              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-3.5 text-[#4e777b]" />
                {formatDisplayTime(c.consultation_time)}
              </span>

              {prescriptions.length > 0 && (
                <span className="inline-flex items-center gap-1.5 font-semibold text-[#426985]">
                  <FileText className="size-3.5" />
                  {prescriptions.length} prescription{prescriptions.length === 1 ? "" : "s"}
                </span>
              )}
            </div>

            {c.notes && (
              <div className="mt-3 rounded-xl border border-[#e1e9e7] bg-[#f8fbfa] px-4 py-3 text-xs leading-5 text-[#62797d]">
                <span className="font-bold text-[#405f64]">Preparation note:</span> {c.notes}
              </div>
            )}

            {c.reminder_enabled && !["completed", "cancelled"].includes(c.status) && (
              <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#3e7180]">
                <BellRing className="size-3.5" />
                Family reminder{" "}
                {c.reminder_minutes_before >= 1440
                  ? "1 day"
                  : c.reminder_minutes_before >= 60
                    ? `${c.reminder_minutes_before / 60} hour${c.reminder_minutes_before === 60 ? "" : "s"
                    }`
                    : `${c.reminder_minutes_before} minutes`}{" "}
                before
              </p>
            )}

            {c.status === "cancelled" && c.cancellation_reason && (
              <div className="mt-3 rounded-xl border border-[#ecd8d4] bg-[#fff7f5] px-4 py-3 text-xs leading-5 text-[#95524d]">
                <span className="font-bold">Cancellation reason:</span>{" "}
                {c.cancellation_reason}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-[#e7eeec] pt-4 xl:min-w-[250px] xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
          <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
            {canCheckIn && (
              <Button
                id={`btn-check-in-${c.id}`}
                type="button"
                variant="outline"
                disabled={!checkInAvailable}
                onClick={onCheckIn}
                title={
                  checkInAvailable
                    ? "Check in for the consultation"
                    : `Check-in opens ${JOIN_EARLY_MINUTES} minutes before the consultation`
                }
                className="h-10 flex-1 rounded-xl border-[#cfded9] bg-white px-4 text-sm font-semibold text-[#405f64] hover:bg-[#f4f8f6] xl:w-full"
              >
                <LogIn className="size-4" />
                Check in
              </Button>
            )}

            {canJoin && (
              <Button
                id={`btn-join-${c.id}`}
                type="button"
                disabled={!joinAvailable}
                onClick={onJoin}
                title={
                  joinAvailable
                    ? "Open consultation"
                    : `Available ${JOIN_EARLY_MINUTES} minutes before the consultation`
                }
                className="h-10 flex-1 rounded-xl bg-[#0d6665] px-4 text-sm font-semibold text-white hover:bg-[#0a5958] xl:w-full"
              >
                <ExternalLink className="size-4" />
                {joinAvailable ? "Join consultation" : "Not open yet"}
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1 xl:justify-end">
            {canEdit && (
              <button
                id={`btn-edit-${c.id}`}
                type="button"
                onClick={onEdit}
                className="grid size-9 place-items-center rounded-lg text-[#708488] transition hover:bg-[#edf3f1] hover:text-[#294c51]"
                title="Edit consultation"
                aria-label="Edit consultation"
              >
                <Pencil className="size-4" />
              </button>
            )}

            {canCancel && (
              <button
                id={`btn-cancel-${c.id}`}
                type="button"
                onClick={onCancel}
                className="grid size-9 place-items-center rounded-lg text-[#8a7770] transition hover:bg-[#fbf1e8] hover:text-[#9a5e38]"
                title="Cancel consultation"
                aria-label="Cancel consultation"
              >
                <XCircle className="size-4" />
              </button>
            )}

            {canComplete && (
              <button
                id={`btn-complete-${c.id}`}
                type="button"
                onClick={onComplete}
                className="grid size-9 place-items-center rounded-lg text-[#66827a] transition hover:bg-[#e6f2ed] hover:text-[#176c60]"
                title="Mark consultation completed"
                aria-label="Mark consultation completed"
              >
                <CheckCircle2 className="size-4" />
              </button>
            )}

            {canDelete && (
              <button
                id={`btn-delete-${c.id}`}
                type="button"
                onClick={onDelete}
                className="grid size-9 place-items-center rounded-lg text-[#8c7774] transition hover:bg-[#fff0ee] hover:text-[#a54e49]"
                title="Delete consultation"
                aria-label="Delete consultation"
              >
                <Trash2 className="size-4" />
              </button>
            )}

            {canUpload && (
              <button
                id={`btn-upload-rx-${c.id}`}
                type="button"
                onClick={onUploadRx}
                className="grid size-9 place-items-center rounded-lg text-[#657d86] transition hover:bg-[#e9f1f4] hover:text-[#3e687b]"
                title="Upload prescription"
                aria-label="Upload prescription"
              >
                <Upload className="size-4" />
              </button>
            )}

            {prescriptions.length > 0 && (
              <button
                type="button"
                onClick={onToggle}
                className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-[#657b80] transition hover:bg-[#edf3f1] hover:text-[#294c51]"
                title={expanded ? "Hide prescriptions" : "View prescriptions"}
              >
                {expanded ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
                Prescriptions
              </button>
            )}
          </div>
        </div>
      </div>

      {expanded && prescriptions.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-[#dfe8e5] bg-[#f8fbfa]">
          <div className="border-b border-[#e1e9e7] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[#71868a]">
            Consultation prescriptions
          </div>

          <div className="divide-y divide-[#e1e9e7]">
            {prescriptions.map((prescription) => {
              const isImage = prescription.file_type?.startsWith("image/");

              return (
                <div
                  key={prescription.id}
                  className="flex items-center gap-3 px-4 py-3.5"
                >
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-lg ${isImage
                        ? "bg-[#e8f1f4] text-[#3e687b]"
                        : "bg-[#edf2f0] text-[#5d7478]"
                      }`}
                  >
                    {isImage ? (
                      <Stethoscope className="size-4" />
                    ) : (
                      <FileText className="size-4" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[#29484e]">
                      {prescription.file_name ?? "Prescription"}
                    </p>
                    <p className="mt-0.5 text-xs text-[#7a8d91]">
                      {format(new Date(prescription.uploaded_at), "MMM d, yyyy")}
                      {prescription.file_size
                        ? ` · ${(prescription.file_size / 1024 / 1024).toFixed(2)} MB`
                        : ""}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenRx(prescription)}
                    className="grid size-9 place-items-center rounded-lg text-[#3e687b] transition hover:bg-[#e8f1f4]"
                    title="Open prescription"
                    aria-label="Open prescription"
                  >
                    <Download className="size-4" />
                  </button>

                  {!isChildView && (
                    <button
                      type="button"
                      onClick={() => onDeleteRx(prescription)}
                      className="grid size-9 place-items-center rounded-lg text-[#8c7774] transition hover:bg-[#fff0ee] hover:text-[#a54e49]"
                      title="Delete prescription"
                      aria-label="Delete prescription"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
}