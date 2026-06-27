import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GoogleGenAI } from "@google/genai";

const Attachment = z.object({
  kind: z.enum(["image", "file"]),
  name: z.string().max(200).optional(),
  mime: z.string().max(120),
  // data URL: data:<mime>;base64,xxxx
  dataUrl: z.string().max(15_000_000),
});

const ChatInput = z.object({
  parentName: z.string().max(120).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
        attachments: z.array(Attachment).max(6).optional(),
      }),
    )
    .min(1)
    .max(40),
});

export const askCompanion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => ChatInput.parse(data))
  .handler(async ({ data }): Promise<{ reply?: string; error?: string; retryAfter?: number | null; message?: string }> => {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return { error: "not_configured" };

    const ai = new GoogleGenAI({
      apiKey: geminiKey,
    });

    const system = `You are "Companion", a warm, patient and friendly AI friend for an elderly person${
      data.parentName ? ` named ${data.parentName}` : ""
    }.
- Speak simply, kindly and slowly, in short sentences.
- Gently remind them about taking medicines, drinking water, eating, and resting when relevant.
- Answer everyday questions and offer companionship and encouragement.
- If the user shares a photo or document (prescription, lab report, food, etc.), describe what you see and offer helpful, plain-language guidance.
- You are NOT a doctor. For any medical emergency or worrying symptom, calmly tell them to use the SOS button or call their family/doctor.
- Be cheerful and never condescending.`;

    // Issue 3 & 4: Strongly typed parts and mapped roles
    const contents = data.messages.map((m) => {
      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

      if (m.content.trim()) {
        parts.push({
          text: m.content,
        });
      }

      // Issue 2 Note: Handling inline data for images/small docs. 
      // Large production PDFs should transition to the Files API (ai.files.upload) if payload limits are hit.
      if (m.attachments) {
        for (const a of m.attachments) {
          const base64 = a.dataUrl.split(",")[1];

          parts.push({
            inlineData: {
              mimeType: a.mime,
              data: base64,
            },
          });
        }
      }

      return {
        role: m.role === "assistant" ? "model" : "user",
        parts,
      };
    });

    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: {
          systemInstruction: system,
        },
      });

      const reply = result.text ?? "I'm here for you. Could you say that again?";
      
      return { reply };
    } catch (err) {
      console.error(err);
      // Issue 5: Better error formatting
      return {
        error: "request_failed",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });