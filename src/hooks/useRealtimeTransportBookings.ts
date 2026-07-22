import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TransportRealtimePayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  old: Record<string, unknown>;
  new: Record<string, unknown>;
};

/**
 * Keeps the transport list synchronized across tabs and linked accounts.
 * INSERT, UPDATE, and DELETE are handled so removed rides disappear without
 * requiring a page refresh.
 */
export function useRealtimeTransportBookings(
  parentId: string | null | undefined,
  onUpdate?: (payload: TransportRealtimePayload) => void,
) {
  const queryClient = useQueryClient();
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!parentId) return;

    const filter = `parent_id=eq.${parentId}`;
    const channel = supabase
      .channel(`transport-bookings-${parentId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transport_bookings",
          filter,
        },
        (payload: any) => {
          const eventType = payload.eventType as "INSERT" | "UPDATE" | "DELETE";

          queryClient.invalidateQueries({ queryKey: ["transport", parentId] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });

          const newRow = (payload.new ?? {}) as Record<string, unknown>;
          const oldRow = (payload.old ?? {}) as Record<string, unknown>;

          if (
            eventType === "UPDATE" &&
            typeof newRow.driver_id === "string" &&
            newRow.driver_id !== oldRow.driver_id
          ) {
            queryClient.invalidateQueries({ queryKey: ["driver-profiles"] });
          }

          onUpdateRef.current?.({ eventType, old: oldRow, new: newRow });
        },
      )
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[transport-realtime] channel error:", error);
        }
        if (status === "TIMED_OUT") {
          console.warn("[transport-realtime] subscription timed out; Supabase will retry.");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [parentId, queryClient]);
}
