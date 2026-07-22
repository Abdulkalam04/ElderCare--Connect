import { useCallback, useEffect, useRef, useState } from "react";
import { getVapi, COMPANION_ASSISTANT_CONFIG } from "@/lib/vapi";

export type VapiCallStatus = "idle" | "connecting" | "active" | "ending";

function getFriendlyVoiceError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("permission") || message.includes("microphone") || message.includes("notallowed")) {
    return "Microphone permission is required for a voice call.";
  }
  if (message.includes("public key") || message.includes("unauthorized") || message.includes("401")) {
    return "Voice Companion is not configured correctly.";
  }
  return "The voice call could not be started. Please try again.";
}

/** Manages one VAPI voice call and always ends it when the page unmounts. */
export function useVapi() {
  const vapiRef = useRef<ReturnType<typeof getVapi>>(null);
  if (vapiRef.current === null) vapiRef.current = getVapi();

  const [status, setStatus] = useState<VapiCallStatus>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const isAvailable = vapiRef.current !== null;

  useEffect(() => {
    const vapi = vapiRef.current;
    if (!vapi) return;

    const onCallStart = () => {
      setStatus("active");
      setError(null);
    };
    const onCallEnd = () => {
      setStatus("idle");
      setIsMuted(false);
      setVolumeLevel(0);
    };
    const onVolume = (volume: number) => setVolumeLevel(volume);
    const onError = (voiceError: unknown) => {
      console.error("[VAPI] call error", voiceError);
      setError(getFriendlyVoiceError(voiceError));
      setStatus("idle");
      setIsMuted(false);
      setVolumeLevel(0);
    };

    vapi.on("call-start", onCallStart);
    vapi.on("call-end", onCallEnd);
    vapi.on("volume-level", onVolume);
    vapi.on("error", onError);

    return () => {
      vapi.off("call-start", onCallStart);
      vapi.off("call-end", onCallEnd);
      vapi.off("volume-level", onVolume);
      vapi.off("error", onError);
      try {
        vapi.stop();
      } catch {
        // The call may already be closed.
      }
    };
  }, []);

  const startCall = useCallback(async () => {
    const vapi = vapiRef.current;
    if (!vapi || status !== "idle") return false;
    setStatus("connecting");
    setError(null);
    try {
      await vapi.start(COMPANION_ASSISTANT_CONFIG as unknown as Parameters<typeof vapi.start>[0]);
      return true;
    } catch (voiceError) {
      console.error("[VAPI] failed to start", voiceError);
      setError(getFriendlyVoiceError(voiceError));
      setStatus("idle");
      return false;
    }
  }, [status]);

  const stopCall = useCallback(() => {
    const vapi = vapiRef.current;
    if (!vapi || status === "idle") return;
    setStatus("ending");
    try {
      vapi.stop();
    } catch (voiceError) {
      console.error("[VAPI] failed to stop", voiceError);
      setStatus("idle");
    }
  }, [status]);

  const toggleMute = useCallback(() => {
    const vapi = vapiRef.current;
    if (!vapi || status !== "active") return;
    const next = !isMuted;
    vapi.setMuted(next);
    setIsMuted(next);
  }, [isMuted, status]);

  return {
    status,
    startCall,
    stopCall,
    isMuted,
    toggleMute,
    volumeLevel,
    isAvailable,
    error,
    clearError: () => setError(null),
  };
}
