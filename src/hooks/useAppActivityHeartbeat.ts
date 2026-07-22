import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
const MIN_WRITE_GAP_MS = 3 * 60 * 1000;
function storageKey(userId: string) {
  return `eldercare:last-activity-write:${userId}`;
}
export function useAppActivityHeartbeat(options: {
  userId: string | null | undefined;
  role: "parent" | "child" | undefined;
}) {
  const { userId, role } = options;
  useEffect(() => {
    if (!userId || role !== "parent" || typeof window === "undefined") return;
    let disposed = false;
    const touch = async (source: string, force = false) => {
      const key = storageKey(userId);
      const previous = Number(window.localStorage.getItem(key) ?? 0);
      if (!force && Date.now() - previous < MIN_WRITE_GAP_MS) return;
      const { error } = await supabase.rpc("touch_app_activity", {
        _source: source,
      });
      if (!error && !disposed) {
        window.localStorage.setItem(key, String(Date.now()));
      } else if (error) {
        console.error("Unable to update app activity heartbeat", error);
      }
    };
    void touch("app_open", true);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void touch("heartbeat");
    }, HEARTBEAT_INTERVAL_MS);
    const onFocus = () => void touch("window_focus");
    const onVisibility = () => {
      if (document.visibilityState === "visible") void touch("tab_visible");
    };
    const onInteraction = () => void touch("user_interaction");
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointerdown", onInteraction, { passive: true });
    window.addEventListener("keydown", onInteraction, { passive: true });
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointerdown", onInteraction);
      window.removeEventListener("keydown", onInteraction);
    };
  }, [role, userId]);
}
