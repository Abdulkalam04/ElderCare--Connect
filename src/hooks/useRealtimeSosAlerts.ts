import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type SosRealtimeRow = {
  id: string;
  parent_id: string;
  parent_name?: string | null;
  message: string | null;
  status?: "active" | "acknowledged" | "resolved";
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  acknowledged_by?: string | null;
  resolved_by?: string | null;
};

type SosRealtimeOptions = {
  currentUserId?: string | null;
  notifyOnInsert?: boolean;
  onAlert?: (alert: SosRealtimeRow) => void;
  onChange?: (event: "INSERT" | "UPDATE" | "DELETE", row: SosRealtimeRow) => void;
};

/**
 * Keeps SOS queries synchronized for the selected care-recipient account.
 * It listens for inserts, acknowledgements, resolutions, and deletions.
 *
 * The second argument remains backwards-compatible with the old callback form.
 */
export function useRealtimeSosAlerts(
  parentIds: string[] | undefined,
  callbackOrOptions?: ((alert: SosRealtimeRow) => void) | SosRealtimeOptions,
) {
  const qc = useQueryClient();
  const seenInsertIds = useRef<Set<string>>(new Set());
  const optionsRef = useRef<SosRealtimeOptions>({});

  optionsRef.current =
    typeof callbackOrOptions === "function"
      ? { onAlert: callbackOrOptions, notifyOnInsert: true }
      : callbackOrOptions ?? {};

  const stableIds = [...new Set(parentIds ?? [])].filter(Boolean).sort();
  const stableKey = stableIds.join(",");

  useEffect(() => {
    if (stableIds.length === 0) return;

    let channel = supabase.channel(
      `sos-alerts-${stableIds.join("-")}-${Math.random().toString(36).slice(2, 9)}`,
    );

    const handleChange = (
      event: "INSERT" | "UPDATE" | "DELETE",
      payload: { new: Record<string, unknown>; old: Record<string, unknown> },
    ) => {
      const row = (event === "DELETE" ? payload.old : payload.new) as SosRealtimeRow;
      if (!row?.id) return;

      qc.invalidateQueries({ queryKey: ["sos"] });
      qc.invalidateQueries({ queryKey: ["activeSosDashboard"] });
      qc.invalidateQueries({ queryKey: ["activeSosAlerts"] });
      qc.invalidateQueries({ queryKey: ["parent_active_sos"] });

      const options = optionsRef.current;
      options.onChange?.(event, row);

      if (event === "INSERT") {
        if (seenInsertIds.current.has(row.id)) return;
        seenInsertIds.current.add(row.id);

        options.onAlert?.(row);

        if (options.notifyOnInsert) {
          toast.error("New SOS alert", {
            description: `${row.parent_name || "A care recipient"} requested emergency assistance.`,
            duration: 15000,
            action: {
              label: "View",
              onClick: () => {
                window.location.href = "/sos";
              },
            },
          });
        }
        return;
      }

      if (event === "UPDATE") {
        const currentUserId = options.currentUserId;

        if (
          row.status === "acknowledged" &&
          row.acknowledged_by &&
          row.acknowledged_by !== currentUserId
        ) {
          toast.success("SOS alert acknowledged", {
            description: "A linked family member has seen the emergency request.",
          });
        }

        if (
          row.status === "resolved" &&
          row.resolved_by &&
          row.resolved_by !== currentUserId
        ) {
          toast.success("SOS alert resolved", {
            description: "The emergency request has been marked as resolved.",
          });
        }
      }
    };

    for (const parentId of stableIds) {
      const filter = `parent_id=eq.${parentId}`;

      channel = channel
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "sos_alerts", filter },
          (payload) => handleChange("INSERT", payload as any),
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "sos_alerts", filter },
          (payload) => handleChange("UPDATE", payload as any),
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "sos_alerts", filter },
          (payload) => handleChange("DELETE", payload as any),
        );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [stableKey, qc]);
}
