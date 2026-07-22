import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useActiveParent } from "@/hooks/useProfile";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { askCompanion, type CompanionSource } from "@/lib/api/companion.functions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarDays,
  Camera,
  ChevronLeft,
  Clock,
  FileText,
  History,
  ImagePlus,
  ListOrdered,
  Loader2,
  MessageCircleHeart,
  Mic,
  MicOff,
  Paperclip,
  Volume2,
  VolumeX,
  RefreshCw,
  Send,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { useBrowserVoice } from "@/hooks/useBrowserVoice";
import { addDays, format, isToday, isYesterday, parseISO, startOfDay } from "date-fns";

export const Route = createFileRoute("/_authenticated/companion")({
  ssr: false,
  component: CompanionPage,
});

const MAX_RETRIES = 2;
const MAX_QUEUE_SIZE = 8;
const MAX_ATTACHMENTS = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_DATA_URL_CHARS = 12_000_000;
const MAX_MESSAGE_LENGTH = 3000;

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type ApiAttachment = {
  kind: "image" | "file";
  name?: string;
  mime: string;
  dataUrl: string;
};

type Attachment = ApiAttachment & {
  id: string;
  name: string;
};

type ChatMessage = {
  id: string;
  parent_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  created_by: string | null;
  is_urgent: boolean;
  response_source: CompanionSource | "user";
  intent: string | null;
};

type QueuedMessage = {
  id: string;
  text: string;
  addedAt: number;
  persistedMessageId?: string;
};

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: ApiAttachment[];
};

type CompanionAction = {
  to:
  | "/dashboard"
  | "/medicines"
  | "/appointments"
  | "/video"
  | "/wellbeing"
  | "/emergency-contacts"
  | "/sos";
  label: string;
};

function getCompanionAction(intent: string | null, urgent: boolean): CompanionAction | null {
  if (urgent || intent === "emergency") return { to: "/sos", label: "Open SOS" };

  switch (intent) {
    case "medicine_schedule":
      return { to: "/medicines", label: "Open Medicines" };
    case "appointment":
      return { to: "/appointments", label: "Open Appointments" };
    case "video_consultation":
      return { to: "/video", label: "Open Video Consult" };
    case "wellbeing":
      return { to: "/wellbeing", label: "Open Wellbeing" };
    case "emergency_contact":
      return { to: "/emergency-contacts", label: "Open Contacts" };
    case "daily_plan":
      return { to: "/dashboard", label: "Open Dashboard" };
    default:
      return null;
  }
}

function sourceLabel(source: ChatMessage["response_source"]) {
  switch (source) {
    case "gemini":
      return "Gemini";
    case "local_fallback":
      return "Free fallback";
    case "safety":
      return "Safety rules";
    case "local":
      return "Free local";
    default:
      return null;
  }
}

function formatDateLabel(dateString: string) {
  const date = parseISO(dateString);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMM d, yyyy");
}

function readAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

async function compressImage(file: File) {
  const originalDataUrl = await readAsDataUrl(file);
  const image = new Image();

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("The image could not be opened."));
    image.src = originalDataUrl;
  });

  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return { dataUrl: originalDataUrl, mime: file.type };

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const optimized = canvas.toDataURL("image/webp", 0.82);
  return optimized.length < originalDataUrl.length
    ? { dataUrl: optimized, mime: "image/webp" }
    : { dataUrl: originalDataUrl, mime: file.type };
}

