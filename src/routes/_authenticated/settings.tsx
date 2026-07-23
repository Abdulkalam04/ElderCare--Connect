import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Accessibility,
  Bell,
  CheckCircle2,
  KeyRound,
  Loader2,
  LockKeyhole,
  MessageSquareWarning,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldAlert,
  Smartphone,
  UserRound,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { EditableAvatar } from "@/components/EditableAvatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useActiveParent, useCurrentUser, useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushPermission,
  isPushSupported,
} from "@/lib/push";
export const Route = createFileRoute("/_authenticated/settings")({
  ssr: false,
  component: SettingsPage,
});
type ContactMethod = "phone" | "email" | "push";
type AppLanguage = "en" | "hi";
type ElderSettings = {
  parent_id: string;
  notify_email: boolean;
  notify_push: boolean;
  notify_sms: boolean;
  push_sos_enabled: boolean;
  push_medicine_enabled: boolean;
  push_wellbeing_enabled: boolean;
  push_appointments_enabled: boolean;
  push_caregiver_enabled: boolean;
  push_transport_enabled: boolean;
  push_video_enabled: boolean;
  push_emergency_detection_enabled: boolean;
  push_health_risk_enabled: boolean;
  push_companion_safety_enabled: boolean;
  med_reminders_enabled: boolean;
  med_reminder_lead_minutes: number;
  med_voice_reminders: boolean;
  appointment_reminders_enabled: boolean;
  wellbeing_reminders_enabled: boolean;
  emergency_detection_enabled: boolean;
  detect_missed_medicine: boolean;
  detect_missed_checkin: boolean;
  detect_no_app_activity: boolean;
  wellbeing_checkin_cutoff: string;
  no_app_activity_hours: number;
  health_risk_alerts_enabled: boolean;
  sos_escalation_minutes: number;
  sos_auto_call_primary: boolean;
  sos_share_location: boolean;
  preferred_contact_method: ContactMethod;
  language: AppLanguage;
  large_text: boolean;
  high_contrast: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  companion_auto_read_responses: boolean;
  companion_emergency_escalation_enabled: boolean;
};
type ProfileForm = {
  fullName: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  medicalConditions: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};
