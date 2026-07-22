import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
const MIN_UPDATE_GAP_MS = 10000;
const MIN_DISTANCE_METERS = 20;
type Point = {
  latitude: number;
  longitude: number;
};
function distanceMeters(a: Point, b: Point) {
  const earthRadius = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}
export function useSosLiveLocation(options: {
  alertId: string | null | undefined;
  parentId: string | null | undefined;
  actorId: string | null | undefined;
  enabled: boolean;
}) {
  const { alertId, parentId, actorId, enabled } = options;
  const [state, setState] = useState<
    "idle" | "requesting" | "tracking" | "denied" | "unavailable" | "error"
  >("idle");
  const lastWriteRef = useRef(0);
  const lastPointRef = useRef<Point | null>(null);
  useEffect(() => {
    if (
      !enabled ||
      !alertId ||
      !parentId ||
      actorId !== parentId ||
      typeof navigator === "undefined" ||
      !("geolocation" in navigator)
    ) {
      setState(enabled && alertId ? "unavailable" : "idle");
      return;
    }
    let disposed = false;
    let pending = false;
    setState("requesting");
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        if (disposed || pending) return;
        const point = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        const moved = lastPointRef.current
          ? distanceMeters(lastPointRef.current, point)
          : Number.POSITIVE_INFINITY;
        const elapsed = Date.now() - lastWriteRef.current;
        if (elapsed < MIN_UPDATE_GAP_MS && moved < MIN_DISTANCE_METERS) {
          setState("tracking");
          return;
        }
        pending = true;
        const updatedAt = new Date(position.timestamp || Date.now()).toISOString();
        const { data, error } = await supabase
          .from("sos_alerts")
          .update({
            latitude: point.latitude,
            longitude: point.longitude,
            location_accuracy: Math.round(position.coords.accuracy),
            location_updated_at: updatedAt,
            live_location_enabled: true,
          } as any)
          .eq("id", alertId)
          .eq("parent_id", parentId)
          .in("status", ["active", "acknowledged"])
          .select("id")
          .maybeSingle();
        pending = false;
        if (disposed) return;
        if (error) {
          console.error("Unable to update live SOS location", error);
          setState("error");
          return;
        }
        if (!data) {
          setState("idle");
          return;
        }
        lastWriteRef.current = Date.now();
        lastPointRef.current = point;
        setState("tracking");
      },
      (error) => {
        if (disposed) return;
        if (error.code === error.PERMISSION_DENIED) setState("denied");
        else if (error.code === error.POSITION_UNAVAILABLE) setState("unavailable");
        else setState("error");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      },
    );
    return () => {
      disposed = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [actorId, alertId, enabled, parentId]);
  return state;
}
