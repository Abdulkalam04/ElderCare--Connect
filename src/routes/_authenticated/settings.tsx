import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useActiveParent, useCurrentUser, useProfile } from "@/hooks/useProfile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { enablePushNotifications, disablePushNotifications, isPushSupported } from "@/lib/push";
import { EditableAvatar } from "@/components/EditableAvatar";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/settings")({
  ssr: false,
  component: SettingsPage,
});

type Settings = {
  parent_id: string;
  notify_email: boolean;
  notify_push: boolean;
  notify_sms: boolean;
  med_reminders_enabled: boolean;
  med_reminder_lead_minutes: number;
  med_voice_reminders: boolean;
  sos_escalation_minutes: number;
  sos_auto_call_primary: boolean;
  sos_share_location: boolean;
  preferred_contact_method: string;
  language: string;
  large_text: boolean;
  high_contrast: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
};

const DEFAULTS: Omit<Settings, "parent_id"> = {
  notify_email: true,
  notify_push: true,
  notify_sms: false,
  med_reminders_enabled: true,
  med_reminder_lead_minutes: 10,
  med_voice_reminders: false,
  sos_escalation_minutes: 5,
  sos_auto_call_primary: false,
  sos_share_location: true,
  preferred_contact_method: "phone",
  language: "en",
  large_text: false,
  high_contrast: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
};

const translations = {
  en: {
    title: "Elder Settings",
    subtitle: "Preferences for",
    myPhoneTitle: "My phone number",
    myPhoneDesc: "Your phone number is visible to linked family members and enables emergency one-tap calling.",
    phoneLabel: "Phone number",
    save: "Save",
    saving: "Saving…",
    linkParentWarning: "Link a parent account on the Family page to manage elder settings here.",
    loadingSettings: "Loading settings…",
    notifPrefTitle: "Notification preferences",
    emailNotif: "Email notifications",
    pushNotif: "Push notifications",
    quietHoursStart: "Quiet hours start",
    quietHoursEnd: "Quiet hours end",
    medRemTitle: "Medication reminders",
    enableMedRem: "Enable medication reminders",
    voiceSpokenRem: "Voice spoken reminders",
    remindMinutesBefore: "Remind this many minutes before dose",
    emergEscTitle: "Emergency escalation",
    shareLiveLoc: "Share live location with SOS alerts",
    autoCallPrimary: "Auto-call primary contact on SOS",
    escalateNextContact: "Escalate to next contact after (minutes)",
    prefContactMethodTitle: "Preferred contact method",
    phoneCall: "Phone call",
    email: "Email",
    pushNotifOption: "Push notification",
    profilePrefTitle: "Profile preferences",
    languageLabel: "Language",
    largerText: "Larger text",
    highContrast: "High contrast",
    saveSettings: "Save settings",
  },
  hi: {
    title: "बुजुर्ग सेटिंग्स",
    subtitle: "के लिए प्राथमिकताएं",
    myPhoneTitle: "मेरा फोन नंबर",
    myPhoneDesc: "आपका फोन नंबर जुड़े हुए परिवार के सदस्यों को दिखाई देता है और आपातकालीन वन-टैप कॉलिंग सक्षम करता है।",
    phoneLabel: "फ़ोन नंबर",
    save: "सहेजें",
    saving: "सहेज रहे हैं…",
    linkParentWarning: "बुजुर्ग सेटिंग्स प्रबंधित करने के लिए फैमिली पेज पर एक पैरेंट अकाउंट लिंक करें।",
    loadingSettings: "सेटिंग्स लोड हो रही हैं…",
    notifPrefTitle: "अधिसूचना प्राथमिकताएं",
    emailNotif: "ईमेल अधिसूचनाएं",
    pushNotif: "पुश अधिसूचनाएं",
    quietHoursStart: "शांत घंटे शुरू",
    quietHoursEnd: "शांत घंटे समाप्त",
    medRemTitle: "दवा अनुस्मारक (रिमाइंडर्स)",
    enableMedRem: "दवा अनुस्मारक सक्षम करें",
    voiceSpokenRem: "आवाज से बोले जाने वाले अनुस्मारक",
    remindMinutesBefore: "खुराक से इतने मिनट पहले याद दिलाएं",
    emergEscTitle: "आपातकालीन वृद्धि (Escalation)",
    shareLiveLoc: "एसओएस अलर्ट के साथ लाइव स्थान साझा करें",
    autoCallPrimary: "एसओएस पर प्राथमिक संपर्क को ऑटो-कॉल करें",
    escalateNextContact: "इतने मिनट बाद अगले संपर्क को कॉल करें",
    prefContactMethodTitle: "पसंदीदा संपर्क विधि",
    phoneCall: "फ़ोन कॉल",
    email: "ईमेल",
    pushNotifOption: "पुश अधिसूचना",
    profilePrefTitle: "प्रोफ़ाइल प्राथमिकताएं",
    languageLabel: "भाषा",
    largerText: "बड़ा टेक्स्ट",
    highContrast: "उच्च कंट्रास्ट",
    saveSettings: "सेटिंग्स सहेजें",
  }
} as const;

