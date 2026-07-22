import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BrandIcon, BrandLogo } from "@/components/BrandLogo";
import { toast } from "sonner";
import {
  Heart,
  Eye,
  EyeOff,
  ArrowLeft,
  Mail,
  CheckCircle2,
  ShieldCheck,
  Pill,
  Activity,
  Users,
  Sparkles,
} from "lucide-react";
export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});
type Screen = "auth" | "forgot" | "reset";
function checkPasswordStrength(pw: string) {
  return {
    minLen: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
}
function StrengthBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium transition-colors ${ok ? "text-emerald-600" : "text-muted-foreground"}`}
    >
      {ok ? (
        <CheckCircle2 className="size-3 animate-fade-in" />
      ) : (
        <span className="size-3 rounded-full border border-current inline-block" />
      )}
      {label}
    </span>
  );
}
function AuthBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220_50%_98%)] via-background to-[hsl(217_91%_96%)]" />
      <div className="absolute -top-32 -left-24 size-[28rem] rounded-full bg-[color:var(--brand-accent)]/10 blur-3xl animate-auth-blob" />
      <div className="absolute top-1/3 -right-24 size-[24rem] rounded-full bg-primary/10 blur-3xl animate-auth-blob [animation-delay:-6s]" />
      <div className="absolute -bottom-32 left-1/3 size-[22rem] rounded-full bg-emerald-400/10 blur-3xl animate-auth-blob [animation-delay:-3s]" />
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(222 47% 18%) 1px, transparent 1px), linear-gradient(90deg, hsl(222 47% 18%) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
    </div>
  );
}
function BrandingPanel() {
  const features = [
    { Icon: Pill, label: "Medicine\nReminders" },
    { Icon: ShieldCheck, label: "Emergency\nSOS" },
    { Icon: Activity, label: "Health\nTracking" },
  ];
  return (
    <aside className="hidden lg:flex flex-col justify-between p-12 xl:p-14 bg-gradient-to-br from-[hsl(222_47%_14%)] via-[hsl(222_47%_18%)] to-[hsl(217_91%_22%)] text-white relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -right-24 size-96 rounded-full bg-[color:var(--brand-accent)]/20 blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-0 -left-16 size-72 rounded-full bg-white/5 blur-2xl" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />
      </div>

      <BrandLogo tone="light" />

      <div className="relative space-y-7 animate-rise-in">
        <div className="grid grid-cols-3 gap-3">
          {features.map(({ Icon, label }) => (
            <div
              key={label}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-4 text-center transition-all hover:bg-white/[0.08] hover:-translate-y-0.5"
            >
              <div className="mx-auto mb-2 grid size-9 place-items-center rounded-xl bg-white/10">
                <Icon className="size-4.5 text-white/90" />
              </div>
              <div className="text-[11px] text-white/70 font-medium leading-tight whitespace-pre-line">
                {label}
              </div>
            </div>
          ))}
        </div>

        <div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-white/60 mb-4">
            <Sparkles className="size-3 text-[color:var(--brand-accent)]" /> For families, with care
          </span>
          <h1 className="font-display italic text-[2.75rem] xl:text-5xl leading-[1.05]">
            Care that travels
            <br />
            the distance.
          </h1>
          <p className="text-white/65 max-w-md leading-relaxed mt-4">
            Look after the people who looked after you — medicines, daily check-ins, emergencies and
            visits, all in one calm place the whole family shares.
          </p>
        </div>
      </div>

      <div className="relative flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-white/50">
        <Heart className="size-3.5 text-[color:var(--brand-accent)] animate-pulse" />A family-first
        health companion
      </div>
    </aside>
  );
}
function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md animate-rise-in">
      <div className="lg:hidden mb-6 flex justify-center">
        <BrandLogo size="md" />
      </div>
      <div className="relative rounded-3xl bg-card/90 backdrop-blur-xl border border-border/70 shadow-[0_20px_50px_-20px_hsl(222_47%_18%/0.25),0_8px_18px_-12px_hsl(222_47%_18%/0.15)] p-7 sm:p-9">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent rounded-t-3xl" />
        {children}
      </div>
    </div>
  );
}
const inputCls =
  "h-11 rounded-xl border-border/70 bg-background/70 transition-all duration-200 " +
  "placeholder:text-muted-foreground/60 " +
  "focus-visible:border-[color:var(--brand-accent)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]/25 " +
  "hover:border-border";
const primaryBtnCls =
  "w-full h-11 rounded-xl font-semibold shadow-sm " +
  "bg-gradient-to-b from-[hsl(222_47%_22%)] to-[hsl(222_47%_16%)] text-primary-foreground " +
  "hover:shadow-md hover:from-[hsl(222_47%_24%)] hover:to-[hsl(222_47%_18%)] " +
  "active:scale-[0.99] transition-all duration-200 " +
  "disabled:opacity-60 disabled:cursor-not-allowed";
function Spinner() {
  return (
    <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
  );
}
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] relative bg-background">
      <BrandingPanel />
      <main className="relative flex items-center justify-center p-5 sm:p-10 lg:p-12">
        <AuthBackdrop />
        <div className="relative w-full flex justify-center">{children}</div>
      </main>
    </div>
  );
}
function AuthPage() {
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>("auth");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"parent" | "child">("parent");
  const [googleRole, setGoogleRole] = useState<"parent" | "child" | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newConfirm, setNewConfirm] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showNewConfirm, setShowNewConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setScreen("reset");
    });
    return () => subscription.unsubscribe();
  }, []);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      toast.error("Email is required.");
      return;
    }
    if (!password) {
      toast.error("Password is required.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (mode === "signup") {
      if (!fullName.trim()) {
        toast.error("Full name is required.");
        return;
      }
      if (password !== confirmPassword) {
        toast.error("Passwords do not match.");
        return;
      }
      if (password.length < 6) {
        toast.error("Password must be at least 6 characters.");
        return;
      }
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: fullName, role },
          },
        });
        if (error) {
          if (
            error.message.toLowerCase().includes("user already registered") ||
            error.message.toLowerCase().includes("already exists")
          ) {
            toast.error("An account with this email already exists.");
          } else {
            toast.error(error.message);
          }
          return;
        }
        setPassword("");
        setConfirmPassword("");
        if (data?.session) {
          await supabase.auth.signOut();
          toast.success("Account created successfully! Please sign in with your credentials.", {
            duration: 6000,
          });
        } else {
          toast.success(
            "Registration successful! Please check your email to confirm your account, then sign in.",
            {
              duration: 8000,
            },
          );
        }
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          toast.error(error.message);
          return;
        }
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }
  async function handleGoogle() {
    if (!googleRole) {
      toast.error("Please select whether you are signing in as a Parent or Child.");
      return;
    }
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/dashboard",
    });
    if (result.error) {
      toast.error("Google sign-in failed.");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: existing } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (!existing?.role) {
        await supabase
          .from("profiles")
          .update({ role: googleRole } as any)
          .eq("id", user.id);
      }
      const finalRole = existing?.role ?? googleRole;
      navigate({ to: finalRole === "parent" ? "/dashboard" : "/family" });
    } else {
      navigate({ to: "/dashboard" });
    }
  }
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
  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword) {
      toast.error("Please enter a new password.");
      return;
    }
    if (newPassword !== newConfirm) {
      toast.error("Passwords do not match.");
      return;
    }
    const checks = checkPasswordStrength(newPassword);
    if (!checks.minLen) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (!checks.upper) {
      toast.error("Password must contain at least one uppercase letter.");
      return;
    }
    if (!checks.lower) {
      toast.error("Password must contain at least one lowercase letter.");
      return;
    }
    if (!checks.number) {
      toast.error("Password must contain at least one number.");
      return;
    }
    if (!checks.special) {
      toast.error("Password must contain at least one special character.");
      return;
    }
    setResetLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        if (
          error.message.toLowerCase().includes("expired") ||
          error.message.toLowerCase().includes("invalid")
        ) {
          toast.error("This reset link has expired or is invalid. Please request a new one.");
          setScreen("forgot");
          return;
        }
        toast.error(error.message);
        return;
      }
      toast.success("Your password has been reset successfully.");
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
  if (screen === "forgot") {
    return (
      <PageShell>
        <AuthCard>
          <button
            onClick={() => {
              setScreen("auth");
              setForgotSent(false);
              setForgotEmail("");
            }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5 -mt-1"
          >
            <ArrowLeft className="size-4" /> Back to Sign In
          </button>

          {forgotSent ? (
            <div className="space-y-6 text-center">
              <div className="size-16 rounded-2xl bg-emerald-100 text-emerald-600 grid place-items-center mx-auto shadow-inner animate-rise-in">
                <Mail className="size-8" />
              </div>
              <div className="space-y-2">
                <h2 className="font-display text-2xl font-bold">Check your inbox</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  A password reset link has been sent to{" "}
                  <span className="font-semibold text-foreground">{forgotEmail}</span>. Please check
                  your inbox (and spam folder).
                </p>
              </div>
              <div className="bg-amber-50 border border-amber-200/70 rounded-2xl p-4 text-xs text-amber-800 space-y-1 text-left">
                <p className="font-semibold">⏱ Link expires in 1 hour</p>
                <p>
                  Each link can only be used once. If it expires, you can request a new one below.
                </p>
              </div>
              <Button
                variant="outline"
                className="w-full h-11 rounded-xl border-border/70 hover:border-[color:var(--brand-accent)]/60 hover:bg-accent/60 transition-all"
                onClick={() => {
                  setForgotSent(false);
                  setForgotEmail("");
                }}
              >
                Send another link
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-3xl font-bold tracking-tight">
                  Reset your password
                </h2>
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                  Enter the email associated with your account and we'll send you a password reset
                  link.
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
                    className={inputCls}
                    placeholder="you@example.com"
                  />
                </div>
                <Button type="submit" disabled={forgotLoading} className={primaryBtnCls}>
                  {forgotLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner /> Sending…
                    </span>
                  ) : (
                    "Send reset link"
                  )}
                </Button>
              </form>
            </div>
          )}
        </AuthCard>
      </PageShell>
    );
  }
  if (screen === "reset") {
    const checks = checkPasswordStrength(newPassword);
    const allGood = Object.values(checks).every(Boolean);
    return (
      <PageShell>
        <AuthCard>
          <div className="flex flex-col items-start gap-4 mb-6">
            <div className="size-14 rounded-2xl bg-primary/10 text-primary grid place-items-center ring-1 ring-primary/15">
              <ShieldCheck className="size-7" />
            </div>
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight">
                Create new password
              </h2>
              <p className="text-sm text-muted-foreground mt-1.5">
                Your new password must be different from your previous password.
              </p>
            </div>
          </div>

          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-pw">New password</Label>
              <div className="relative">
                <Input
                  id="new-pw"
                  type={showNew ? "text" : "password"}
                  aria-label="New password"
                  required
                  autoFocus
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`${inputCls} pr-11`}
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
                <div className="pt-2 p-3 bg-muted/50 rounded-xl grid grid-cols-2 gap-x-4 gap-y-1.5 animate-fade-in">
                  <StrengthBadge ok={checks.minLen} label="8+ characters" />
                  <StrengthBadge ok={checks.upper} label="Uppercase letter" />
                  <StrengthBadge ok={checks.lower} label="Lowercase letter" />
                  <StrengthBadge ok={checks.number} label="Number" />
                  <StrengthBadge ok={checks.special} label="Special character" />
                  {allGood && (
                    <span className="col-span-2 text-emerald-600 text-[11px] font-semibold flex items-center gap-1 mt-0.5">
                      <CheckCircle2 className="size-3" /> Strong password!
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-pw-confirm">Confirm new password</Label>
              <div className="relative">
                <Input
                  id="new-pw-confirm"
                  type={showNewConfirm ? "text" : "password"}
                  aria-label="Confirm new password"
                  required
                  value={newConfirm}
                  onChange={(e) => setNewConfirm(e.target.value)}
                  className={`${inputCls} pr-11 ${newConfirm && newConfirm !== newPassword ? "border-destructive focus-visible:ring-destructive/30 focus-visible:border-destructive" : ""}`}
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
              className={primaryBtnCls}
            >
              {resetLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner /> Resetting…
                </span>
              ) : (
                "Reset password"
              )}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Link expired?{" "}
            <button
              onClick={() => {
                setScreen("forgot");
                setNewPassword("");
                setNewConfirm("");
              }}
              className="text-[color:var(--brand-accent)] font-semibold hover:underline underline-offset-4"
            >
              Request a new one
            </button>
          </p>
        </AuthCard>
      </PageShell>
    );
  }
  return (
    <PageShell>
      <AuthCard>
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-5">
            <BrandIcon className="size-10 rounded-xl shadow-sm" />
            <div>
              <h2 className="font-display text-2xl sm:text-[1.7rem] font-bold tracking-tight leading-tight">
                {mode === "signup" ? "Create your account" : "Welcome back"}
              </h2>
              <p className="text-sm text-muted-foreground leading-snug">
                {mode === "signup"
                  ? "Set up care for yourself or a loved one."
                  : "Sign in to continue managing care."}
              </p>
            </div>
          </div>

          <div className="relative grid grid-cols-2 p-1 rounded-xl bg-muted/70 border border-border/60">
            <span
              className={`absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-lg bg-card shadow-sm transition-all duration-300 ease-out
                ${mode === "signin" ? "left-1" : "left-[calc(50%+0.125rem)]"}`}
              aria-hidden="true"
            />
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  if (mode === m) return;
                  setMode(m);
                  setPassword("");
                  setConfirmPassword("");
                  setShowPassword(false);
                  setShowConfirm(false);
                }}
                className={`relative z-10 h-9 text-sm font-semibold transition-colors ${mode === m ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {m === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 p-4 rounded-2xl bg-muted/40 border border-border/60">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              I am signing in as
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <RoleTile
                active={googleRole === "parent"}
                onClick={() => setGoogleRole("parent")}
                icon={<Heart className="size-4" />}
                title="Parent"
                hint="Receiving care"
              />
              <RoleTile
                active={googleRole === "child"}
                onClick={() => setGoogleRole("child")}
                icon={<Users className="size-4" />}
                title="Family"
                hint="Monitoring a parent"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="group w-full h-11 flex items-center justify-center gap-3 rounded-xl border border-border/70 bg-card hover:bg-accent/50 hover:border-border transition-all shadow-sm hover:shadow-md active:scale-[0.99] disabled:opacity-60 font-medium text-sm text-foreground"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5 shrink-0 transition-transform group-hover:scale-110"
              aria-hidden="true"
            >
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            <span>{loading ? "Please wait…" : "Continue with Google"}</span>
          </button>
        </div>

        <div className="flex items-center gap-3 my-5 text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
          <div className="h-px flex-1 bg-border" />
          or with email
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <>
              <div className="space-y-1.5 animate-fade-in">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  aria-label="Full name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Martha Jennings"
                  className={inputCls}
                />
              </div>
              <div className="space-y-2 animate-fade-in">
                <Label>I am a</Label>
                <RadioGroup
                  value={role}
                  onValueChange={(v) => setRole(v as "parent" | "child")}
                  className="grid grid-cols-2 gap-2"
                >
                  <label
                    className={`rounded-xl border-2 p-3 cursor-pointer text-sm transition-all ${role === "parent" ? "border-[color:var(--brand-accent)] bg-[color:var(--brand-accent)]/5 shadow-sm" : "border-border hover:border-[color:var(--brand-accent)]/40"}`}
                  >
                    <RadioGroupItem value="parent" className="sr-only" />
                    <div className="font-semibold flex items-center gap-1.5">
                      <Heart className="size-3.5" /> Parent
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">Receiving care</div>
                  </label>
                  <label
                    className={`rounded-xl border-2 p-3 cursor-pointer text-sm transition-all ${role === "child" ? "border-[color:var(--brand-accent)] bg-[color:var(--brand-accent)]/5 shadow-sm" : "border-border hover:border-[color:var(--brand-accent)]/40"}`}
                  >
                    <RadioGroupItem value="child" className="sr-only" />
                    <div className="font-semibold flex items-center gap-1.5">
                      <Users className="size-3.5" /> Family
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">Monitoring a parent</div>
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
              className={inputCls}
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="pw">
                Password{" "}
                {mode === "signup" && (
                  <span className="text-xs text-muted-foreground font-normal">(min 6 chars)</span>
                )}
              </Label>
              {mode === "signin" && (
                <button
                  type="button"
                  onClick={() => setScreen("forgot")}
                  className="text-xs text-[color:var(--brand-accent)] font-semibold hover:underline underline-offset-4"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <Input
                id="pw"
                type={showPassword ? "text" : "password"}
                aria-label="Password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputCls} pr-11`}
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
          </div>

          {mode === "signup" && (
            <div className="space-y-1.5 animate-fade-in">
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
                  className={`${inputCls} pr-11`}
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

          <Button type="submit" disabled={loading} className={primaryBtnCls}>
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner /> Please wait…
              </span>
            ) : mode === "signup" ? (
              "Create account"
            ) : (
              "Sign in"
            )}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {mode === "signup" ? "Already have an account?" : "New to ElderCare Connect?"}{" "}
          <button
            onClick={() => {
              setMode(mode === "signup" ? "signin" : "signup");
              setPassword("");
              setConfirmPassword("");
              setShowPassword(false);
              setShowConfirm(false);
            }}
            className="text-[color:var(--brand-accent)] font-semibold hover:underline underline-offset-4"
          >
            {mode === "signup" ? "Sign in" : "Create one"}
          </button>
        </p>
      </AuthCard>
    </PageShell>
  );
}
function RoleTile({
  active,
  onClick,
  icon,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-xl border-2 p-3 cursor-pointer text-sm text-left transition-all active:scale-[0.98] ${
        active
          ? "border-[color:var(--brand-accent)] bg-[color:var(--brand-accent)]/5 shadow-sm"
          : "border-border bg-background/60 hover:border-[color:var(--brand-accent)]/50 hover:bg-background"
      }`}
    >
      <div
        className={`inline-flex items-center justify-center size-7 rounded-lg mb-1.5 transition-colors ${active ? "bg-[color:var(--brand-accent)] text-white" : "bg-muted text-muted-foreground group-hover:text-foreground"}`}
      >
        {icon}
      </div>
      <div className="font-semibold text-foreground">{title}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
    </button>
  );
}
