import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useActiveParent, useLinkedChildren } from "@/hooks/useProfile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Heart, Siren, MapPin, ShieldAlert } from "lucide-react";
import { useVoiceReminders } from "@/hooks/useVoiceReminders";
import { useServerFn } from "@tanstack/react-start";
import { notifySosAlert } from "@/lib/api/sosNotify.functions";
import { sendPushForAlert } from "@/lib/api/pushNotify.functions";
import { WellbeingCheckCard } from "@/components/WellbeingCheckCard";
import { captureLocation, reverseGeocode } from "@/lib/geolocation";
import { useState, useEffect, useRef } from "react";
import { Users, Mail, Phone, Calendar as CalendarIcon, MessageSquare, MessageCircle } from "lucide-react";
import { FileText, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  component: DashboardPage,
});

function DashboardPage() {
  const { activeParent, activeParentId, profile, isChildView } = useActiveParent();
  const { data: linkedChildren = [] } = useLinkedChildren(profile?.role === "parent" ? profile?.id : undefined);
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const notifyEmail = useServerFn(notifySosAlert);
  const notifyPush = useServerFn(sendPushForAlert);

  // Local cooldown state for the SOS trigger button
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // View toggle: "my" = personal dashboard, "family" = linked family members
  const [viewMode, setViewMode] = useState<"my" | "family">("my");
  const showViewToggle = !isChildView && linkedChildren.length > 0;
  const isFamilyView = showViewToggle && viewMode === "family";

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  const startCooldown = (seconds: number) => {
    setCooldown(seconds);
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const { data: medicines } = useQuery({
    queryKey: ["medicines", activeParentId],
    enabled: !!activeParentId,
    queryFn: async () => {
      const { data } = await supabase
        .from("medicines")
        .select("*")
        .eq("parent_id", activeParentId!)
        .eq("active", true)
        .order("schedule_time");
      return data ?? [];
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["medLogs", activeParentId, today],
    enabled: !!activeParentId,
    queryFn: async () => {
      const { data } = await supabase
        .from("medicine_logs")
        .select("medicine_id")
        .eq("parent_id", activeParentId!)
        .eq("log_date", today);
      return new Set((data ?? []).map((l) => l.medicine_id));
    },
  });

  // Speak medicine reminders for the parent on their own device
  useVoiceReminders(medicines, logs, !isChildView);

  const { data: nextBooking } = useQuery({
    queryKey: ["nextBooking", activeParentId],
    enabled: !!activeParentId,
    queryFn: async () => {
      const { data } = await supabase
        .from("caregiver_bookings")
        .select("*")
        .eq("parent_id", activeParentId!)
        .in("status", ["pending", "confirmed"])
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at")
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: recentReports } = useQuery({
    queryKey: ["recentReports", activeParentId],
    enabled: !!activeParentId,
    queryFn: async () => {
      const { data } = await supabase
        .from("health_records")
        .select("*")
        .eq("parent_id", activeParentId!)
        .order("record_date", { ascending: false })
        .limit(3);
      return data ?? [];
    },
  });

  const { data: wellbeing } = useQuery({
    queryKey: ["wellbeing", activeParentId, today],
    enabled: !!activeParentId,
    queryFn: async () => {
      const { data } = await supabase
        .from("wellbeing_checks")
        .select("*")
        .eq("parent_id", activeParentId!)
        .eq("check_date", today)
        .maybeSingle();
      return data;
    },
  });

  const { data: latestVitals } = useQuery({
    queryKey: ["latestVitals", activeParentId],
    enabled: !!activeParentId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("vitals")
        .select("vital_type, value, value_secondary, unit, recorded_at")
        .eq("parent_id", activeParentId!)
        .in("vital_type", ["blood_pressure", "blood_sugar", "heart_rate"])
        .order("recorded_at", { ascending: false })
        .limit(30);
      const pick = (t: string) => (data ?? []).find((v: any) => v.vital_type === t);
      return {
        bp: pick("blood_pressure"),
        sugar: pick("blood_sugar"),
        hr: pick("heart_rate"),
      };
    },
  });

  // Real-time synchronization subscription
  useEffect(() => {
    if (!activeParentId) return;
    const channel = supabase
      .channel(`dashboard-sync-${activeParentId}-${Math.random().toString(36).substr(2, 9)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wellbeing_checks",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["wellbeing", activeParentId] });
          qc.invalidateQueries({ queryKey: ["wellbeing-history", activeParentId] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "medicine_logs",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["medLogs", activeParentId] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vitals",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["vitals", activeParentId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeParentId, today, qc]);

  const markTaken = useMutation({
    mutationFn: async (medId: string) => {
      const { error } = await supabase.from("medicine_logs").insert({
        medicine_id: medId,
        parent_id: activeParentId!,
        log_date: today,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked as taken");
      qc.invalidateQueries({ queryKey: ["medLogs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveFeeling = useMutation({
    mutationFn: async (feeling: string) => {
      const { error } = await supabase
        .from("wellbeing_checks")
        .upsert(
          { parent_id: activeParentId!, check_date: today, feeling } as any,
          { onConflict: "parent_id,check_date" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mood saved");
      qc.invalidateQueries({ queryKey: ["wellbeing"] });
      qc.invalidateQueries({ queryKey: ["wellbeing-history"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const triggerSOS = useMutation({
    mutationFn: async () => {
      if (cooldown > 0) {
        throw new Error("__cooldown__");
      }

      // 1. Edge case: No linked children
      if (linkedChildren.length === 0) {
        throw new Error("No linked family member available.");
      }

      // Check for active alerts in the last 10 seconds to prevent double clicks
      const { data: recentActive } = await supabase
        .from("sos_alerts")
        .select("id, created_at")
        .eq("parent_id", profile!.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);

      if (recentActive && recentActive.length > 0) {
        const elapsed = Date.now() - new Date(recentActive[0].created_at).getTime();
        if (elapsed < 10000) {
          throw new Error("__cooldown__");
        }
      }

      // 2. Geolocation capture and Nominatim geocoding
      let coords: { latitude: number; longitude: number } | null = null;
      let addressStr: string | null = null;
      try {
        coords = await captureLocation(4000);
        if (coords) {
          addressStr = await reverseGeocode(coords.latitude, coords.longitude, 3000);
        }
      } catch (err) {
        console.error("SOS capture location failed:", err);
      }

      // 3. Insert SOS record
      const { data: inserted, error } = await supabase
        .from("sos_alerts")
        .insert({
          parent_id: profile!.id,
          parent_name: profile!.full_name || "Parent",
          message: "Emergency Assistance Requested from Dashboard",
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          address: addressStr ?? "Location unavailable.",
          status: "active",
        } as any)
        .select("id")
        .single();

      if (error) throw error;

      // 4. Notifications
      let emailResult: unknown = null;
      let pushResult: unknown = null;

      if (inserted?.id) {
        try {
          emailResult = await notifyEmail({ data: { alertId: inserted.id, alertType: "manual" } });
        } catch (e) {
          console.error("SOS email notification failed:", e);
        }
        try {
          pushResult = await notifyPush({ data: { alertId: inserted.id, alertType: "manual" } });
        } catch (e) {
          console.error("SOS push notification failed:", e);
        }

        // Insert in-app notification for each linked child
        if (linkedChildren.length > 0) {
          const childNotifs = linkedChildren.map((child) => ({
            parent_id: child.id,          // recipient = child
            sender_id: profile!.id,
            type: "sos",
            notification_type: "sos",
            message: `Emergency Alert: ${profile!.full_name || "Your parent"} has requested immediate assistance.`,
            is_read: false,
            metadata: {
              alert_id: inserted.id,
              parent_name: profile!.full_name,
              triggered_at: new Date().toISOString(),
            },
          }));
          try {
            await supabase.from("parent_notifications").insert(childNotifs as any);
          } catch (e) {
            console.error("SOS child notification insert failed:", e);
          }
        }
      }
      return { emailResult, pushResult };
    },
    onSuccess: () => {
      startCooldown(10);
      toast.success("Emergency alert sent successfully.");
      qc.invalidateQueries({ queryKey: ["sos"] });
    },
    onError: (e: Error) => {
      if (e.message === "__cooldown__") {
        toast.warning("Please wait a moment before sending another alert.");
      } else if (e.message.includes("No linked family member")) {
        toast.error("No linked family member available.");
      } else {
        toast.error("Unable to send emergency alert. Please try again.");
      }
    },
  });

  const { data: activeSosAlert } = useQuery({
    queryKey: ["activeSosDashboard", activeParentId],
    enabled: !!activeParentId && isChildView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sos_alerts")
        .select("*")
        .eq("parent_id", activeParentId!)
        .in("status", ["active", "acknowledged"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const acknowledgeSos = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("sos_alerts")
        .update({
          status: "acknowledged",
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: profile!.id,
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alert acknowledged successfully.");
      qc.invalidateQueries({ queryKey: ["sos"] });
      qc.invalidateQueries({ queryKey: ["activeSosDashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function openReport(rec: any) {
    try {
      if (rec?.file_path) {
        const { data, error } = await supabase.storage
          .from("health-records")
          .createSignedUrl(rec.file_path, 300);
        if (error || !data?.signedUrl) {
          toast.error("Unable to open file: " + (error?.message ?? "unknown error"));
          return;
        }
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      } else if (rec?.file_url) {
        window.open(rec.file_url, "_blank", "noopener,noreferrer");
      } else {
        toast.error("No file attached to this record.");
      }
    } catch {
      toast.error("Unable to open file");
    }
  }

  const resolveSos = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("sos_alerts")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: profile!.id,
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Emergency alert marked resolved.");
      qc.invalidateQueries({ queryKey: ["sos"] });
      qc.invalidateQueries({ queryKey: ["activeSosDashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!activeParent) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-border bg-card p-12 text-center">
          <Heart className="size-10 mx-auto text-primary mb-4" />
          <h2 className="font-display text-2xl font-bold mb-2">
            {isChildView ? "Connect to a parent" : "Welcome to ElderCare"}
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            {isChildView
              ? "Ask your parent for their invite code, then link your account on the Family page to start monitoring their care."
              : `Your invite code is ${profile?.invite_code}. Share it with family members on the Family page so they can join.`}
          </p>
          <Link to="/family"><Button className="rounded-xl">Open Family page</Button></Link>
        </div>
      </AppShell>
    );
  }

  const allTaken = medicines && medicines.length > 0 && logs && medicines.every((m) => logs.has(m.id));

  return (
    <AppShell>
      {/* Child SOS Emergency Banner */}
      {isChildView && activeSosAlert && (
        <div className="mb-8 bg-red-50 border-2 border-red-200 rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg shadow-red-500/5 animate-pulse-slow">
          <div className="flex items-start gap-4">
            <div className="size-12 rounded-2xl bg-red-100 text-red-600 grid place-items-center shrink-0">
              <Siren className="size-6" />
            </div>
            <div>
              <h3 className="font-bold text-red-900 text-base">Emergency Assistance requested by Parent</h3>
              <p className="text-sm text-red-700 font-medium mt-0.5">
                Triggered by {activeSosAlert.parent_name || activeParent?.full_name} at {format(new Date(activeSosAlert.created_at), "h:mm a")}
              </p>
              {activeSosAlert.address && (
                <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1.5 font-medium">
                  <MapPin className="size-4 shrink-0" />
                  {activeSosAlert.address}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <Link to="/sos">
              <Button variant="outline" size="sm" className="bg-white hover:bg-stone-50 text-stone-800 rounded-xl text-xs h-8 cursor-pointer">
                Open Details
              </Button>
            </Link>
            {activeSosAlert.status === "active" && (
              <Button
                size="sm"
                onClick={() => acknowledgeSos.mutate(activeSosAlert.id)}
                disabled={acknowledgeSos.isPending}
                className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs h-8 cursor-pointer"
              >
                Acknowledge
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => resolveSos.mutate(activeSosAlert.id)}
              disabled={resolveSos.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs h-8 cursor-pointer"
            >
              Resolve
            </Button>
          </div>
        </div>
      )}

      {/* Warning Banner: No linked child */}
      {!isChildView && linkedChildren.length === 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-3xl p-4 flex items-start gap-3 text-amber-800">
          <ShieldAlert className="size-5 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-semibold">No linked family member available.</span> You must link a child account on the Family page before triggering emergency alerts.
          </div>
        </div>
      )}

      {/* View Toggle */}
      <div className="flex flex-wrap items-center justify-end gap-4 mb-8">
        {showViewToggle && (
          <div className="flex items-center bg-card border border-border rounded-full p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode("my")}
              className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
                viewMode === "my"
                  ? "bg-muted font-semibold text-foreground"
                  : "font-medium text-muted-foreground hover:text-foreground"
              }`}
            >
              My View
            </button>
            <button
              type="button"
              onClick={() => setViewMode("family")}
              className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
                viewMode === "family"
                  ? "bg-muted font-semibold text-foreground"
                  : "font-medium text-muted-foreground hover:text-foreground"
              }`}
            >
              Family View ({linkedChildren.length})
            </button>
          </div>
        )}
      </div>

      {isFamilyView ? (
        <section className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="size-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
              <Users className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Family Members</h2>
              <p className="text-xs text-muted-foreground">
                {linkedChildren.length} linked {linkedChildren.length === 1 ? "person" : "people"} can view your care info
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {linkedChildren.map((child: any) => (
              <div key={child.id} className="bg-muted/40 rounded-xl p-4 flex items-start gap-3">
                <div className="size-12 rounded-full bg-brand/10 text-brand font-bold flex items-center justify-center shrink-0">
                  {(child.full_name ?? "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{child.full_name ?? "Family member"}</p>
                  {child.email && (
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5 mt-1">
                      <Mail className="size-3 shrink-0" />{child.email}
                    </p>
                  )}
                  {child.phone && (
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
                      <Phone className="size-3 shrink-0" />{child.phone}
                    </p>
                  )}
                  {child.linked_at && (
                    <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1.5">
                      <CalendarIcon className="size-3 shrink-0" />
                      Linked {format(new Date(child.linked_at), "MMM d, yyyy")}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <Link to="/family" className="text-sm font-semibold text-brand-accent">Manage family →</Link>
          </div>
        </section>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Vitals Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <VitalCard
              label="Blood Pressure"
              value={latestVitals?.bp ? `${latestVitals.bp.value}/${latestVitals.bp.value_secondary ?? "—"}` : "—"}
              unit={latestVitals?.bp ? (latestVitals.bp.value < 140 && (latestVitals.bp.value_secondary ?? 0) < 90 ? "Normal" : "Check") : "No data"}
              unitClass={latestVitals?.bp ? "text-emerald-600 font-semibold" : "text-muted-foreground"}
              barClass="bg-emerald-500"
            />
            <VitalCard
              label="Blood Sugar"
              value={latestVitals?.sugar ? String(latestVitals.sugar.value) : "—"}
              unit={latestVitals?.sugar?.unit ?? "mg/dL"}
              barClass="bg-brand-accent"
            />
            <VitalCard
              label="Heart Rate"
              value={latestVitals?.hr ? String(latestVitals.hr.value) : "—"}
              unit={latestVitals?.hr ? "BPM" : "bpm"}
              barClass="bg-brand-accent"
            />
          </div>

          {/* Morning Medicines */}
          <section className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">Morning Medicines</h2>
              <Link to="/medicines" className="text-sm font-semibold text-brand-accent">View all</Link>
            </div>
            {medicines && medicines.length > 0 && (() => {
              const total = medicines.length;
              const completed = logs?.size ?? 0;
              const remaining = Math.max(0, total - completed);
              const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
              return (
                <div className="mb-5">
                  <div className="flex items-center justify-between text-xs font-medium mb-2">
                    <span className="text-emerald-600">✓ {completed} completed</span>
                    <span className="text-muted-foreground">{remaining} remaining</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    {completed} of {total} doses taken today ({pct}%)
                  </p>
                </div>
              );
            })()}
            <div className="space-y-3">
              {!medicines || medicines.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No medicines added yet. <Link to="/medicines" className="text-brand-accent font-medium">Add one →</Link>
                </div>
              ) : (
                medicines.slice(0, 4).map((m) => {
                  const taken = logs?.has(m.id);
                  return (
                    <div key={m.id} className="flex items-center gap-4 bg-muted/40 rounded-xl p-3">
                      <div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center text-xl">💊</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{m.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {m.dosage ? `${m.dosage} • ` : ""}
                          {taken ? `Taken` : m.schedule_time ? `${m.schedule_time.slice(0, 5)}` : "Scheduled"}
                        </p>
                      </div>
                      {taken ? (
                        <span className="text-emerald-600 text-sm font-semibold pr-2 whitespace-nowrap">✓ Completed</span>
                      ) : (
                        <button
                          disabled={markTaken.isPending || isChildView}
                          onClick={() => markTaken.mutate(m.id)}
                          className="border border-brand-accent text-brand-accent font-semibold text-sm px-4 py-2 rounded-lg hover:bg-brand-accent hover:text-primary-foreground transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                          Mark as Taken
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Wellbeing Check */}
          <WellbeingCheckCard parentId={activeParentId!} isChild={isChildView} existing={wellbeing} />
        </div>

        {/* Right column */}
        <aside className="space-y-6">
          {/* Contact Details Card */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold italic tracking-tight flex items-center gap-2">
              <Phone className="size-4 text-primary" />
              {isChildView ? "Parent Contact Info" : "My Contact Info"}
            </h3>

            {isChildView ? (
              // Child views parent's contact info
              activeParent?.phone ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-foreground">{activeParent.full_name}</span>
                    <span className="font-mono text-muted-foreground">{activeParent.phone}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <a
                      href={`tel:${activeParent.phone.replace(/[^+\d]/g, "")}`}
                      onClick={() => toast.info(`📞 Calling Parent (${activeParent.phone})…`)}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                    >
                      <Phone className="size-3.5" /> Call
                    </a>
                    <a
                      href={`sms:${activeParent.phone.replace(/[^+\d]/g, "")}?body=${encodeURIComponent("Hello! Just checking in.")}`}
                      onClick={() => toast.info(`💬 Opening SMS to Parent…`)}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
                    >
                      <MessageSquare className="size-3.5" /> SMS
                    </a>
                    <a
                      href={`https://wa.me/${activeParent.phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent("Hello! Just checking in.")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => toast.success(`🟢 Opening WhatsApp for Parent…`)}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors"
                    >
                      <MessageCircle className="size-3.5" /> WhatsApp
                    </a>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No phone number saved by parent.</p>
              )
            ) : (
              // Parent view: shows own contact + child contacts
              <div className="space-y-4">
                {profile?.phone ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-muted-foreground">My Saved Number:</span>
                      <span className="font-mono font-semibold text-foreground">{profile.phone}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <a
                        href={`tel:${profile.phone.replace(/[^+\d]/g, "")}`}
                        onClick={() => toast.info(`📞 Calling My Phone (${profile.phone})…`)}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                      >
                        <Phone className="size-3.5" /> Call
                      </a>
                      <a
                        href={`sms:${profile.phone.replace(/[^+\d]/g, "")}`}
                        onClick={() => toast.info(`💬 Opening SMS to self…`)}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
                      >
                        <MessageSquare className="size-3.5" /> SMS
                      </a>
                      <a
                        href={`https://wa.me/${profile.phone.replace(/[^\d]/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => toast.success(`🟢 Opening WhatsApp…`)}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors"
                      >
                        <MessageCircle className="size-3.5" /> WhatsApp
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">You haven't saved your phone number yet.</p>
                    <Link to="/settings" className="block">
                      <Button variant="outline" size="sm" className="w-full text-xs rounded-xl">
                        Add phone in Settings
                      </Button>
                    </Link>
                  </div>
                )}

                {/* Child Contacts list */}
                {linkedChildren.length > 0 && (
                  <div className="border-t border-border pt-4 space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Family Contacts ({linkedChildren.length})
                    </h4>
                    <div className="space-y-4">
                      {linkedChildren.map((child: any) => (
                        <div key={child.id} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-semibold text-foreground">{child.full_name}</span>
                            <span className="font-mono text-xs text-muted-foreground">{child.phone ?? "No phone"}</span>
                          </div>
                          {child.phone && (
                            <div className="grid grid-cols-3 gap-2">
                              <a
                                href={`tel:${child.phone.replace(/[^+\d]/g, "")}`}
                                onClick={() => toast.info(`📞 Calling ${child.full_name} (${child.phone})…`)}
                                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                              >
                                <Phone className="size-3.5" /> Call
                              </a>
                              <a
                                href={`sms:${child.phone.replace(/[^+\d]/g, "")}?body=${encodeURIComponent("Hi! Just checking in.")}`}
                                onClick={() => toast.info(`💬 Opening SMS to ${child.full_name}…`)}
                                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
                              >
                                <MessageSquare className="size-3.5" /> SMS
                              </a>
                              <a
                                href={`https://wa.me/${child.phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent("Hi! Just checking in.")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => toast.success(`🟢 Opening WhatsApp for ${child.full_name}…`)}
                                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors"
                              >
                                <MessageCircle className="size-3.5" /> WhatsApp
                              </a>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Feeling card */}
          <div className="bg-brand text-primary-foreground rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg font-bold mb-4">
              How are you feeling, {activeParent?.full_name?.split(" ")[0] ?? "today"}?
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { e: "😊", l: "Great" },
                { e: "😐", l: "Okay" },
                { e: "😔", l: "Tired" },
              ].map((m) => {
                const selected = wellbeing?.feeling === m.l;
                return (
                  <button
                    key={m.l}
                    type="button"
                    disabled={isChildView || saveFeeling.isPending}
                    onClick={() => saveFeeling.mutate(m.l)}
                    className={`rounded-xl py-3 flex flex-col items-center gap-1 transition-colors disabled:opacity-60 ${
                      selected
                        ? "bg-white text-brand ring-2 ring-white"
                        : "bg-white/10 hover:bg-white/20"
                    }`}
                  >
                    <span className="text-2xl">{m.e}</span>
                    <span className="text-xs font-medium">{m.l}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SOS Trigger (parent only) */}
          {!isChildView && (
            <button
              onClick={() => triggerSOS.mutate()}
              disabled={triggerSOS.isPending || cooldown > 0}
              className={`w-full p-4 rounded-2xl shadow-sm flex items-center gap-3 transition-all disabled:opacity-60 ${
                cooldown > 0 ? "bg-stone-500 text-white" : "bg-red-600 hover:bg-red-700 text-white"
              }`}
            >
              <div className="size-10 rounded-full border-2 border-white/30 flex items-center justify-center">
                {cooldown > 0 ? cooldown : <Siren className="size-5" />}
              </div>
              <div className="text-left">
                <p className="font-bold leading-none">{cooldown > 0 ? "SENT" : "Emergency SOS"}</p>
                <p className="text-xs text-white/80 mt-1">{cooldown > 0 ? "Cooldown active" : "Tap to alert family"}</p>
              </div>
            </button>
          )}

          {/* Upcoming Visit */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg font-bold mb-4">Upcoming Visit</h3>
            {nextBooking ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                    {(nextBooking.caregiver_type ?? "C").slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold capitalize">{nextBooking.caregiver_type ?? "Caregiver"}</p>
                    <p className="text-xs text-muted-foreground">Scheduled visit</p>
                  </div>
                </div>
                <div className="bg-muted/60 rounded-xl p-4 mb-4">
                  <p className="text-[10px] font-bold tracking-wider text-muted-foreground mb-1">SCHEDULE</p>
                  <p className="font-bold">{format(new Date(nextBooking.scheduled_at), "EEE, h:mm a")}</p>
                  {nextBooking.notes && <p className="text-xs text-muted-foreground mt-1">{nextBooking.notes}</p>}
                </div>
                <Link to="/caregivers" className="block w-full bg-foreground text-background text-center rounded-xl py-3 text-sm font-semibold hover:opacity-90 transition-opacity">
                  View Details
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-4">No visits scheduled. Book a nurse, physiotherapist or companion.</p>
                <Link to="/caregivers" className="block w-full bg-foreground text-background text-center rounded-xl py-3 text-sm font-semibold hover:opacity-90 transition-opacity">
                  Book a Visit
                </Link>
              </>
            )}
          </div>

          {/* Recent Reports */}
          {recentReports && recentReports.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Recent Reports</h3>
                <Link to="/records" className="text-xs text-primary hover:underline">View all</Link>
              </div>
              <div className="space-y-1">
                {recentReports.map((r: any) => {
                  const hasFile = !!(r.file_path || r.file_url);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => openReport(r)}
                      className="w-full flex items-center justify-between gap-2 py-2 px-2 rounded-lg hover:bg-muted/60 transition-colors text-left border-b border-border last:border-0 disabled:opacity-60 disabled:cursor-not-allowed"
                      disabled={!hasFile}
                      title={hasFile ? "View certificate" : "No file attached"}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <span className="text-sm truncate">{r.title}</span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{format(new Date(r.record_date), "MMM d")}</span>
                        {hasFile && <ExternalLink className="size-3.5 text-muted-foreground" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </aside>
      </div>
      )}
    </AppShell>
  );
}

function VitalCard({ label, value, unit, unitClass, barClass }: { label: string; value: string; unit: string; unitClass?: string; barClass: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-2xl font-bold">{value}</span>
        <span className={`text-xs ${unitClass ?? "text-muted-foreground"}`}>{unit}</span>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div className={`h-full w-2/3 ${barClass} rounded-full`} />
      </div>
    </div>
  );
}


