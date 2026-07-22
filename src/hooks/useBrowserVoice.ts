import { useCallback, useEffect, useRef, useState } from "react";

type RecognitionAlternative = { transcript: string };
type RecognitionResult = { 0: RecognitionAlternative; isFinal: boolean };
type RecognitionEvent = { results: ArrayLike<RecognitionResult> };
type RecognitionErrorEvent = { error?: string };

type BrowserRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type RecognitionConstructor = new () => BrowserRecognition;

declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  }
}

function friendlyRecognitionError(code?: string) {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone permission is required for voice input.";
    case "no-speech":
      return "No speech was detected. Please try again.";
    case "audio-capture":
      return "No working microphone was found.";
    case "network":
      return "Browser voice recognition is temporarily unavailable.";
    default:
      return "Voice input could not be started in this browser.";
  }
}

/**
 * Free browser voice helpers. Speech recognition support depends on the browser,
 * while speech synthesis is available in most modern browsers.
 */
export function useBrowserVoice(onTranscript: (text: string) => void) {
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionSupported =
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // The recognition session may already be closed.
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionSupported || typeof window === "undefined") {
      setError("Voice input is not supported in this browser. You can still type messages.");
      return false;
    }

    stopListening();
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return false;

    const recognition = new Recognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) onTranscript(transcript);
    };
    recognition.onerror = (event) => {
      setError(friendlyRecognitionError(event.error));
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setError(null);
    setIsListening(true);

    try {
      recognition.start();
      return true;
    } catch {
      setIsListening(false);
      setError("Voice input could not be started. Please try again.");
      return false;
    }
  }, [onTranscript, recognitionSupported, stopListening]);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!speechSupported || typeof window === "undefined") {
        setError("Read-aloud is not supported in this browser.");
        return false;
      }

      const clean = text.trim();
      if (!clean) return false;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = "en-IN";
      utterance.rate = 0.92;
      utterance.pitch = 1;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => {
        setIsSpeaking(false);
        setError("The message could not be read aloud.");
      };
      window.speechSynthesis.speak(utterance);
      return true;
    },
    [speechSupported],
  );

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        // Ignore cleanup failures.
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return {
    recognitionSupported,
    speechSupported,
    isListening,
    isSpeaking,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    error,
    clearError: () => setError(null),
  };
}