const DEFAULT_VALUES: Omit<ElderSettings, "parent_id"> = {
  notify_email: true,
  notify_push: true,
  notify_sms: false,
  push_sos_enabled: true,
  push_medicine_enabled: true,
  push_wellbeing_enabled: true,
  push_appointments_enabled: true,
  push_caregiver_enabled: true,
  push_transport_enabled: true,
  push_video_enabled: true,
  push_emergency_detection_enabled: true,
  push_health_risk_enabled: true,
  push_companion_safety_enabled: true,
  med_reminders_enabled: true,
  med_reminder_lead_minutes: 10,
  med_voice_reminders: false,
  appointment_reminders_enabled: true,
  wellbeing_reminders_enabled: true,
  emergency_detection_enabled: true,
  detect_missed_medicine: true,
  detect_missed_checkin: true,
  detect_no_app_activity: true,
  wellbeing_checkin_cutoff: "20:00",
  no_app_activity_hours: 24,
  health_risk_alerts_enabled: true,
  sos_escalation_minutes: 5,
  sos_auto_call_primary: false,
  sos_share_location: true,
  preferred_contact_method: "phone",
  language: "en",
  large_text: false,
  high_contrast: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
  companion_auto_read_responses: false,
  companion_emergency_escalation_enabled: false,
};
const emptyProfileForm: ProfileForm = {
  fullName: "",
  phone: "",
  dateOfBirth: "",
  address: "",
  medicalConditions: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
};
function normalizeTime(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 5) return null;
  return value.slice(0, 5);
}
function normalizeSettings(value: Record<string, unknown> | null, parentId: string): ElderSettings {
  return {
    parent_id: parentId,
    notify_email: value?.notify_email !== false,
    notify_push: value?.notify_push !== false,
    notify_sms: value?.notify_sms === true,
    push_sos_enabled: value?.push_sos_enabled !== false,
    push_medicine_enabled: value?.push_medicine_enabled !== false,
    push_wellbeing_enabled: value?.push_wellbeing_enabled !== false,
    push_appointments_enabled: value?.push_appointments_enabled !== false,
    push_caregiver_enabled: value?.push_caregiver_enabled !== false,
    push_transport_enabled: value?.push_transport_enabled !== false,
    push_video_enabled: value?.push_video_enabled !== false,
    push_emergency_detection_enabled: value?.push_emergency_detection_enabled !== false,
    push_health_risk_enabled: value?.push_health_risk_enabled !== false,
    push_companion_safety_enabled: value?.push_companion_safety_enabled !== false,
    med_reminders_enabled: value?.med_reminders_enabled !== false,
    med_reminder_lead_minutes: Number.isFinite(Number(value?.med_reminder_lead_minutes))
      ? Math.min(120, Math.max(0, Number(value?.med_reminder_lead_minutes)))
      : DEFAULT_VALUES.med_reminder_lead_minutes,
    med_voice_reminders: value?.med_voice_reminders === true,
    appointment_reminders_enabled: value?.appointment_reminders_enabled !== false,
    wellbeing_reminders_enabled: value?.wellbeing_reminders_enabled !== false,
    emergency_detection_enabled: value?.emergency_detection_enabled !== false,
    detect_missed_medicine: value?.detect_missed_medicine !== false,
    detect_missed_checkin: value?.detect_missed_checkin !== false,
    detect_no_app_activity: value?.detect_no_app_activity !== false,
    wellbeing_checkin_cutoff:
      normalizeTime(value?.wellbeing_checkin_cutoff) ?? DEFAULT_VALUES.wellbeing_checkin_cutoff,
    no_app_activity_hours: Number.isFinite(Number(value?.no_app_activity_hours))
      ? Math.min(168, Math.max(6, Number(value?.no_app_activity_hours)))
      : DEFAULT_VALUES.no_app_activity_hours,
    health_risk_alerts_enabled: value?.health_risk_alerts_enabled !== false,
    sos_escalation_minutes: Number.isFinite(Number(value?.sos_escalation_minutes))
      ? Math.min(60, Math.max(1, Number(value?.sos_escalation_minutes)))
      : DEFAULT_VALUES.sos_escalation_minutes,
    sos_auto_call_primary: value?.sos_auto_call_primary === true,
    sos_share_location: value?.sos_share_location !== false,
    preferred_contact_method: ["phone", "email", "push"].includes(
      String(value?.preferred_contact_method),
    )
      ? (value?.preferred_contact_method as ContactMethod)
      : "phone",
    language: value?.language === "hi" ? "hi" : "en",
    large_text: value?.large_text === true,
    high_contrast: value?.high_contrast === true,
    quiet_hours_start: normalizeTime(value?.quiet_hours_start),
    quiet_hours_end: normalizeTime(value?.quiet_hours_end),
    companion_auto_read_responses: value?.companion_auto_read_responses === true,
    companion_emergency_escalation_enabled: value?.companion_emergency_escalation_enabled === true,
  };
}
function validatePhone(value: string, label: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (!/^\+?[0-9\s()-]{7,30}$/.test(trimmed) || digits.length < 7 || digits.length > 15) {
    throw new Error(`${label} must contain between 7 and 15 digits.`);
  }
  return trimmed;
}
function applyAccessibility(
  settings: Pick<ElderSettings, "large_text" | "high_contrast" | "language">,
) {
  document.documentElement.classList.toggle("large-text", settings.large_text);
  document.documentElement.classList.toggle("high-contrast", settings.high_contrast);
  document.documentElement.lang = settings.language;
}
function SettingsPage() {
  const { activeParentId, activeParent, isChildView } = useActiveParent();
  const { data: currentUser } = useCurrentUser();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfileForm);
  const [form, setForm] = useState<ElderSettings | null>(null);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported",
  );
  const [testingPush, setTestingPush] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  useEffect(() => {
    if (!profile) return;
    setProfileForm({
      fullName: profile.full_name ?? "",
      phone: profile.phone ?? "",
      dateOfBirth: profile.date_of_birth ?? "",
      address: profile.address ?? "",
      medicalConditions: profile.medical_conditions ?? "",
      emergencyContactName: profile.emergency_contact_name ?? "",
      emergencyContactPhone: profile.emergency_contact_phone ?? "",
    });
  }, [profile]);
  useEffect(() => {
    setPushPermission(getPushPermission());
  }, []);
  const settingsQuery = useQuery({
    queryKey: ["elder_settings", activeParentId],
    enabled: !!activeParentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("elder_settings")
        .select("*")
        .eq("parent_id", activeParentId!)
        .maybeSingle();
      if (error) throw new Error(error.message ?? "Failed to load settings.");
      return normalizeSettings((data ?? null) as Record<string, unknown> | null, activeParentId!);
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (!settingsQuery.data) return;
    setForm(settingsQuery.data);
    applyAccessibility(settingsQuery.data);
  }, [settingsQuery.data]);
  useEffect(() => {
    if (!activeParentId) return;
    const channel = supabase
      .channel(`elder-settings-${activeParentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "elder_settings",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["elder_settings", activeParentId] });
          void qc.invalidateQueries({ queryKey: ["global_elder_settings", activeParentId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeParentId, qc]);
  const settingsDirty = useMemo(() => {
    if (!form || !settingsQuery.data) return false;
    return JSON.stringify(form) !== JSON.stringify(settingsQuery.data);
  }, [form, settingsQuery.data]);
  const profileDirty = useMemo(() => {
    if (!profile) return false;
    return (
      profileForm.fullName.trim() !== (profile.full_name ?? "") ||
      profileForm.phone.trim() !== (profile.phone ?? "") ||
      profileForm.dateOfBirth !== (profile.date_of_birth ?? "") ||
      profileForm.address.trim() !== (profile.address ?? "") ||
      profileForm.medicalConditions.trim() !== (profile.medical_conditions ?? "") ||
      profileForm.emergencyContactName.trim() !== (profile.emergency_contact_name ?? "") ||
      profileForm.emergencyContactPhone.trim() !== (profile.emergency_contact_phone ?? "")
    );
  }, [profile, profileForm]);
  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!settingsDirty && !profileDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [profileDirty, settingsDirty]);
  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!currentUser?.id) throw new Error("You are not signed in.");
      const fullName = profileForm.fullName.trim();
      if (fullName.length < 2) throw new Error("Full name must contain at least 2 characters.");
      const phone = validatePhone(profileForm.phone, "Phone number");
      const emergencyPhone = validatePhone(
        profileForm.emergencyContactPhone,
        "Fallback emergency phone number",
      );
      if (profileForm.dateOfBirth) {
        const selectedDate = new Date(`${profileForm.dateOfBirth}T00:00:00`);
        if (!Number.isFinite(selectedDate.getTime()) || selectedDate > new Date()) {
          throw new Error("Date of birth cannot be in the future.");
        }
      }
      if (profile?.role === "parent") {
        const hasFallbackName = !!profileForm.emergencyContactName.trim();
        const hasFallbackPhone = !!emergencyPhone;
        if (hasFallbackName !== hasFallbackPhone) {
          throw new Error(
            "Enter both the fallback emergency contact name and phone number, or leave both empty.",
          );
        }
      }
      const payload: TablesUpdate<"profiles"> = {
        full_name: fullName,
        phone,
      };
      if (profile?.role === "parent") {
        payload.date_of_birth = profileForm.dateOfBirth || null;
        payload.address = profileForm.address.trim() || null;
        payload.medical_conditions = profileForm.medicalConditions.trim() || null;
        payload.emergency_contact_name = profileForm.emergencyContactName.trim() || null;
        payload.emergency_contact_phone = emergencyPhone;
      }
      const { data, error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", currentUser.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data)
        throw new Error("Your profile could not be updated. Check your account permissions.");
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["profile", currentUser?.id] }),
        qc.invalidateQueries({ queryKey: ["myProfile", currentUser?.id] }),
        qc.invalidateQueries({ queryKey: ["linkedChildren"] }),
        qc.invalidateQueries({ queryKey: ["linkedParents"] }),
      ]);
      toast.success("Profile updated successfully.");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update profile."),
  });
  const saveSettings = useMutation({
    mutationFn: async (values: ElderSettings) => {
      if (!activeParentId) throw new Error("No care-recipient account is selected.");
      if (values.med_reminder_lead_minutes < 0 || values.med_reminder_lead_minutes > 120) {
        throw new Error("Missed-dose grace period must be between 0 and 120 minutes.");
      }
      if (values.no_app_activity_hours < 6 || values.no_app_activity_hours > 168) {
        throw new Error("No-app-activity threshold must be between 6 and 168 hours.");
      }
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(values.wellbeing_checkin_cutoff)) {
        throw new Error("Choose a valid wellbeing check-in cutoff time.");
      }
      if (values.sos_escalation_minutes < 1 || values.sos_escalation_minutes > 60) {
        throw new Error("SOS escalation time must be between 1 and 60 minutes.");
      }
      const hasQuietStart = !!values.quiet_hours_start;
      const hasQuietEnd = !!values.quiet_hours_end;
      if (hasQuietStart !== hasQuietEnd) {
        throw new Error("Choose both quiet-hours start and end times.");
      }
      if (
        values.quiet_hours_start &&
        values.quiet_hours_end &&
        values.quiet_hours_start === values.quiet_hours_end
      ) {
        throw new Error("Quiet-hours start and end times must be different.");
      }
      if (values.preferred_contact_method === "email" && !values.notify_email) {
        throw new Error(
          "Enable email notifications before selecting Email as the preferred method.",
        );
      }
      if (values.preferred_contact_method === "push" && !values.notify_push) {
        throw new Error("Enable push notifications before selecting Push as the preferred method.");
      }
      const payload: ElderSettings = {
        ...values,
        parent_id: activeParentId,
        notify_sms: false,
      };
      const { data, error } = await supabase
        .from("elder_settings")
        .upsert(payload, { onConflict: "parent_id" })
        .select("*")
        .single();
      if (error) throw new Error(error.message ?? "Failed to save settings.");
      return normalizeSettings(data as Record<string, unknown>, activeParentId);
    },
    onSuccess: async (saved) => {
      setForm(saved);
      applyAccessibility(saved);
      qc.setQueryData(["elder_settings", activeParentId], saved);
      qc.setQueryData(["global_elder_settings", activeParentId], saved);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["elder_settings", activeParentId] }),
        qc.invalidateQueries({ queryKey: ["global_elder_settings", activeParentId] }),
        qc.invalidateQueries({ queryKey: ["global_meds", activeParentId] }),
        qc.invalidateQueries({ queryKey: ["global_appointment_alarms", activeParentId] }),
        qc.invalidateQueries({ queryKey: ["companion-settings", activeParentId] }),
      ]);
      toast.success(saved.language === "hi" ? "सेटिंग्स सहेजी गईं।" : "Settings saved.");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save settings."),
  });
  const changePassword = useMutation({
    mutationFn: async () => {
      if (newPassword.length < 8) {
        throw new Error("The new password must contain at least 8 characters.");
      }
      if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
        throw new Error("Use at least one uppercase letter, one lowercase letter, and one number.");
      }
      if (newPassword !== confirmPassword) throw new Error("The passwords do not match.");
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed successfully.");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to change password."),
  });
  const setSetting = <K extends keyof ElderSettings>(key: K, value: ElderSettings[K]) => {
    setForm((current) => {
      if (!current) return current;
      const next = { ...current, [key]: value };
      if (key === "large_text" || key === "high_contrast" || key === "language") {
        applyAccessibility(next);
      }
      return next;
    });
  };
  const handlePushToggle = async (enabled: boolean) => {
    if (!enabled) {
      setSetting("notify_push", false);
      try {
        await disablePushNotifications();
      } finally {
        setPushPermission(getPushPermission());
      }
      toast.success("Push notifications disabled on this device.");
      return;
    }
    if (!isPushSupported()) {
      setSetting("notify_push", false);
      setPushPermission("unsupported");
      toast.error("Push notifications are not supported in this browser.");
      return;
    }
    const result = await enablePushNotifications();
    setPushPermission(getPushPermission());
    if (!result.ok) {
      setSetting("notify_push", false);
      toast.error(result.reason || "Push notification setup failed.");
      return;
    }
    setSetting("notify_push", true);
    toast.success(
      "Push notifications enabled on this device. Save settings to keep this preference.",
    );
  };
  const testBrowserNotification = async () => {
    if (!isPushSupported()) {
      toast.error("Web Push is not supported in this browser.");
      return;
    }
    if (Notification.permission !== "granted") {
      toast.error("Enable browser notification permission first.");
      return;
    }
    if (!form?.notify_push) {
      toast.error("Enable the Push notifications setting first.");
      return;
    }
    setTestingPush(true);
    try {
      const { error } = await supabase.rpc("create_push_test_notification");
      if (error) throw error;
      toast.success(
        "Real push test queued. It uses the database, Edge Function, VAPID, and service worker.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to queue the push test.");
    } finally {
      setTestingPush(false);
    }
  };
  const resetSettings = () => {
    if (!activeParentId) return;
    const defaults: ElderSettings = { parent_id: activeParentId, ...DEFAULT_VALUES };
    setForm(defaults);
    applyAccessibility(defaults);
    toast.info("Default values loaded. Click Save Settings to apply them.");
  };
  const quietHoursEnabled = !!form?.quiet_hours_start && !!form?.quiet_hours_end;
  const selectedPersonName = activeParent?.full_name || "the selected care recipient";
  return (
    <AppShell>
      <div className="mb-6 overflow-hidden rounded-[1.75rem] border border-[#dce8e4] bg-white px-5 py-6 shadow-[0_20px_55px_-42px_rgba(22,55,60,0.45)] sm:px-7 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#e8f3ef] px-3 py-1.5 text-xs font-bold text-[#176f69]">
              <Settings className="size-3.5" />
              Account and care preferences
            </div>
            <h1 className="text-3xl font-bold tracking-[-0.04em] text-[#122f35] sm:text-4xl">Settings</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667d82] sm:text-base">
              Manage your profile and preferences for {selectedPersonName}.
            </p>
          </div>

          {(settingsDirty || profileDirty) && (
            <Badge variant="outline" className="w-fit border-[#e6d0bc] bg-[#fbf3ea] text-[#8e6038]">
              Unsaved changes
            </Badge>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-6">
        <Section
          icon={<UserRound className="size-5" />}
          title="Your profile"
          description={
            isChildView
              ? "These are your own family-monitor account details."
              : "These details identify the care-recipient account throughout the application."
          }
        >
          <div className="flex flex-col items-start gap-6 md:flex-row">
            <div className="flex shrink-0 flex-col items-center gap-2 self-center md:self-start">
              <EditableAvatar size="xl" />
              <span className="text-xs font-medium text-[#75898d]">
                Click the photo to change it
              </span>
            </div>

            <div className="w-full flex-1 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" htmlFor="profile-full-name" required>
                  <Input
                    id="profile-full-name"
                    value={profileForm.fullName}
                    onChange={(event) =>
                      setProfileForm((current) => ({ ...current, fullName: event.target.value }))
                    }
                    maxLength={100}
                    autoComplete="name"
                  />
                </Field>
                <Field label="Phone number" htmlFor="profile-phone">
                  <Input
                    id="profile-phone"
                    type="tel"
                    value={profileForm.phone}
                    onChange={(event) =>
                      setProfileForm((current) => ({ ...current, phone: event.target.value }))
                    }
                    placeholder="+91 98765 43210"
                    maxLength={30}
                    autoComplete="tel"
                  />
                </Field>
              </div>

              {profile?.role === "parent" && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Date of birth" htmlFor="profile-dob">
                      <Input
                        id="profile-dob"
                        type="date"
                        max={format(new Date(), "yyyy-MM-dd")}
                        value={profileForm.dateOfBirth}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            dateOfBirth: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Home address" htmlFor="profile-address">
                      <Input
                        id="profile-address"
                        value={profileForm.address}
                        onChange={(event) =>
                          setProfileForm((current) => ({ ...current, address: event.target.value }))
                        }
                        maxLength={250}
                        autoComplete="street-address"
                      />
                    </Field>
                  </div>

                  <Field label="Medical conditions" htmlFor="profile-medical-conditions">
                    <Textarea
                      id="profile-medical-conditions"
                      value={profileForm.medicalConditions}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          medicalConditions: event.target.value,
                        }))
                      }
                      placeholder="Optional health conditions, allergies, or important notes"
                      maxLength={1000}
                      rows={3}
                    />
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Fallback emergency contact" htmlFor="fallback-contact-name">
                      <Input
                        id="fallback-contact-name"
                        value={profileForm.emergencyContactName}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            emergencyContactName: event.target.value,
                          }))
                        }
                        placeholder="Contact name"
                        maxLength={100}
                      />
                    </Field>
                    <Field label="Fallback emergency phone" htmlFor="fallback-contact-phone">
                      <Input
                        id="fallback-contact-phone"
                        type="tel"
                        value={profileForm.emergencyContactPhone}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            emergencyContactPhone: event.target.value,
                          }))
                        }
                        placeholder="+91 98765 43210"
                        maxLength={30}
                      />
                    </Field>
                  </div>
                </>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <ReadOnlyValue
                  label="Email address"
                  value={profile?.email || currentUser?.email || "—"}
                />
                <ReadOnlyValue
                  label="Account role"
                  value={profile?.role === "parent" ? "Care recipient" : "Family monitor"}
                />
              </div>

              {profile?.created_at && (
                <p className="text-[11px] font-medium text-[#7b8e92]">
                  Member since {format(new Date(profile.created_at), "MMMM d, yyyy")}
                </p>
              )}

              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={updateProfile.isPending || !profileDirty}
                  onClick={() => updateProfile.mutate()}
                >
                  {updateProfile.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Save Profile
                </Button>
              </div>
            </div>
          </div>
        </Section>

        {!activeParentId ? (
          <Alert>
            <ShieldAlert className="size-4" />
            <AlertTitle>No care-recipient account selected</AlertTitle>
            <AlertDescription>
              Connect or select a care-recipient account on the Family page before managing care
              settings.
            </AlertDescription>
          </Alert>
        ) : settingsQuery.isLoading || !form ? (
          <div className="flex items-center gap-2 rounded-2xl border border-[#dce8e4] bg-white p-6 text-[#71868a]">
            <Loader2 className="size-5 animate-spin" /> Loading settings…
          </div>
        ) : settingsQuery.isError ? (
          <Alert variant="destructive">
            <ShieldAlert className="size-4" />
            <AlertTitle>Settings could not be loaded</AlertTitle>
            <AlertDescription className="mt-2 flex flex-col gap-3">
              <span>{(settingsQuery.error as Error).message}</span>
              <Button variant="outline" className="w-fit" onClick={() => settingsQuery.refetch()}>
                <RefreshCw className="mr-2 size-4" /> Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <form
            className="space-y-8"
            onSubmit={(event) => {
              event.preventDefault();
              saveSettings.mutate(form);
            }}
          >
            <Section
              icon={<Bell className="size-5" />}
              title="Notification preferences"
              description="Choose how SOS alerts and routine reminders are delivered."
            >
              <ToggleRow
                label="Email notifications"
                description="Send SOS email alerts to connected family members."
                checked={form.notify_email}
                onChange={(value) => setSetting("notify_email", value)}
              />
              <ToggleRow
                label="Push notifications"
                description="Allow browser push alerts on this device."
                checked={form.notify_push}
                onChange={(value) => void handlePushToggle(value)}
              />

              <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Browser permission</p>
                  <p className="text-xs text-muted-foreground">
                    Current status:{" "}
                    <span className="font-semibold capitalize">{pushPermission}</span>
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pushPermission !== "granted" || testingPush}
                  onClick={() => void testBrowserNotification()}
                >
                  {testingPush ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Smartphone className="mr-2 size-4" />
                  )}
                  Send real push test
                </Button>
              </div>

              <div className="space-y-3 border-t pt-4">
                <div>
                  <p className="text-sm font-semibold">Push categories</p>
                  <p className="text-xs text-muted-foreground">
                    The master Push notifications switch must also be enabled.
                  </p>
                </div>
                <ToggleRow
                  label="SOS alerts"
                  description="Emergency SOS and SOS status updates."
                  checked={form.push_sos_enabled}
                  onChange={(value) => setSetting("push_sos_enabled", value)}
                  disabled={!form.notify_push}
                />
                <ToggleRow
                  label="Medicine alerts"
                  description="Missed-dose notifications."
                  checked={form.push_medicine_enabled}
                  onChange={(value) => setSetting("push_medicine_enabled", value)}
                  disabled={!form.notify_push}
                />
                <ToggleRow
                  label="Wellbeing alerts"
                  description="Missing daily check-in notifications."
                  checked={form.push_wellbeing_enabled}
                  onChange={(value) => setSetting("push_wellbeing_enabled", value)}
                  disabled={!form.notify_push}
                />
                <ToggleRow
                  label="Appointment reminders"
                  description="Doctor appointment reminders generated by the server."
                  checked={form.push_appointments_enabled}
                  onChange={(value) => setSetting("push_appointments_enabled", value)}
                  disabled={!form.notify_push}
                />
                <ToggleRow
                  label="Caregiver updates"
                  description="Booking confirmation, assignment, and status changes."
                  checked={form.push_caregiver_enabled}
                  onChange={(value) => setSetting("push_caregiver_enabled", value)}
                  disabled={!form.notify_push}
                />
                <ToggleRow
                  label="Transport updates"
                  description="Driver assignment and ride status changes."
                  checked={form.push_transport_enabled}
                  onChange={(value) => setSetting("push_transport_enabled", value)}
                  disabled={!form.notify_push}
                />
                <ToggleRow
                  label="Video consultation updates"
                  description="Consultation reminders and status changes."
                  checked={form.push_video_enabled}
                  onChange={(value) => setSetting("push_video_enabled", value)}
                  disabled={!form.notify_push}
                />
                <ToggleRow
                  label="AI emergency-detection alerts"
                  description="Missed care and no-app-activity detection."
                  checked={form.push_emergency_detection_enabled}
                  onChange={(value) => setSetting("push_emergency_detection_enabled", value)}
                  disabled={!form.notify_push}
                />
                <ToggleRow
                  label="Health-risk alerts"
                  description="High or urgent screening results."
                  checked={form.push_health_risk_enabled}
                  onChange={(value) => setSetting("push_health_risk_enabled", value)}
                  disabled={!form.notify_push}
                />
                <ToggleRow
                  label="Companion safety alerts"
                  description="Generic private safety warnings sent to linked family."
                  checked={form.push_companion_safety_enabled}
                  onChange={(value) => setSetting("push_companion_safety_enabled", value)}
                  disabled={!form.notify_push}
                />
              </div>

              <div className="rounded-xl border border-[#e5d2bf] bg-[#fbf5ee] p-4 text-sm leading-6 text-[#795d45]">
                <div className="flex items-start gap-2">
                  <MessageSquareWarning className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="font-semibold">SMS notifications are not connected yet.</p>
                    <p className="mt-1 text-xs">
                      An SMS provider such as Twilio is required. The application will not claim
                      that SMS is enabled until a provider is configured.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 border-t pt-4">
                <ToggleRow
                  label="Quiet hours"
                  description="Pause routine generated notifications during this period. Exact medicine, appointment, and SOS alarms remain active."
                  checked={quietHoursEnabled}
                  onChange={(enabled) => {
                    if (enabled) {
                      setForm((current) =>
                        current
                          ? { ...current, quiet_hours_start: "22:00", quiet_hours_end: "07:00" }
                          : current,
                      );
                    } else {
                      setForm((current) =>
                        current
                          ? { ...current, quiet_hours_start: null, quiet_hours_end: null }
                          : current,
                      );
                    }
                  }}
                />
                {quietHoursEnabled && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Quiet hours start" htmlFor="quiet-start">
                      <Input
                        id="quiet-start"
                        type="time"
                        value={form.quiet_hours_start ?? ""}
                        onChange={(event) =>
                          setSetting("quiet_hours_start", event.target.value || null)
                        }
                      />
                    </Field>
                    <Field label="Quiet hours end" htmlFor="quiet-end">
                      <Input
                        id="quiet-end"
                        type="time"
                        value={form.quiet_hours_end ?? ""}
                        onChange={(event) =>
                          setSetting("quiet_hours_end", event.target.value || null)
                        }
                      />
                    </Field>
                  </div>
                )}
              </div>
            </Section>

            <Section
              icon={<CheckCircle2 className="size-5" />}
              title="Routine reminders"
              description="Master controls for medicine, appointment, and wellbeing reminders."
            >
              <ToggleRow
                label="Medicine alarms and missed-dose notifications"
                description="Turning this off stops global medicine alarms and missed-dose notifications."
                checked={form.med_reminders_enabled}
                onChange={(value) => setSetting("med_reminders_enabled", value)}
              />
              <ToggleRow
                label="Spoken medicine reminders"
                description="Speak the medicine name when its alarm appears."
                checked={form.med_voice_reminders}
                onChange={(value) => setSetting("med_voice_reminders", value)}
                disabled={!form.med_reminders_enabled}
              />
              <Field label="Missed-dose grace period (minutes)" htmlFor="medicine-grace">
                <Input
                  id="medicine-grace"
                  type="number"
                  min={0}
                  max={120}
                  value={form.med_reminder_lead_minutes}
                  disabled={!form.med_reminders_enabled}
                  onChange={(event) =>
                    setSetting(
                      "med_reminder_lead_minutes",
                      Math.min(120, Math.max(0, Number(event.target.value) || 0)),
                    )
                  }
                />
              </Field>
              <ToggleRow
                label="Appointment reminders"
                description="The individual appointment checkbox must also be enabled for its exact-time alarm."
                checked={form.appointment_reminders_enabled}
                onChange={(value) => setSetting("appointment_reminders_enabled", value)}
              />
              <ToggleRow
                label="Daily wellbeing reminder"
                description="Create a reminder when the daily wellbeing check-in has not been completed."
                checked={form.wellbeing_reminders_enabled}
                onChange={(value) => setSetting("wellbeing_reminders_enabled", value)}
              />
            </Section>

            <Section
              icon={<ShieldAlert className="size-5" />}
              title="AI emergency detection"
              description="Free rule-based monitoring for missed medicines, missing check-ins, and inactivity inside ElderCare Connect."
            >
              <ToggleRow
                label="Enable automatic emergency detection"
                description="Runs secure database checks every 15 minutes and alerts the care recipient and linked children."
                checked={form.emergency_detection_enabled}
                onChange={(value) => setSetting("emergency_detection_enabled", value)}
              />
              <ToggleRow
                label="Detect missed medicines"
                description="Creates an alert after the medicine time and configured grace period have passed."
                checked={form.detect_missed_medicine}
                onChange={(value) => setSetting("detect_missed_medicine", value)}
                disabled={!form.emergency_detection_enabled || !form.med_reminders_enabled}
              />
              <ToggleRow
                label="Detect missing wellbeing check-ins"
                description="Creates an alert when the daily check-in is still missing after the selected cutoff."
                checked={form.detect_missed_checkin}
                onChange={(value) => setSetting("detect_missed_checkin", value)}
                disabled={!form.emergency_detection_enabled || !form.wellbeing_reminders_enabled}
              />
              <Field label="Daily check-in cutoff" htmlFor="wellbeing-cutoff">
                <Input
                  id="wellbeing-cutoff"
                  type="time"
                  value={form.wellbeing_checkin_cutoff}
                  disabled={
                    !form.emergency_detection_enabled ||
                    !form.detect_missed_checkin ||
                    !form.wellbeing_reminders_enabled
                  }
                  onChange={(event) =>
                    setSetting("wellbeing_checkin_cutoff", event.target.value || "20:00")
                  }
                />
              </Field>
              <ToggleRow
                label="Detect no ElderCare app activity"
                description="Measures only activity inside ElderCare Connect, not general phone usage."
                checked={form.detect_no_app_activity}
                onChange={(value) => setSetting("detect_no_app_activity", value)}
                disabled={!form.emergency_detection_enabled}
              />
              <Field label="No-app-activity threshold (hours)" htmlFor="no-activity-hours">
                <Input
                  id="no-activity-hours"
                  type="number"
                  min={6}
                  max={168}
                  value={form.no_app_activity_hours}
                  disabled={!form.emergency_detection_enabled || !form.detect_no_app_activity}
                  onChange={(event) =>
                    setSetting(
                      "no_app_activity_hours",
                      Math.min(168, Math.max(6, Number(event.target.value) || 24)),
                    )
                  }
                />
              </Field>
              <ToggleRow
                label="Alert family after a high health-risk screening"
                description="Creates an in-app and push alert only for high or urgent results."
                checked={form.health_risk_alerts_enabled}
                onChange={(value) => setSetting("health_risk_alerts_enabled", value)}
              />
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                Detection alerts automatically resolve when a missed medicine is marked taken, the
                daily wellbeing check is submitted, or ElderCare app activity resumes.
              </div>
            </Section>

            <Section
              icon={<MessageSquareWarning className="size-5" />}
              title="AI Companion privacy and voice"
              description="Control spoken replies and optional private safety escalation for the care recipient."
            >
              <ToggleRow
                label="Automatically read Companion replies aloud"
                description="Uses the browser’s free speech-synthesis feature. No paid voice service is required."
                checked={form.companion_auto_read_responses}
                onChange={(value) => setSetting("companion_auto_read_responses", value)}
              />
              <ToggleRow
                label="Alert linked family for urgent Companion messages"
                description="When enabled, linked children receive only a generic emergency warning. The private message and chat history are never shared."
                checked={form.companion_emergency_escalation_enabled}
                onChange={(value) => setSetting("companion_emergency_escalation_enabled", value)}
              />
              <div className="rounded-xl border border-[#e5d2bf] bg-[#fbf5ee] p-4 text-sm leading-6 text-[#795d45]">
                Emergency phrase detection always shows SOS guidance to the care recipient. Family
                escalation is optional and is disabled by default.
              </div>
            </Section>

            <Section
              icon={<ShieldAlert className="size-5" />}
              title="Emergency escalation"
              description="Controls used when an active SOS alert needs to reach additional contacts."
            >
              <ToggleRow
                label="Share live location with SOS alerts"
                checked={form.sos_share_location}
                onChange={(value) => setSetting("sos_share_location", value)}
              />
              <ToggleRow
                label="Auto-call the primary emergency contact"
                description="This opens the device dialler. Browsers cannot silently place a phone call."
                checked={form.sos_auto_call_primary}
                onChange={(value) => setSetting("sos_auto_call_primary", value)}
              />
              <Field label="Escalate to the next contact after (minutes)" htmlFor="sos-escalation">
                <Input
                  id="sos-escalation"
                  type="number"
                  min={1}
                  max={60}
                  value={form.sos_escalation_minutes}
                  onChange={(event) =>
                    setSetting(
                      "sos_escalation_minutes",
                      Math.min(60, Math.max(1, Number(event.target.value) || 5)),
                    )
                  }
                />
              </Field>
            </Section>

            <Section
              icon={<Smartphone className="size-5" />}
              title="Contact preference"
              description="Used as the preferred option when more than one supported method is available."
            >
              <Field label="Preferred contact method" htmlFor="preferred-method">
                <Select
                  value={form.preferred_contact_method}
                  onValueChange={(value) =>
                    setSetting("preferred_contact_method", value as ContactMethod)
                  }
                >
                  <SelectTrigger id="preferred-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phone">Phone call</SelectItem>
                    <SelectItem value="email" disabled={!form.notify_email}>
                      Email
                    </SelectItem>
                    <SelectItem value="push" disabled={!form.notify_push}>
                      Push notification
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </Section>

            <Section
              icon={<Accessibility className="size-5" />}
              title="Accessibility and language"
              description="Changes are previewed immediately and become permanent after saving."
            >
              <Field label="Language" htmlFor="settings-language">
                <Select
                  value={form.language}
                  onValueChange={(value) => setSetting("language", value as AppLanguage)}
                >
                  <SelectTrigger id="settings-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="hi">हिन्दी</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <ToggleRow
                label="Larger text"
                checked={form.large_text}
                onChange={(value) => setSetting("large_text", value)}
              />
              <ToggleRow
                label="High contrast"
                checked={form.high_contrast}
                onChange={(value) => setSetting("high_contrast", value)}
              />
            </Section>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline">
                    <RotateCcw className="mr-2 size-4" /> Reset to defaults
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Load default settings?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This loads the defaults into the form. Nothing is changed in the database
                      until you click Save Settings.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={resetSettings}>Load defaults</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button type="submit" disabled={saveSettings.isPending || !settingsDirty}>
                {saveSettings.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save Settings
              </Button>
            </div>
          </form>
        )}

        <Section
          icon={<LockKeyhole className="size-5" />}
          title="Account security"
          description="Change the password for the account currently signed in."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New password" htmlFor="new-password">
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="At least 8 characters"
              />
            </Field>
            <Field label="Confirm new password" htmlFor="confirm-new-password">
              <Input
                id="confirm-new-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="Repeat the new password"
              />
            </Field>
          </div>
          <p className="text-xs leading-5 text-[#71868a]">
            Use at least one uppercase letter, one lowercase letter, and one number.
          </p>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={changePassword.isPending || !newPassword || !confirmPassword}
              onClick={() => changePassword.mutate()}
            >
              {changePassword.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <KeyRound className="mr-2 size-4" />
              )}
              Change Password
            </Button>
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
function Section({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5 rounded-[1.5rem] border border-[#dce8e4] bg-white p-5 shadow-[0_18px_48px_-40px_rgba(18,49,54,0.4)] sm:p-6">
      <div className="flex items-start gap-3">
        {icon && <div className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-[#e6f2ee] text-[#176f69]">{icon}</div>}
        <div>
          <h2 className="text-lg font-bold tracking-[-0.025em] text-[#17343a]">{title}</h2>
          {description && <p className="mt-1 text-sm leading-6 text-[#71868a]">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="font-semibold text-[#29484e]">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
function ReadOnlyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <span className="block text-xs font-bold uppercase tracking-[0.1em] text-[#7b8f93]">
        {label}
      </span>
      <span className="block select-none rounded-xl border border-[#dfe8e5] bg-[#f8fbfa] px-3 py-2.5 text-sm font-semibold text-[#425f64]">
        {value}
      </span>
    </div>
  );
}
function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[#e4ebe9] bg-[#fbfdfc] px-4 py-3.5">
      <div>
        <Label className={disabled ? "font-semibold text-[#9aa8aa]" : "font-semibold text-[#35565c]"}>
          {label}
        </Label>
        {description && <p className="mt-1 text-xs leading-5 text-[#7b8e92]">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}