function CompanionPage() {
  const { activeParentId, activeParent, isChildView } = useActiveParent();
  const queryClient = useQueryClient();
  const ask = useServerFn(askCompanion);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [cooldownEnd, setCooldownEnd] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [retryingIn, setRetryingIn] = useState(0);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [queue, setQueue] = useState<QueuedMessage[]>([]);

  const processingQueueRef = useRef(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const appendVoiceTranscript = useCallback((transcript: string) => {
    setInput((current) => [current.trim(), transcript.trim()].filter(Boolean).join(" "));
  }, []);

  const {
    recognitionSupported,
    speechSupported,
    isListening,
    isSpeaking,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    error: voiceError,
    clearError: clearVoiceError,
  } = useBrowserVoice(appendVoiceTranscript);

  const isRateLimited = cooldownEnd !== null && Date.now() < cooldownEnd;
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const isViewingToday = selectedDate === todayKey;

  const {
    data: allMessages = [],
    isLoading,
    isFetching,
    error: chatError,
    refetch,
  } = useQuery({
    queryKey: ["aiChat", activeParentId],
    enabled: !!activeParentId && !isChildView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_chat_messages")
        .select("id,parent_id,role,content,created_at,created_by,is_urgent,response_source,intent")
        .eq("parent_id", activeParentId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as ChatMessage[]).reverse();
    },
  });

  const { data: companionSettings } = useQuery({
    queryKey: ["companion-settings", activeParentId],
    enabled: Boolean(activeParentId) && !isChildView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("elder_settings")
        .select("companion_auto_read_responses,companion_emergency_escalation_enabled")
        .eq("parent_id", activeParentId!)
        .maybeSingle();

      if (error) throw error;
      return {
        autoRead: data?.companion_auto_read_responses === true,
        safetyEscalation: data?.companion_emergency_escalation_enabled === true,
      };
    },
  });

  useEffect(() => {
    if (!activeParentId || isChildView) return;
    const channel = supabase
      .channel(`ai-chat-${activeParentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ai_chat_messages",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["aiChat", activeParentId] }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeParentId, isChildView, queryClient]);

  useEffect(() => {
    if (!voiceError) return;
    toast.error(voiceError);
    clearVoiceError();
  }, [voiceError, clearVoiceError]);

  useEffect(() => {
    setSelectedDate(format(new Date(), "yyyy-MM-dd"));
    setQueue([]);
    setCooldownEnd(null);
  }, [activeParentId]);

  const messagesByDate = useMemo(() => {
    const grouped: Record<string, ChatMessage[]> = {};
    for (const message of allMessages) {
      const key = format(parseISO(message.created_at), "yyyy-MM-dd");
      (grouped[key] ??= []).push(message);
    }
    return grouped;
  }, [allMessages]);

  const historyDates = useMemo(
    () => Object.keys(messagesByDate).sort((left, right) => right.localeCompare(left)),
    [messagesByDate],
  );

  const messages = useMemo(
    () => messagesByDate[selectedDate] ?? [],
    [messagesByDate, selectedDate],
  );

  useEffect(() => {
    if (historyDates.length > 0 && !messagesByDate[selectedDate] && selectedDate !== todayKey) {
      setSelectedDate(todayKey);
    }
  }, [historyDates, messagesByDate, selectedDate, todayKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, queue]);

  useEffect(() => {
    if (!cooldownEnd) {
      setCountdown(0);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((cooldownEnd - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining === 0) setCooldownEnd(null);
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownEnd]);

  async function addFiles(files: FileList | null, kindHint?: "image" | "file") {
    if (!files?.length) return;
    const next: Attachment[] = [];

    for (const file of Array.from(files)) {
      if (attachments.length + next.length >= MAX_ATTACHMENTS) {
        toast.error(`A maximum of ${MAX_ATTACHMENTS} attachments is allowed.`);
        break;
      }

      const isImage = ACCEPTED_IMAGE_TYPES.has(file.type);
      const isPdf = file.type === "application/pdf";
      if (!isImage && !isPdf) {
        toast.error(`“${file.name}” is not supported. Add JPG, PNG, WebP, or PDF files.`);
        continue;
      }
      if (isImage && file.size > MAX_IMAGE_BYTES) {
        toast.error(`“${file.name}” is larger than 5 MB.`);
        continue;
      }
      if (isPdf && file.size > MAX_PDF_BYTES) {
        toast.error(`“${file.name}” is larger than 8 MB.`);
        continue;
      }

      try {
        const encoded = isImage
          ? await compressImage(file)
          : { dataUrl: await readAsDataUrl(file), mime: file.type };
        const currentTotal = [...attachments, ...next].reduce(
          (total, item) => total + item.dataUrl.length,
          0,
        );
        if (currentTotal + encoded.dataUrl.length > MAX_TOTAL_DATA_URL_CHARS) {
          toast.error("The combined attachment size is too large. Remove a file and try again.");
          break;
        }

        next.push({
          id: crypto.randomUUID(),
          kind: kindHint ?? (isImage ? "image" : "file"),
          name: file.name,
          mime: encoded.mime,
          dataUrl: encoded.dataUrl,
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Could not read “${file.name}”.`);
      }
    }

    if (next.length > 0) setAttachments((current) => [...current, ...next]);
  }

  function removeAttachment(id: string) {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  const setCachedMessage = useCallback(
    (message: ChatMessage) => {
      queryClient.setQueryData<ChatMessage[]>(["aiChat", activeParentId], (current = []) => {
        const without = current.filter((item) => item.id !== message.id);
        return [...without, message].sort(
          (left, right) =>
            new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
        );
      });
    },
    [activeParentId, queryClient],
  );

  const insertUserMessage = useCallback(
    async (text: string) => {
      if (!activeParentId) throw new Error("No care-recipient account is selected.");
      const { data, error } = await supabase
        .from("ai_chat_messages")
        .insert({
          parent_id: activeParentId,
          role: "user",
          content: text,
          created_by: activeParentId,
          is_urgent: false,
          response_source: "user",
          intent: null,
        })
        .select("id,parent_id,role,content,created_at,created_by,is_urgent,response_source,intent")
        .single();
      if (error) throw error;
      const message = data as ChatMessage;
      setCachedMessage(message);
      return message;
    },
    [activeParentId, setCachedMessage],
  );

  const insertAssistantMessage = useCallback(
    async (
      content: string,
      urgent: boolean,
      responseSource: CompanionSource,
      intent: string | null,
    ) => {
      if (!activeParentId) throw new Error("No care-recipient account is selected.");
      const { data, error } = await supabase
        .from("ai_chat_messages")
        .insert({
          parent_id: activeParentId,
          role: "assistant",
          content,
          created_by: activeParentId,
          is_urgent: urgent,
          response_source: responseSource,
          intent,
        })
        .select("id,parent_id,role,content,created_at,created_by,is_urgent,response_source,intent")
        .single();
      if (error) throw error;
      setCachedMessage(data as ChatMessage);
    },
    [activeParentId, setCachedMessage],
  );

  function waitWithCountdown(milliseconds: number) {
    return new Promise<void>((resolve) => {
      let remaining = Math.ceil(milliseconds / 1000);
      setRetryingIn(remaining);
      const timer = window.setInterval(() => {
        remaining -= 1;
        setRetryingIn(Math.max(0, remaining));
        if (remaining <= 0) {
          window.clearInterval(timer);
          resolve();
        }
      }, 1000);
    });
  }

  const buildHistory = useCallback(
    async (currentText: string, currentAttachments: ApiAttachment[], currentMessageId: string) => {
      if (!activeParentId) return [] as HistoryMessage[];
      const { data, error } = await supabase
        .from("ai_chat_messages")
        .select("id,role,content,created_at")
        .eq("parent_id", activeParentId)
        .neq("id", currentMessageId)
        .order("created_at", { ascending: false })
        .limit(19);
      if (error) throw error;

      const previous = ((data ?? []) as Pick<ChatMessage, "role" | "content">[])
        .reverse()
        .map((message) => ({ role: message.role, content: message.content }));

      return [
        ...previous,
        {
          role: "user" as const,
          content: currentText || "Please review the attached file.",
          attachments: currentAttachments.length ? currentAttachments : undefined,
        },
      ];
    },
    [activeParentId],
  );

  const sendWithRetry = useCallback(
    async (text: string, currentAttachments: ApiAttachment[], userMessageId: string) => {
      if (!activeParentId) return false;
      const history = await buildHistory(text, currentAttachments, userMessageId);

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        setRetryAttempt(attempt);
        const result = await ask({
          data: {
            parentId: activeParentId,
            parentName: activeParent?.full_name,
            messages: history,
          },
        });

        if (result.reply) {
          await insertAssistantMessage(
            result.reply,
            Boolean(result.urgent),
            result.source ?? "local",
            result.intent ?? null,
          );

          if (companionSettings?.autoRead && speechSupported) {
            speak(result.reply);
          }

          if (result.urgent) {
            toast.warning(
              result.escalated
                ? "A possible emergency was detected. A generic safety alert was sent to linked family members."
                : "A possible emergency was detected. Review the SOS guidance now.",
            );
          } else if (result.message) {
            toast.info(result.message);
          }

          setRetryAttempt(0);
          return true;
        }

        if (result.error === "rate_limit") {
          const waitSeconds = result.retryAfter ?? 30;
          if (attempt < MAX_RETRIES) {
            toast.warning(`The companion is busy. Retrying in ${waitSeconds} seconds.`);
            await waitWithCountdown(waitSeconds * 1000);
            continue;
          }
          setCooldownEnd(Date.now() + waitSeconds * 1000);
          toast.error(result.message ?? "Please wait before trying again.");
          return false;
        }

        if (result.error === "forbidden") {
          toast.error(
            result.message ?? "This conversation is private to the care-recipient account.",
          );
          return false;
        }

        toast.error(result.message ?? "The AI companion is temporarily unavailable.");
        return false;
      }

      return false;
    },
    [
      activeParent?.full_name,
      activeParentId,
      ask,
      buildHistory,
      companionSettings?.autoRead,
      insertAssistantMessage,
      speak,
      speechSupported,
    ],
  );

  const processQueue = useCallback(async () => {
    if (processingQueueRef.current || sending || queue.length === 0 || isRateLimited || isChildView)
      return;
    processingQueueRef.current = true;
    setSending(true);

    try {
      const item = queue[0];
      let messageId = item.persistedMessageId;

      if (!messageId) {
        const saved = await insertUserMessage(item.text);
        messageId = saved.id;
        setQueue((current) =>
          current.map((queued) =>
            queued.id === item.id ? { ...queued, persistedMessageId: messageId } : queued,
          ),
        );
      }

      const success = await sendWithRetry(item.text, [], messageId);
      if (success) {
        setQueue((current) => current.filter((queued) => queued.id !== item.id));
        toast.success("Queued message sent.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The queued message could not be sent.");
    } finally {
      setSending(false);
      processingQueueRef.current = false;
    }
  }, [insertUserMessage, isChildView, isRateLimited, queue, sendWithRetry, sending]);

  useEffect(() => {
    if (!isRateLimited && countdown === 0 && queue.length > 0 && !processingQueueRef.current) {
      void processQueue();
    }
  }, [countdown, isRateLimited, processQueue, queue.length]);

  async function send() {
    const text = input.trim();
    if (isChildView) {
      toast.error("AI Companion conversations are private to the care-recipient account.");
      return;
    }
    if ((!text && attachments.length === 0) || !activeParentId || sending) return;
    if (text.length > MAX_MESSAGE_LENGTH) {
      toast.error(`Messages must be ${MAX_MESSAGE_LENGTH.toLocaleString()} characters or fewer.`);
      return;
    }

    if (isRateLimited) {
      if (attachments.length > 0) {
        toast.warning(
          "Attachments cannot be queued. Keep them selected and send after the cooldown ends.",
        );
        return;
      }
      if (queue.length >= MAX_QUEUE_SIZE) {
        toast.error(`The queue is full (${MAX_QUEUE_SIZE} messages).`);
        return;
      }
      setQueue((current) => [...current, { id: crypto.randomUUID(), text, addedAt: Date.now() }]);
      setInput("");
      toast.info("Message queued and will be sent automatically.");
      return;
    }

    const currentAttachments = attachments.map(({ kind, name, mime, dataUrl }) => ({
      kind,
      name,
      mime,
      dataUrl,
    }));
    const attachmentLabel = attachments
      .map((attachment) => `${attachment.kind === "image" ? "🖼️" : "📎"} ${attachment.name}`)
      .join("  ");
    const storedText = [text, attachmentLabel].filter(Boolean).join("\n");

    setInput("");
    setAttachments([]);
    setSelectedDate(todayKey);
    setSending(true);

    try {
      const userMessage = await insertUserMessage(storedText || "Attached document");
      await sendWithRetry(text, currentAttachments, userMessage.id);
      queryClient.invalidateQueries({ queryKey: ["aiChat", activeParentId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The message could not be sent.");
    } finally {
      setSending(false);
      setRetryAttempt(0);
      setRetryingIn(0);
    }
  }

  const deleteMessage = useMutation({
    mutationFn: async (id: string) => {
      if (!activeParentId || isChildView) throw new Error("You cannot delete this message.");
      const { data, error } = await supabase
        .from("ai_chat_messages")
        .delete()
        .eq("id", id)
        .eq("parent_id", activeParentId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The message was not deleted. Check your permissions.");
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData<ChatMessage[]>(["aiChat", activeParentId], (current = []) =>
        current.filter((message) => message.id !== id),
      );
      queryClient.invalidateQueries({ queryKey: ["aiChat", activeParentId] });
      toast.success("Message deleted.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const clearChat = useMutation({
    mutationFn: async () => {
      if (!activeParentId || isChildView) throw new Error("You cannot clear this conversation.");
      const dateStart = startOfDay(new Date(`${selectedDate}T12:00:00`));
      const dateEnd = addDays(dateStart, 1);
      const { data, error } = await supabase
        .from("ai_chat_messages")
        .delete()
        .eq("parent_id", activeParentId)
        .gte("created_at", dateStart.toISOString())
        .lt("created_at", dateEnd.toISOString())
        .select("id");
      if (error) throw error;
      if (messages.length > 0 && (data?.length ?? 0) === 0) {
        throw new Error("No messages were deleted. Check your database permissions.");
      }
      return new Set<string>((data ?? []).map((row: { id: string }) => row.id));
    },
    onSuccess: (deletedIds) => {
      queryClient.setQueryData<ChatMessage[]>(["aiChat", activeParentId], (current = []) =>
        current.filter((message) => !deletedIds.has(message.id)),
      );
      if (isViewingToday) setQueue([]);
      queryClient.invalidateQueries({ queryKey: ["aiChat", activeParentId] });
      toast.success("Conversation cleared.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isChildView) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl py-12">
          <div className="rounded-3xl border border-blue-200 bg-blue-50 p-8 text-center text-blue-950 shadow-sm">
            <ShieldAlert className="mx-auto mb-4 size-10 text-blue-600" />
            <h1 className="font-display text-3xl font-bold italic">AI Companion is private</h1>
            <p className="mt-3 text-sm leading-relaxed">
              Companion conversations may contain personal feelings, symptoms, photos, and medical
              documents. They are available only from the care-recipient account and are not shared
              with linked family accounts.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold italic sm:text-4xl">AI Companion</h1>
          <p className="mt-1 text-muted-foreground">
            A private, friendly chat helper for {activeParent?.full_name ?? "you"}. Medicines,
            appointments, wellbeing, daily planning, voice input, and read-aloud work for free.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="rounded-xl"
            >
              <RefreshCw className={`mr-2 size-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistory((current) => !current)}
              className="rounded-xl"
            >
              <History className="mr-2 size-4" /> {showHistory ? "Hide History" : "Chat History"}
            </Button>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            <Badge variant="secondary">Free local mode</Badge>
            {companionSettings?.autoRead && <Badge variant="outline">Auto read-aloud</Badge>}
            {companionSettings?.safetyEscalation && (
              <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                Family safety alerts enabled
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <ShieldAlert className="mt-0.5 size-5 shrink-0" />
        <p>
          The companion can make mistakes and cannot contact emergency services. For chest pain,
          severe breathing difficulty, fainting, stroke signs, serious bleeding, or immediate
          danger, use SOS now. Private chat text is never shared. When family safety alerts are
          enabled in Settings, only a generic emergency warning is sent.
        </p>
      </div>

      {chatError && (
        <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Chat history could not be loaded. {(chatError as Error).message}
        </div>
      )}

      <div className={`flex gap-4 ${showHistory ? "flex-col md:flex-row" : ""}`}>
        {showHistory && (
          <aside className="w-full shrink-0 md:w-60">
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="border-b border-border p-3">
                <p className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Conversations
                </p>
              </div>
              <div className="max-h-[65vh] divide-y divide-border overflow-y-auto">
                {!messagesByDate[todayKey] && (
                  <button
                    type="button"
                    onClick={() => setSelectedDate(todayKey)}
                    className={`w-full px-3 py-2.5 text-left text-sm ${isViewingToday ? "bg-primary/5 font-medium text-primary" : "text-muted-foreground hover:bg-muted/40"}`}
                  >
                    <span className="flex items-center gap-2">
                      <CalendarDays className="size-3.5" /> Today (new)
                    </span>
                  </button>
                )}
                {historyDates.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    No conversations yet
                  </p>
                ) : (
                  historyDates.map((date) => (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setSelectedDate(date)}
                      className={`w-full px-3 py-2.5 text-left text-sm ${date === selectedDate ? "bg-primary/5 font-medium text-primary" : "text-muted-foreground hover:bg-muted/40"}`}
                    >
                      <span className="flex items-center gap-2">
                        <CalendarDays className="size-3.5" /> {formatDateLabel(date)}
                      </span>
                      <span className="mt-0.5 block pl-5 text-xs opacity-60">
                        {messagesByDate[date].length} messages
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
            {allMessages.length === 500 && (
              <p className="mt-2 px-2 text-[10px] text-muted-foreground">
                Showing the newest 500 messages.
              </p>
            )}
          </aside>
        )}

        <div className="flex h-[68vh] flex-1 flex-col overflow-hidden rounded-3xl border border-border bg-card">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {showHistory && <ChevronLeft className="size-4 md:hidden" />}
              <CalendarDays className="size-4" />
              <span className="font-medium text-foreground">
                {isViewingToday ? "Today" : formatDateLabel(selectedDate)}
              </span>
              {!isViewingToday && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(todayKey)}
                  className="text-xs text-primary hover:underline"
                >
                  Back to today
                </button>
              )}
            </div>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                disabled={clearChat.isPending}
                onClick={() => {
                  if (confirm(`Clear ${isViewingToday ? "today's" : "this day's"} conversation?`))
                    clearChat.mutate();
                }}
                className="h-8 rounded-lg text-xs text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="mr-1.5 size-3.5" />{" "}
                {clearChat.isPending ? "Clearing…" : "Clear chat"}
              </Button>
            )}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
            {isLoading ? (
              <div className="grid h-full place-items-center text-muted-foreground">
                <Loader2 className="size-7 animate-spin" />
              </div>
            ) : messages.length === 0 && !sending ? (
              <div className="grid h-full place-items-center text-center text-muted-foreground">
                <div className="max-w-md">
                  <MessageCircleHeart className="mx-auto mb-3 size-10 text-secondary" />
                  <p className="font-medium text-foreground">
                    {isViewingToday ? "Say hello to your companion" : "No messages on this day"}
                  </p>
                  {isViewingToday ? (
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {[
                        "What medicines do I need today?",
                        "When is my next appointment?",
                        "How is my wellbeing today?",
                        "Help me plan my day.",
                      ].map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => setInput(prompt)}
                          className="rounded-full border border-border bg-background px-3 py-1.5 text-xs hover:border-primary/40 hover:text-primary"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedDate(todayKey)}
                      className="mt-2 text-sm text-primary hover:underline"
                    >
                      Go to today's chat
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`group flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className="flex max-w-[88%] items-start gap-1.5 sm:max-w-[78%]">
                  {message.role === "user" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm("Delete this message?")) deleteMessage.mutate(message.id);
                      }}
                      className="mt-1 size-7 shrink-0 rounded-lg text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-destructive"
                      aria-label="Delete message"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : message.is_urgent
                          ? "border border-red-300 bg-red-50 text-red-950"
                          : "bg-accent text-accent-foreground"
                      }`}
                  >
                    {message.is_urgent && (
                      <div className="mb-2 flex items-center gap-2 font-semibold">
                        <AlertTriangle className="size-4" /> Possible emergency
                      </div>
                    )}
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    {message.role === "assistant" &&
                      getCompanionAction(message.intent, message.is_urgent) && (
                        <Button
                          asChild
                          variant={message.is_urgent ? "destructive" : "outline"}
                          size="sm"
                          className="mt-3 rounded-xl"
                        >
                          <Link to={getCompanionAction(message.intent, message.is_urgent)!.to}>
                            {getCompanionAction(message.intent, message.is_urgent)!.label}
                          </Link>
                        </Button>
                      )}
                    <div
                      className={`mt-1.5 flex flex-wrap items-center gap-1.5 text-[9px] ${message.role === "user" ? "text-primary-foreground/60" : "opacity-60"}`}
                    >
                      <span>{format(new Date(message.created_at), "h:mm a")}</span>
                      {message.role === "assistant" && sourceLabel(message.response_source) && (
                        <span className="rounded-full border border-current/20 px-1.5 py-0.5">
                          {sourceLabel(message.response_source)}
                        </span>
                      )}
                    </div>
                  </div>
                  {message.role === "assistant" && (
                    <div className="mt-1 flex shrink-0 flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      {speechSupported && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (isSpeaking) stopSpeaking();
                            else speak(message.content);
                          }}
                          className="size-7 rounded-lg text-muted-foreground hover:text-primary"
                          aria-label={isSpeaking ? "Stop reading message" : "Read message aloud"}
                          title={isSpeaking ? "Stop reading" : "Read aloud"}
                        >
                          {isSpeaking ? (
                            <VolumeX className="size-3.5" />
                          ) : (
                            <Volume2 className="size-3.5" />
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm("Delete this message?")) deleteMessage.mutate(message.id);
                        }}
                        className="size-7 rounded-lg text-muted-foreground hover:text-destructive"
                        aria-label="Delete message"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {queue
              .filter((item) => !item.persistedMessageId)
              .map((item) => (
                <div key={item.id} className="flex justify-end">
                  <div className="max-w-[78%] rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950">
                    <p className="whitespace-pre-wrap">{item.text}</p>
                    <p className="mt-1 flex items-center justify-end gap-1 text-[9px] opacity-60">
                      <Clock className="size-3" /> Queued
                    </p>
                  </div>
                </div>
              ))}

            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl bg-accent px-4 py-2.5 text-sm text-accent-foreground">
                  {retryingIn > 0 ? (
                    <Clock className="size-4 animate-pulse" />
                  ) : (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  {retryingIn > 0
                    ? `Retrying in ${retryingIn}s (attempt ${retryAttempt + 1}/${MAX_RETRIES + 1})`
                    : "Thinking…"}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {isRateLimited && (
            <div className="shrink-0 space-y-1 border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="flex items-center gap-2 font-medium">
                <Clock className="size-4" /> Please wait {countdown}s before another request.
              </div>
              {queue.length > 0 && (
                <p className="flex items-center gap-2 text-xs">
                  <ListOrdered className="size-3.5" /> {queue.length} queued message
                  {queue.length === 1 ? "" : "s"}
                </p>
              )}
            </div>
          )}

          <div className="shrink-0 space-y-2 border-t border-border p-3 sm:p-4">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="relative flex max-w-[220px] items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 py-1 pl-1 pr-7 text-xs text-blue-950"
                  >
                    {attachment.kind === "image" ? (
                      <img
                        src={attachment.dataUrl}
                        alt=""
                        className="size-8 rounded object-cover"
                      />
                    ) : (
                      <FileText className="ml-1 size-5 text-blue-600" />
                    )}
                    <span className="truncate">{attachment.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(attachment.id)}
                      className="absolute right-1 top-1 rounded-full p-0.5 hover:bg-blue-200"
                      aria-label="Remove attachment"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(event) => {
                void addFiles(event.target.files, "image");
                event.target.value = "";
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                void addFiles(event.target.files, "image");
                event.target.value = "";
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(event) => {
                void addFiles(event.target.files);
                event.target.value = "";
              }}
            />

            <div className="flex items-end gap-2">
              <div className="hidden gap-1 sm:flex">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={!isViewingToday || attachments.length >= MAX_ATTACHMENTS}
                  className="rounded-xl"
                  title="Add image"
                >
                  <ImagePlus className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={!isViewingToday || attachments.length >= MAX_ATTACHMENTS}
                  className="rounded-xl"
                  title="Take photo"
                >
                  <Camera className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!isViewingToday || attachments.length >= MAX_ATTACHMENTS}
                  className="rounded-xl"
                  title="Attach PDF or image"
                >
                  <Paperclip className="size-4" />
                </Button>
              </div>

              <div className="flex-1">
                <Textarea
                  value={input}
                  maxLength={MAX_MESSAGE_LENGTH}
                  rows={2}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  placeholder={
                    !isViewingToday
                      ? "Return to Today to send a message…"
                      : isRateLimited
                        ? `Type a message to queue (${queue.length}/${MAX_QUEUE_SIZE})…`
                        : "Type a message…"
                  }
                  disabled={!activeParentId || !isViewingToday || (sending && !isRateLimited)}
                  className="min-h-[54px] resize-none"
                />
                <p className="mt-1 text-right text-[9px] text-muted-foreground">
                  {input.length}/{MAX_MESSAGE_LENGTH}
                </p>
              </div>

              <Button
                onClick={() => void send()}
                disabled={
                  !activeParentId ||
                  !isViewingToday ||
                  (sending && !isRateLimited) ||
                  (!input.trim() && attachments.length === 0) ||
                  (isRateLimited && queue.length >= MAX_QUEUE_SIZE)
                }
                className="h-[54px] rounded-xl px-4"
                aria-label="Send message"
              >
                {isRateLimited ? <ListOrdered className="size-4" /> : <Send className="size-4" />}
              </Button>

              {recognitionSupported && (
                <Button
                  type="button"
                  variant={isListening ? "destructive" : "outline"}
                  onClick={() => {
                    if (isListening) stopListening();
                    else startListening();
                  }}
                  disabled={!isViewingToday || sending}
                  className="h-[54px] rounded-xl px-4"
                  title={isListening ? "Stop voice input" : "Speak your message"}
                  aria-label={isListening ? "Stop voice input" : "Start voice input"}
                >
                  {isListening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                </Button>
              )}
            </div>

            <div className="flex gap-1 sm:hidden">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => imageInputRef.current?.click()}
                disabled={!isViewingToday || attachments.length >= MAX_ATTACHMENTS}
              >
                <ImagePlus className="mr-1.5 size-4" /> Image
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => cameraInputRef.current?.click()}
                disabled={!isViewingToday || attachments.length >= MAX_ATTACHMENTS}
              >
                <Camera className="mr-1.5 size-4" /> Camera
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={!isViewingToday || attachments.length >= MAX_ATTACHMENTS}
              >
                <Paperclip className="mr-1.5 size-4" /> File
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}