function SettingsPage() {
  const { activeParentId, activeParent } = useActiveParent();
  const { data: currentUser } = useCurrentUser();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [hasLoadedProfile, setHasLoadedProfile] = useState(false);

  useEffect(() => {
    if (profile && !hasLoadedProfile) {
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
      setHasLoadedProfile(true);
    }
  }, [profile, hasLoadedProfile]);

  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!currentUser?.id) throw new Error("Not signed in");
      const nameTrimmed = fullName.trim();
      if (!nameTrimmed) throw new Error("Full name is required");

      const phoneTrimmed = phone.trim() || null;
      if (phoneTrimmed) {
        const phoneRegex = /^\+?[0-9\s\-()]{7,30}$/;
        if (!phoneRegex.test(phoneTrimmed) || phoneTrimmed.replace(/[^0-9]/g, "").length < 7) {
          throw new Error("Please enter a valid phone number (at least 7 digits)");
        }
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: nameTrimmed,
          phone: phoneTrimmed,
        })
        .eq("id", currentUser.id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile", currentUser?.id] });
      qc.invalidateQueries({ queryKey: ["myProfile", currentUser?.id] });
      qc.invalidateQueries({ queryKey: ["linkedChildren"] });
      qc.invalidateQueries({ queryKey: ["linkedParents"] });
      toast.success("Your profile has been updated successfully.");
    },
    onError: (e: Error) => {
      toast.error(e.message || "Failed to update profile.");
    },
  });

  // ── Elder Settings ────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ["elder_settings", activeParentId],
    enabled: !!activeParentId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("elder_settings")
        .select("*")
        .eq("parent_id", activeParentId!)
        .maybeSingle();
      if (error) throw new Error(error.message ?? "Failed to load settings");
      return (data ?? { ...DEFAULTS, parent_id: activeParentId! }) as Settings;
    },
  });

  const [form, setForm] = useState<Settings | null>(null);
  useEffect(() => {
    if (data) {
      setForm(data);
      // Apply accessibility settings immediately on load/reload
      document.documentElement.classList.toggle("large-text", !!data.large_text);
      document.documentElement.classList.toggle("high-contrast", !!data.high_contrast);
      document.documentElement.lang = data.language || "en";
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async (values: Settings) => {
      const { error } = await (supabase as any)
        .from("elder_settings")
        .upsert(values, { onConflict: "parent_id" });
      if (error) throw new Error(error.message ?? "Failed to save settings");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["elder_settings"] });
      if (form) {
        document.documentElement.classList.toggle("large-text", !!form.large_text);
        document.documentElement.classList.toggle("high-contrast", !!form.high_contrast);
        document.documentElement.lang = form.language || "en";
      }
      toast.success(form?.language === "hi" ? "सेटिंग्स सहेजी गईं।" : "Settings saved.");
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed to save settings"),
  });

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    if (form) setForm({ ...form, [k]: v });
  };

  const handlePushToggle = async (v: boolean) => {
    set("notify_push", v);
    if (v) {
      if (isPushSupported()) {
        const r = await enablePushNotifications();
        if (r.ok) {
          toast.success("Web Push alerts enabled on this device.");
        } else {
          toast.warning(`Push enabled in settings, but browser setup failed: ${r.reason || "unknown error"}. Please check permission.`);
        }
      } else {
        toast.warning("Push notifications enabled in settings, but not supported in this browser.");
      }
    } else {
      if (isPushSupported()) {
        await disablePushNotifications();
        toast.success("Web Push alerts disabled on this device.");
      }
    }
  };

  const lang = form?.language === "hi" ? "hi" : "en";
  const t = translations[lang];

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="font-display text-4xl font-bold italic">{t.title}</h1>
        <p className="text-muted-foreground mt-1">
          {t.subtitle} {activeParent?.full_name ?? "—"}
        </p>
      </div>

      <div className="space-y-8 max-w-3xl">
        {/* ── Edit Profile ────────────────────────────────────────────────── */}
        <Section title="Edit Profile">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <div className="flex flex-col items-center gap-2 self-center md:self-start shrink-0">
              <EditableAvatar size="xl" />
              <span className="text-xs text-muted-foreground font-medium">Click to upload photo</span>
            </div>
            
            <div className="flex-1 w-full space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="profile-fullname">Full Name</Label>
                  <Input
                    id="profile-fullname"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Abdul Kalam"
                    maxLength={100}
                  />
                </div>
                
                <div className="space-y-1.5">
                  <Label htmlFor="profile-phone">Phone Number</Label>
                  <Input
                    id="profile-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 555 000 0000"
                    maxLength={30}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">Email Address</span>
                  <span className="text-sm font-medium text-foreground block bg-stone-50 border border-border/60 rounded-lg px-3 py-2 cursor-not-allowed select-none opacity-80">
                    {profile?.email || currentUser?.email || "—"}
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">Account Role</span>
                  <span className="text-sm font-semibold capitalize text-foreground block bg-stone-50 border border-border/60 rounded-lg px-3 py-2 cursor-not-allowed select-none opacity-80">
                    {profile?.role === "parent" ? "👴 Parent Account" : "👨‍👩‍👦 Family Monitor"}
                  </span>
                </div>
              </div>

              {profile?.created_at && (
                <div className="text-[11px] text-muted-foreground font-mono pt-2">
                  Member since {format(new Date(profile.created_at), "MMMM d, yyyy")}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button
                  type="button"
                  disabled={updateProfile.isPending || !currentUser}
                  onClick={() => updateProfile.mutate()}
                  className="rounded-xl font-semibold shadow-sm"
                >
                  {updateProfile.isPending ? "Saving..." : "Save Profile"}
                </Button>
              </div>
            </div>
          </div>
        </Section>

        {/* ── Elder Settings ───────────────────────────────────────────────── */}
        {!activeParentId ? (
          <div className="text-sm text-muted-foreground bg-stone-50 border border-border rounded-2xl p-4">
            {t.linkParentWarning}
          </div>
        ) : isLoading || !form ? (
          <div className="text-muted-foreground">{t.loadingSettings}</div>
        ) : (
          <form
            className="space-y-8"
            onSubmit={(e) => { e.preventDefault(); save.mutate(form!); }}
          >
            {/* Notification Preferences */}
            <Section title={t.notifPrefTitle}>
              <ToggleRow label={t.emailNotif}
                checked={form.notify_email} onChange={(v) => set("notify_email", v)} />
              <ToggleRow label={t.pushNotif}
                checked={form.notify_push} onChange={handlePushToggle} />
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <Label>{t.quietHoursStart}</Label>
                  <Input type="time" value={form.quiet_hours_start ?? ""}
                    onChange={(e) => set("quiet_hours_start", e.target.value || null)} />
                </div>
                <div>
                  <Label>{t.quietHoursEnd}</Label>
                  <Input type="time" value={form.quiet_hours_end ?? ""}
                    onChange={(e) => set("quiet_hours_end", e.target.value || null)} />
                </div>
              </div>
            </Section>

            {/* Medication Reminders */}
            <Section title={t.medRemTitle}>
              <ToggleRow label={t.enableMedRem}
                checked={form.med_reminders_enabled} onChange={(v) => set("med_reminders_enabled", v)} />
              <ToggleRow label={t.voiceSpokenRem}
                checked={form.med_voice_reminders} onChange={(v) => set("med_voice_reminders", v)} />
              <div>
                <Label>{t.remindMinutesBefore}</Label>
                <Input type="number" min={0} max={120} value={form.med_reminder_lead_minutes}
                  onChange={(e) => set("med_reminder_lead_minutes", Number(e.target.value) || 0)} />
              </div>
            </Section>

            {/* Emergency Escalation */}
            <Section title={t.emergEscTitle}>
              <ToggleRow label={t.shareLiveLoc}
                checked={form.sos_share_location} onChange={(v) => set("sos_share_location", v)} />
              <ToggleRow label={t.autoCallPrimary}
                checked={form.sos_auto_call_primary} onChange={(v) => set("sos_auto_call_primary", v)} />
              <div>
                <Label>{t.escalateNextContact}</Label>
                <Input type="number" min={1} max={60} value={form.sos_escalation_minutes}
                  onChange={(e) => set("sos_escalation_minutes", Number(e.target.value) || 5)} />
              </div>
            </Section>

            {/* Preferred Contact Method */}
            <Section title={t.prefContactMethodTitle}>
              <Select value={form.preferred_contact_method}
                onValueChange={(v) => set("preferred_contact_method", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">{t.phoneCall}</SelectItem>
                  <SelectItem value="email">{t.email}</SelectItem>
                  <SelectItem value="push">{t.pushNotifOption}</SelectItem>
                </SelectContent>
              </Select>
            </Section>

            {/* Profile Preferences */}
            <Section title={t.profilePrefTitle}>
              <div>
                <Label>{t.languageLabel}</Label>
                <Select value={form.language} onValueChange={(v) => set("language", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="hi">हिन्दी</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <ToggleRow label={t.largerText}
                checked={form.large_text} onChange={(v) => set("large_text", v)} />
              <ToggleRow label={t.highContrast}
                checked={form.high_contrast} onChange={(v) => set("high_contrast", v)} />
            </Section>

            <div className="flex justify-end">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? t.saving : t.saveSettings}
              </Button>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <h2 className="font-display text-xl font-bold italic">{title}</h2>
      {children}
    </section>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label className="font-normal">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
