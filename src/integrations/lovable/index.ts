import { createLovableAuth } from "@lovable.dev/cloud-auth-js";
import { supabase } from "../supabase/client";
const lovableAuth = createLovableAuth();
type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};
export const lovable = {
  auth: {
    signInWithOAuth: async (
      provider: "google" | "apple" | "microsoft" | "lovable",
      opts?: SignInOptions,
    ) => {
      const isLovableSandbox =
        typeof window !== "undefined" &&
        (window.location.hostname.endsWith(".lovable.app") ||
          window.location.hostname.endsWith(".lovable.project") ||
          window.location.hostname.endsWith(".gptengineer.run"));
      if (!isLovableSandbox) {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: (provider === "lovable" ? "google" : provider) as any,
          options: {
            redirectTo: opts?.redirect_uri,
          },
        });
        if (error) {
          return { error };
        }
        return { redirected: true, error: null };
      }
      const result = await lovableAuth.signInWithOAuth(provider, {
        redirect_uri: opts?.redirect_uri,
        extraParams: {
          ...opts?.extraParams,
        },
      });
      if (result.redirected) {
        return result;
      }
      if (result.error) {
        return result;
      }
      try {
        await supabase.auth.setSession(result.tokens);
      } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
      }
      return result;
    },
  },
};
