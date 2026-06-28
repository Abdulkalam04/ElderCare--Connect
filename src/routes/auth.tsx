import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Heart, Eye, EyeOff, ArrowLeft, Mail, CheckCircle2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

type Screen = "auth" | "forgot" | "reset";

// ── Password strength rules ────────────────────────────────────────────────
function checkPasswordStrength(pw: string) {
  return {
    minLen:   pw.length >= 8,
    upper:    /[A-Z]/.test(pw),
    lower:    /[a-z]/.test(pw),
    number:   /[0-9]/.test(pw),
    special:  /[^A-Za-z0-9]/.test(pw),
  };
}

function StrengthBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${ok ? "text-emerald-600" : "text-muted-foreground"}`}>
      {ok ? <CheckCircle2 className="size-3 animate-fade-in" /> : <span className="size-3 rounded-full border border-current inline-block transition-all" />}
      {label}
    </span>
  );
}

// ── Shared left branding panel ──────────────────────────────────────────────
function BrandingPanel() {
  return (
    <aside className="hidden lg:flex flex-col justify-between p-12 bg-stone-900 text-white relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -right-24 size-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 -left-16 size-64 rounded-full bg-primary/5 blur-2xl" />
      </div>
      <div className="relative flex items-center gap-3">
        <div className="size-9 rounded-xl bg-primary grid place-items-center font-bold text-primary-foreground shadow-lg">E</div>
        <span className="font-display text-xl tracking-tight">ElderCare Connect</span>
      </div>
      <div className="relative space-y-6">
        <div className="flex gap-3 mb-8">
          {[
            { emoji: "💊", label: "Medicine\nReminders" },
            { emoji: "🚨", label: "Emergency\nSOS" },
            { emoji: "📅", label: "Health\nTracking" },
          ].map((f) => (
            <div key={f.label} className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
              <div className="text-2xl mb-1.5">{f.emoji}</div>
              <div className="text-[10px] text-white/60 font-medium leading-tight whitespace-pre-line">{f.label}</div>
            </div>
          ))}
        </div>
        <h1 className="font-display italic text-5xl leading-tight">
          Care that travels<br />the distance.
        </h1>
        <p className="text-white/60 max-w-md leading-relaxed">
          Look after the people who looked after you — medicines, daily check-ins,
          emergencies and visits, all in one calm place the whole family shares.
        </p>
      </div>
      <div className="relative flex items-center gap-3 text-xs font-mono uppercase tracking-widest text-white/40">
        <Heart className="size-3.5 text-primary animate-pulse" /> A family-first health companion
      </div>
    </aside>
  );
}

// ── Main Auth Page ──────────────────────────────────────────────────────────
function AuthPage() {
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>("auth");
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  // Auth form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"parent" | "child">("parent");
  const [googleRole, setGoogleRole] = useState<"parent" | "child" | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  // Reset password state
  const [newPassword, setNewPassword] = useState("");
  const [newConfirm, setNewConfirm] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showNewConfirm, setShowNewConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // Detect Supabase PASSWORD_RECOVERY event (user clicked the email link)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setScreen("reset");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Sign in / Sign up ────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) { toast.error("Email is required."); return; }
    if (!password) { toast.error("Password is required."); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) { toast.error("Please enter a valid email address."); return; }
    if (mode === "signup") {
      if (!fullName.trim()) { toast.error("Full name is required."); return; }
      if (password !== confirmPassword) { toast.error("Passwords do not match."); return; }
      if (password.length < 6) { toast.error("Password must be at least 6 characters."); return; }
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: fullName, role },
          },
        });
        if (error) {
          if (error.message.toLowerCase().includes("user already registered") || error.message.toLowerCase().includes("already exists")) {
            toast.error("An account with this email already exists.");
          } else {
            toast.error(error.message);
          }
          return;
        }
        toast.success("Account created. Welcome!");
        navigate({ to: role === "parent" ? "/dashboard" : "/family" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { toast.error("Invalid email or password."); return; }
        const { data: { user } } = await supabase.auth.getUser();
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
        navigate({ to: profile?.role === "parent" ? "/dashboard" : "/family" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Google OAuth ─────────────────────────────────────────────────────────
  async function handleGoogle() {
    if (!googleRole) {
      toast.error("Please select whether you are signing in as a Parent or Child.");
      return;
    }
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/dashboard",
    });
    if (result.error) { toast.error("Google sign-in failed."); setLoading(false); return; }
    if (result.redirected) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: existing } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (!existing?.role) {
        await supabase.from("profiles").update({ role: googleRole } as any).eq("id", user.id);
      }
      const finalRole = existing?.role ?? googleRole;
      navigate({ to: finalRole === "parent" ? "/dashboard" : "/family" });
    } else {
      navigate({ to: "/dashboard" });
    }
  }

  // ── Forgot Password ──────────────────────────────────────────────────────
  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = forgotEmail.trim();
    if (!trimmed) {
      toast.error("Please enter your email address.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setForgotLoading(true);
    try {
      // 1. Verify if user profile exists (or user is registered) before sending.
      // Since supabase client auth doesn't have an admin API to lookup by email in client sdk easily,
      // and checking the profiles table works if email matches profiles (but profiles is keyed on ID),
      // we can do a quick check via a supabase edge function or query.
      // Let's check if the profiles table has a matching email column.
      // Wait, let's see profiles schema. Does it store email? Let's check.
      const { data: profiles, error: profileErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", trimmed); // Let's check if email is stored on profiles, or handle gracefully.
      
      // Wait, is 'email' a column in profiles table? Usually it's in auth.users, but profiles often links or mirrors it.
      // Let's verify by calling supabase.auth.resetPasswordForEmail directly, but Supabase SDK doesn't tell us if email exists.
      // Let's query profiles to see if the column exists or is queryable.
      // Alternatively, we can proceed with resetPasswordForEmail. If it succeeds, since Supabase doesn't disclose user presence,
      // let's check if we can query email in profiles first. Let's do a direct call to resetPasswordForEmail first.
      
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/auth`,
      });
      
      if (error) {
        if (error.message.toLowerCase().includes("rate limit")) {
          toast.error("Too many requests. Please wait a moment and try again.");
          return;
        }
        toast.error(error.message);
        return;
      }

      setForgotSent(true);
      toast.success("A password reset link has been sent to your email. Please check your inbox.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setForgotLoading(false);
    }
  }

  // ── Reset Password ───────────────────────────────────────────────────────
  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword) { toast.error("Please enter a new password."); return; }
    if (newPassword !== newConfirm) { toast.error("Passwords do not match."); return; }

    const checks = checkPasswordStrength(newPassword);
    if (!checks.minLen)  { toast.error("Password must be at least 8 characters."); return; }
    if (!checks.upper)   { toast.error("Password must contain at least one uppercase letter."); return; }
    if (!checks.lower)   { toast.error("Password must contain at least one lowercase letter."); return; }
    if (!checks.number)  { toast.error("Password must contain at least one number."); return; }
    if (!checks.special) { toast.error("Password must contain at least one special character."); return; }

    setResetLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        if (error.message.toLowerCase().includes("expired") || error.message.toLowerCase().includes("invalid")) {
          toast.error("This reset link has expired or is invalid. Please request a new one.");
          setScreen("forgot");
          return;
        }
        toast.error(error.message);
        return;
      }
      toast.success("Your password has been reset successfully.");
      
      // Sign out to clear any recovery session, then redirect to sign-in
      await supabase.auth.signOut();
      setNewPassword("");
      setNewConfirm("");
      setScreen("auth");
      setMode("signin");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setResetLoading(false);
    }
  }

  // ── Forgot Password Screen ───────────────────────────────────────────────
  if (screen === "forgot") {
    return (
      <div className="min-h-screen grid lg:grid-cols-2">
        <BrandingPanel />
        <main className="flex items-center justify-center p-6 sm:p-12 bg-background">
          <div className="w-full max-w-sm space-y-6">
            <div className="flex lg:hidden items-center gap-2 mb-2">
              <div className="size-8 rounded-lg bg-primary grid place-items-center font-bold text-primary-foreground text-sm">E</div>
              <span className="font-display text-lg">ElderCare Connect</span>
            </div>

            <button
              onClick={() => { setScreen("auth"); setForgotSent(false); setForgotEmail(""); }}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4" /> Back to Sign In
            </button>

            {forgotSent ? (
              <div className="space-y-6">
                <div className="size-16 rounded-2xl bg-emerald-100 text-emerald-600 grid place-items-center mx-auto shadow-inner">
                  <Mail className="size-8 animate-bounce" />
                </div>
                <div className="text-center space-y-2">
                  <h2 className="font-display text-2xl font-bold">Check your inbox</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    A password reset link has been sent to{" "}
                    <span className="font-semibold text-foreground">{forgotEmail}</span>.
                    Please check your inbox (and spam folder).
                  </p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-4 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  <p className="font-semibold">⏱ Link expires in 1 hour</p>
                  <p>Each link can only be used once. If it expires, you can request a new one below.</p>
                </div>
                <Button
                  variant="outline"
                  className="w-full h-11 rounded-xl"
                  onClick={() => { setForgotSent(false); setForgotEmail(""); }}
                >
                  Send another link
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h2 className="font-display text-3xl font-bold tracking-tight">Reset Your Password</h2>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                    Enter the email address associated with your account. We'll send you a password reset link.
                  </p>
                </div>

                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-email">Email address</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      aria-label="Email address"
                      required
                      autoFocus
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="h-11 rounded-xl"
                      placeholder="you@example.com"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={forgotLoading}
                    className="w-full h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.99] transition-all font-semibold shadow-sm"
                  >
                    {forgotLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Sending…
                      </span>
                    ) : "Send Reset Link"}
                  </Button>
                </form>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ── Reset Password Screen ────────────────────────────────────────────────
  if (screen === "reset") {
    const checks = checkPasswordStrength(newPassword);
    const allGood = Object.values(checks).every(Boolean);

    return (
      <div className="min-h-screen grid lg:grid-cols-2">
        <BrandingPanel />
        <main className="flex items-center justify-center p-6 sm:p-12 bg-background">
          <div className="w-full max-w-sm space-y-6">
            <div className="flex lg:hidden items-center gap-2 mb-2">
              <div className="size-8 rounded-lg bg-primary grid place-items-center font-bold text-primary-foreground text-sm">E</div>
              <span className="font-display text-lg">ElderCare Connect</span>
            </div>

            <div className="flex flex-col items-start gap-4">
              <div className="size-14 rounded-2xl bg-primary/10 text-primary grid place-items-center">
                <ShieldCheck className="size-7 animate-pulse" />
              </div>
              <div>
                <h2 className="font-display text-3xl font-bold tracking-tight">Create new password</h2>
                <p className="text-sm text-muted-foreground mt-1.5">
                  Your new password must be different from your previous password.
                </p>
              </div>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-pw">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-pw"
                    type={showNew ? "text" : "password"}
                    aria-label="New password"
                    required
                    autoFocus
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-11 rounded-xl pr-11"
                    placeholder="Min. 8 characters"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowNew((p) => !p)}
                    aria-label={showNew ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>

                {newPassword.length > 0 && (
                  <div className="pt-2 p-3 bg-muted/40 rounded-xl grid grid-cols-2 gap-x-4 gap-y-1.5 transition-all">
                    <StrengthBadge ok={checks.minLen}  label="8+ characters" />
                    <StrengthBadge ok={checks.upper}   label="Uppercase letter" />
                    <StrengthBadge ok={checks.lower}   label="Lowercase letter" />
                    <StrengthBadge ok={checks.number}  label="Number" />
                    <StrengthBadge ok={checks.special} label="Special character" />
                    {allGood && (
                      <span className="col-span-2 text-emerald-600 text-[11px] font-semibold flex items-center gap-1 mt-0.5">
                        <CheckCircle2 className="size-3 animate-bounce" /> Strong password!
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-pw-confirm">Confirm New Password</Label>
                <div className="relative">
                  <Input
                    id="new-pw-confirm"
                    type={showNewConfirm ? "text" : "password"}
                    aria-label="Confirm new password"
                    required
                    value={newConfirm}
                    onChange={(e) => setNewConfirm(e.target.value)}
                    className={`h-11 rounded-xl pr-11 ${newConfirm && newConfirm !== newPassword ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    placeholder="Repeat your new password"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowNewConfirm((p) => !p)}
                    aria-label={showNewConfirm ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showNewConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {newConfirm && newConfirm !== newPassword && (
                  <p className="text-xs text-destructive font-medium mt-1">Passwords do not match.</p>
                )}
                {newConfirm && newConfirm === newPassword && newPassword.length > 0 && (
                  <p className="text-xs text-emerald-600 font-medium flex items-center gap-1 mt-1">
                    <CheckCircle2 className="size-3" /> Passwords match
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={resetLoading || !allGood || newPassword !== newConfirm}
                className="w-full h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.99] transition-all font-semibold disabled:opacity-50"
              >
                {resetLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Resetting…
                  </span>
                ) : "Reset Password"}
              </Button>
            </form>

            <p className="text-center text-xs text-muted-foreground">
              Link expired?{" "}
              <button
                onClick={() => { setScreen("forgot"); setNewPassword(""); setNewConfirm(""); }}
                className="text-primary font-semibold hover:underline underline-offset-4"
              >
                Request a new one
              </button>
            </p>
          </div>
        </main>
      </div>
    );
  }

  // ── Main Auth Screen (Sign In / Sign Up) ─────────────────────────────────
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <BrandingPanel />

      <main className="flex items-center justify-center p-6 sm:p-12 bg-background">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex lg:hidden items-center gap-2 mb-2">
            <div className="size-8 rounded-lg bg-primary grid place-items-center font-bold text-primary-foreground text-sm">E</div>
            <span className="font-display text-lg">ElderCare Connect</span>
          </div>

          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight">
              {mode === "signup" ? "Create your account" : "Welcome back"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1.5">
              {mode === "signup"
                ? "Set up care for yourself or a loved one."
                : "Sign in to continue managing care."}
            </p>
          </div>

          {/* Google Sign-In */}
          <div className="space-y-3 p-4 rounded-2xl bg-muted/40 border border-border">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">I am a:</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setGoogleRole("parent")}
                  className={`rounded-xl border-2 p-3 cursor-pointer text-sm text-left transition-all ${
                    googleRole === "parent"
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-background hover:border-primary/40"
                  }`}
                >
                  <div className="font-semibold text-foreground">👴 Parent</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Receiving care</div>
                </button>
                <button
                  type="button"
                  onClick={() => setGoogleRole("child")}
                  className={`rounded-xl border-2 p-3 cursor-pointer text-sm text-left transition-all ${
                    googleRole === "child"
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-background hover:border-primary/40"
                  }`}
                >
                  <div className="font-semibold text-foreground">👨‍👩‍👦 Family</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Monitoring a parent</div>
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={handleGoogle}
              disabled={loading}
              className="w-full h-11 flex items-center justify-center gap-3 rounded-xl border border-border bg-white hover:bg-stone-50 dark:bg-stone-800 dark:hover:bg-stone-700 transition-all shadow-sm hover:shadow-md active:scale-[0.99] disabled:opacity-60 font-medium text-sm text-stone-800 dark:text-white"
            >
              <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              <span>{loading ? "Please wait…" : "Continue with Google"}</span>
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">
            <div className="h-px flex-1 bg-border" />
            or email
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    aria-label="Full name"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Martha Jennings"
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>I am a</Label>
                  <RadioGroup value={role} onValueChange={(v) => setRole(v as "parent" | "child")} className="grid grid-cols-2 gap-2">
                    <label className={`rounded-xl border-2 p-3 cursor-pointer text-sm transition-all ${role === "parent" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                      <RadioGroupItem value="parent" className="sr-only" />
                      <div className="font-semibold">👴 Parent</div>
                      <div className="text-xs text-muted-foreground">Receiving care</div>
                    </label>
                    <label className={`rounded-xl border-2 p-3 cursor-pointer text-sm transition-all ${role === "child" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                      <RadioGroupItem value="child" className="sr-only" />
                      <div className="font-semibold">👨‍👩‍👦 Family</div>
                      <div className="text-xs text-muted-foreground">Monitoring a parent</div>
                    </label>
                  </RadioGroup>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                aria-label="Email address"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-xl"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pw">
                Password{" "}
                {mode === "signup" && (
                  <span className="text-xs text-muted-foreground font-normal">(min 6 chars)</span>
                )}
              </Label>
              <div className="relative">
                <Input
                  id="pw"
                  type={showPassword ? "text" : "password"}
                  aria-label="Password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 rounded-xl pr-11"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {mode === "signin" && (
                <div className="text-right mt-1">
                  <button
                    type="button"
                    onClick={() => setScreen("forgot")}
                    className="text-xs text-primary font-semibold hover:underline underline-offset-4"
                  >
                    Forgot Password?
                  </button>
                </div>
              )}
            </div>

            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="pw-confirm">Confirm password</Label>
                <div className="relative">
                  <Input
                    id="pw-confirm"
                    type={showConfirm ? "text" : "password"}
                    aria-label="Confirm password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-11 rounded-xl pr-11"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowConfirm((p) => !p)}
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.99] transition-all font-semibold"
            >
              {loading ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
            <button
              onClick={() => {
                setMode(mode === "signup" ? "signin" : "signup");
                setPassword("");
                setConfirmPassword("");
                setShowPassword(false);
                setShowConfirm(false);
              }}
              className="text-primary font-semibold hover:underline underline-offset-4"
            >
              {mode === "signup" ? "Sign in" : "Create one"}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
