import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BellRing,
  CalendarDays,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  HeartPulse,
  LockKeyhole,
  Mail,
  Pill,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();

    if (data.session) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AuthPage,
});

type Screen = "auth" | "forgot" | "reset";
type AuthMode = "signin" | "signup";
type UserRole = "parent" | "child";

const inputClassName =
  "h-12 rounded-xl border-[#d6e2df] bg-white px-4 text-[#17363b] shadow-none " +
  "placeholder:text-[#91a2a5] hover:border-[#b8cfca] " +
  "focus-visible:border-[#0d706d] focus-visible:ring-2 focus-visible:ring-[#0d706d]/15";

const primaryButtonClassName =
  "h-12 w-full rounded-xl bg-[#0d6665] text-sm font-semibold text-white " +
  "shadow-[0_16px_32px_-18px_rgba(13,102,101,0.8)] " +
  "hover:bg-[#0a5958] active:scale-[0.995] disabled:cursor-not-allowed disabled:opacity-60";

function checkPasswordStrength(password: string) {
  return {
    minLen: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

function Spinner() {
  return (
    <span className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true">
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
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-3"
      aria-label="ElderCare Connect homepage"
    >
      <span
        className={`grid place-items-center rounded-2xl bg-[#0d706d] text-white shadow-[0_14px_30px_-16px_rgba(13,112,109,0.8)] ${compact ? "size-10" : "size-11"
          }`}
      >
        <HeartPulse className={compact ? "size-5" : "size-6"} strokeWidth={2.1} />
      </span>

      <span className="text-lg font-bold tracking-[-0.03em] text-[#15343a]">
        ElderCare <span className="text-[#0d706d]">Connect</span>
      </span>
    </Link>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  iconClassName,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
  iconClassName: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-white/45">
            {label}
          </p>
          <p className="mt-2 text-xl font-bold tracking-[-0.04em] text-white">{value}</p>
        </div>

        <span className={`grid size-9 place-items-center rounded-xl ${iconClassName}`}>
          <Icon className="size-4.5" />
        </span>
      </div>

      <p className="mt-3 text-xs text-white/55">{detail}</p>
    </div>
  );
}

function ProductPreview() {
  const bars = [42, 58, 49, 68, 61, 79, 70, 86, 77, 91, 84, 96];

  return (
    <div className="relative mt-10">
      <div className="absolute -inset-5 rounded-[2rem] bg-[#79b9a8]/10 blur-2xl" />

      <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#082f34]/80 p-3 shadow-[0_32px_80px_-32px_rgba(0,0,0,0.65)] backdrop-blur-xl">
        <div className="rounded-[1.25rem] border border-white/10 bg-[#0d3c42] p-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#8fbab2]">
                Daily care overview
              </p>
              <p className="mt-1 text-base font-bold text-white">Everything is on track</p>
            </div>

            <div className="flex items-center gap-2">
              <span className="relative grid size-9 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-white/70">
                <BellRing className="size-4" />
                <span className="absolute right-2 top-2 size-1.5 rounded-full bg-[#e58a57]" />
              </span>
              <span className="grid size-9 place-items-center rounded-xl bg-[#dbece7] text-xs font-bold text-[#0d5b59]">
                AM
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <MetricCard
              icon={Pill}
              label="Medicines"
              value="4 / 5"
              detail="1 dose due today"
              iconClassName="bg-[#d9eee8] text-[#0d706d]"
            />
            <MetricCard
              icon={Activity}
              label="Vitals"
              value="Normal"
              detail="Updated 2 hours ago"
              iconClassName="bg-[#e4efe4] text-[#4f8659]"
            />
            <MetricCard
              icon={CalendarDays}
              label="Next visit"
              value="10:30"
              detail="Tomorrow morning"
              iconClassName="bg-[#f4e5d8] text-[#bd6f3f]"
            />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">
                    Health trend
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">Vitals remain stable</p>
                </div>

                <span className="rounded-full bg-[#78b9a8]/15 px-2.5 py-1 text-[10px] font-bold text-[#9bd0c2]">
                  Within range
                </span>
              </div>

              <div className="mt-5 flex h-24 items-end gap-1.5 rounded-xl bg-black/10 px-3 pb-3 pt-4">
                {bars.map((height, index) => (
                  <span
                    key={`${height}-${index}`}
                    className="flex-1 rounded-t-full bg-gradient-to-t from-[#4b9187] to-[#9acbbe]"
                    style={{ height: `${height}%`, opacity: 0.64 + index * 0.025 }}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">
                    Care team
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">3 people active</p>
                </div>
                <Users className="size-4.5 text-[#9acbbe]" />
              </div>

              <div className="mt-4 space-y-2.5">
                {[
                  ["PS", "Priya Sharma", "Caregiver"],
                  ["DA", "Dr. Anjali", "Doctor"],
                  ["RM", "Rohan Mehta", "Family"],
                ].map(([initials, name, role]) => (
                  <div
                    key={name}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/10 p-2.5"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 text-[10px] font-bold text-white">
                      {initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-white">{name}</p>
                      <p className="truncate text-[10px] text-white/40">{role}</p>
                    </div>
                    <span className="size-2 rounded-full bg-[#6fc29f]" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthVisualPanel() {
  return (
    <aside className="relative hidden min-h-screen overflow-hidden bg-[#0b353b] lg:flex lg:flex-col">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-32 size-96 rounded-full bg-[#3e8d84]/20 blur-3xl" />
        <div className="absolute -bottom-36 right-0 size-[30rem] rounded-full bg-[#bd7a4d]/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <div className="relative flex min-h-screen flex-col px-10 py-9 xl:px-14 xl:py-11">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-3 text-white">
            <span className="grid size-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
              <HeartPulse className="size-6 text-[#a9d6c9]" strokeWidth={2.1} />
            </span>
            <span className="text-lg font-bold tracking-[-0.03em]">
              ElderCare <span className="text-[#9fd0c2]">Connect</span>
            </span>
          </Link>

          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">
            <ShieldCheck className="size-3.5 text-[#9fd0c2]" />
            Secure care platform
          </span>
        </div>

        <div className="my-auto py-12">
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8ec4b6]">
              Family care, professionally coordinated
            </p>

            <h1 className="mt-5 max-w-lg text-4xl font-bold leading-[1.08] tracking-[-0.045em] text-white xl:text-5xl">
              One clear place to manage the people who matter most.
            </h1>

            <p className="mt-5 max-w-lg text-base leading-7 text-white/60">
              Organise medicines, appointments, vitals, caregivers and emergency support without
              losing important details across calls and messages.
            </p>

            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3">
              {["Private by design", "Simple daily workflows", "Built for families"].map(
                (item) => (
                  <div key={item} className="flex items-center gap-2 text-xs font-medium text-white/65">
                    <span className="grid size-5 place-items-center rounded-full bg-[#82bfad]/15 text-[#a6d5c8]">
                      <Check className="size-3" strokeWidth={2.5} />
                    </span>
                    {item}
                  </div>
                ),
              )}
            </div>
          </div>

          <ProductPreview />
        </div>

        <div className="flex items-center justify-between border-t border-white/10 pt-6 text-xs text-white/35">
          <span>Care coordination for modern families</span>
          <span>Private • Reliable • Accessible</span>
        </div>
      </div>
    </aside>
  );
}

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f4f8f6] lg:grid lg:grid-cols-[1.08fr_0.92fr]">
      <AuthVisualPanel />

      <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-8 sm:px-8 lg:px-10 xl:px-14">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-36 top-10 size-96 rounded-full bg-[#dcece7]/80 blur-3xl" />
          <div className="absolute -bottom-48 left-0 size-[28rem] rounded-full bg-[#f3e7da]/70 blur-3xl" />
        </div>

        <div className="relative w-full max-w-[31rem]">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <BrandMark compact />
            <Link
              to="/"
              className="text-xs font-semibold text-[#60777c] transition hover:text-[#0d6665]"
            >
              Back home
            </Link>
          </div>

          {children}

          <p className="mt-6 text-center text-xs leading-5 text-[#829397]">
            By continuing, you agree to use ElderCare Connect responsibly and protect the privacy
            of everyone in your care circle.
          </p>
        </div>
      </main>
    </div>
  );
}

function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-[1.75rem] border border-[#dce7e3] bg-white/95 p-6 shadow-[0_30px_70px_-38px_rgba(20,53,59,0.45)] backdrop-blur-xl sm:p-8">
      {children}
    </section>
  );
}

function PasswordVisibilityButton({
  visible,
  onClick,
  label,
}: {
  visible: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onClick}
      aria-label={label}
      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#819296] transition hover:bg-[#eef5f3] hover:text-[#31565d]"
    >
      {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );
}

function RoleOption({
  value,
  selected,
  title,
  description,
  icon: Icon,
}: {
  value: UserRole;
  selected: boolean;
  title: string;
  description: string;
  icon: typeof UserRound;
}) {
  return (
    <label
      className={`relative flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-all ${selected
          ? "border-[#0d706d] bg-[#edf6f3] shadow-[0_10px_25px_-22px_rgba(13,112,109,0.9)]"
          : "border-[#d9e4e1] bg-white hover:border-[#adc9c2] hover:bg-[#f9fbfa]"
        }`}
    >
      <RadioGroupItem value={value} className="sr-only" />

      <span
        className={`grid size-10 shrink-0 place-items-center rounded-xl ${selected ? "bg-[#0d706d] text-white" : "bg-[#edf2f1] text-[#65797d]"
          }`}
      >
        <Icon className="size-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-[#1b3a40]">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-[#7b8e92]">{description}</span>
      </span>

      <span
        className={`grid size-5 shrink-0 place-items-center rounded-full border ${selected ? "border-[#0d706d] bg-[#0d706d]" : "border-[#c9d6d3] bg-white"
          }`}
      >
        {selected && <Check className="size-3 text-white" strokeWidth={3} />}
      </span>
    </label>
  );
}

function StrengthBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`flex items-center gap-1.5 text-[11px] font-medium ${ok ? "text-[#18755f]" : "text-[#87989b]"
        }`}
    >
      {ok ? (
        <CheckCircle2 className="size-3.5" />
      ) : (
        <span className="size-3.5 rounded-full border border-current" />
      )}
      {label}
    </span>
  );
}

function AuthPage() {
  const navigate = useNavigate();

  const [screen, setScreen] = useState<Screen>("auth");
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("parent");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [newConfirmPassword, setNewConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showNewConfirmPassword, setShowNewConfirmPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setScreen("reset");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      toast.error("Email is required.");
      return;
    }

    if (!password) {
      toast.error("Password is required.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(trimmedEmail)) {
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
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: {
              full_name: fullName.trim(),
              role,
            },
          },
        });

        if (error) {
          const message = error.message.toLowerCase();

          if (message.includes("user already registered") || message.includes("already exists")) {
            toast.error("An account with this email already exists.");
          } else {
            toast.error(error.message);
          }
          return;
        }

        setPassword("");
        setConfirmPassword("");

        if (data.session) {
          await supabase.auth.signOut();
          toast.success("Account created successfully. Please sign in with your credentials.", {
            duration: 6000,
          });
        } else {
          toast.success(
            "Registration successful. Check your email to confirm your account, then sign in.",
            { duration: 8000 },
          );
        }

        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });

        if (error) {
          toast.error(error.message);
          return;
        }

        navigate({ to: "/dashboard" });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);

    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/dashboard`,
    });

    if (result.error) {
      toast.error("Google sign-in failed.");
      setLoading(false);
      return;
    }

    if (result.redirected) {
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!existingProfile?.role) {
        await supabase
          .from("profiles")
          .update({ role } as any)
          .eq("id", user.id);
      }

      const finalRole = existingProfile?.role ?? role;
      navigate({ to: finalRole === "parent" ? "/dashboard" : "/family" });
      return;
    }

    navigate({ to: "/dashboard" });
  }

  async function handleForgotPassword(event: React.FormEvent) {
    event.preventDefault();

    const trimmedEmail = forgotEmail.trim();

    if (!trimmedEmail) {
      toast.error("Please enter your email address.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(trimmedEmail)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setForgotLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/auth`,
      });

      if (error) {
        if (error.message.toLowerCase().includes("rate limit")) {
          toast.error("Too many requests. Please wait a moment and try again.");
        } else {
          toast.error(error.message);
        }
        return;
      }

      setForgotSent(true);
      toast.success("A password reset link has been sent to your email.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleResetPassword(event: React.FormEvent) {
    event.preventDefault();

    if (!newPassword) {
      toast.error("Please enter a new password.");
      return;
    }

    if (newPassword !== newConfirmPassword) {
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
        const message = error.message.toLowerCase();

        if (message.includes("expired") || message.includes("invalid")) {
          toast.error("This reset link has expired or is invalid. Please request a new one.");
          setScreen("forgot");
        } else {
          toast.error(error.message);
        }
        return;
      }

      toast.success("Your password has been reset successfully.");
      await supabase.auth.signOut();
      setNewPassword("");
      setNewConfirmPassword("");
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
      <AuthLayout>
        <AuthCard>
          <button
            type="button"
            onClick={() => {
              setScreen("auth");
              setForgotSent(false);
              setForgotEmail("");
            }}
            className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-[#667c81] transition hover:text-[#0d6665]"
          >
            <ArrowLeft className="size-4" />
            Back to sign in
          </button>

          {forgotSent ? (
            <div className="text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#e2f1ec] text-[#0d706d]">
                <Mail className="size-6" />
              </span>

              <h1 className="mt-5 text-2xl font-bold tracking-[-0.035em] text-[#14333a]">
                Check your inbox
              </h1>
              <p className="mt-2 text-sm leading-6 text-[#71858a]">
                We sent a password reset link to{" "}
                <span className="font-semibold text-[#31545a]">{forgotEmail}</span>.
              </p>

              <div className="mt-6 rounded-2xl border border-[#e8ddcf] bg-[#fbf6f0] p-4 text-left">
                <p className="text-xs font-bold text-[#8c5c3e]">The link expires in one hour</p>
                <p className="mt-1 text-xs leading-5 text-[#98745c]">
                  Check your spam folder when the email does not appear within a few minutes.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                className="mt-6 h-12 w-full rounded-xl border-[#cadbd7] bg-white font-semibold text-[#264b51] hover:bg-[#f1f7f5]"
                onClick={() => {
                  setForgotSent(false);
                  setForgotEmail("");
                }}
              >
                Send another link
              </Button>
            </div>
          ) : (
            <div>
              <span className="grid size-12 place-items-center rounded-2xl bg-[#e7f2ee] text-[#0d706d]">
                <LockKeyhole className="size-5" />
              </span>

              <h1 className="mt-5 text-3xl font-bold tracking-[-0.04em] text-[#14333a]">
                Reset your password
              </h1>
              <p className="mt-2 text-sm leading-6 text-[#71858a]">
                Enter the email address connected to your account. We will send you a secure reset
                link.
              </p>

              <form onSubmit={handleForgotPassword} className="mt-7 space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email" className="text-sm font-semibold text-[#29494f]">
                    Email address
                  </Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    required
                    autoFocus
                    value={forgotEmail}
                    onChange={(event) => setForgotEmail(event.target.value)}
                    placeholder="you@example.com"
                    className={inputClassName}
                  />
                </div>

                <Button type="submit" disabled={forgotLoading} className={primaryButtonClassName}>
                  {forgotLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner /> Sending link…
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      Send reset link
                      <ArrowRight className="size-4" />
                    </span>
                  )}
                </Button>
              </form>
            </div>
          )}
        </AuthCard>
      </AuthLayout>
    );
  }

  if (screen === "reset") {
    const checks = checkPasswordStrength(newPassword);
    const allChecksPass = Object.values(checks).every(Boolean);

    return (
      <AuthLayout>
        <AuthCard>
          <span className="grid size-12 place-items-center rounded-2xl bg-[#e7f2ee] text-[#0d706d]">
            <ShieldCheck className="size-5" />
          </span>

          <h1 className="mt-5 text-3xl font-bold tracking-[-0.04em] text-[#14333a]">
            Create a new password
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#71858a]">
            Choose a strong password that you have not used for this account before.
          </p>

          <form onSubmit={handleResetPassword} className="mt-7 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-sm font-semibold text-[#29494f]">
                New password
              </Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  required
                  autoFocus
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Minimum 8 characters"
                  className={`${inputClassName} pr-12`}
                />
                <PasswordVisibilityButton
                  visible={showNewPassword}
                  onClick={() => setShowNewPassword((current) => !current)}
                  label={showNewPassword ? "Hide password" : "Show password"}
                />
              </div>

              {newPassword.length > 0 && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-[#f4f8f6] p-3">
                  <StrengthBadge ok={checks.minLen} label="8+ characters" />
                  <StrengthBadge ok={checks.upper} label="Uppercase letter" />
                  <StrengthBadge ok={checks.lower} label="Lowercase letter" />
                  <StrengthBadge ok={checks.number} label="Number" />
                  <StrengthBadge ok={checks.special} label="Special character" />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-new-password" className="text-sm font-semibold text-[#29494f]">
                Confirm new password
              </Label>
              <div className="relative">
                <Input
                  id="confirm-new-password"
                  type={showNewConfirmPassword ? "text" : "password"}
                  required
                  value={newConfirmPassword}
                  onChange={(event) => setNewConfirmPassword(event.target.value)}
                  placeholder="Repeat your new password"
                  className={`${inputClassName} pr-12 ${newConfirmPassword && newConfirmPassword !== newPassword
                      ? "border-[#d9675c] focus-visible:border-[#d9675c] focus-visible:ring-[#d9675c]/15"
                      : ""
                    }`}
                />
                <PasswordVisibilityButton
                  visible={showNewConfirmPassword}
                  onClick={() => setShowNewConfirmPassword((current) => !current)}
                  label={showNewConfirmPassword ? "Hide password" : "Show password"}
                />
              </div>

              {newConfirmPassword && newConfirmPassword !== newPassword && (
                <p className="text-xs font-medium text-[#c44f46]">Passwords do not match.</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={resetLoading || !allChecksPass || newPassword !== newConfirmPassword}
              className={primaryButtonClassName}
            >
              {resetLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner /> Updating password…
                </span>
              ) : (
                "Update password"
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-[#7c8f93]">
            Link expired?{" "}
            <button
              type="button"
              onClick={() => {
                setScreen("forgot");
                setNewPassword("");
                setNewConfirmPassword("");
              }}
              className="font-semibold text-[#0d706d] hover:underline"
            >
              Request another link
            </button>
          </p>
        </AuthCard>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthCard>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0d706d]">
              Secure account access
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-[#14333a]">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#71858a]">
              {mode === "signin"
                ? "Sign in to continue managing your family care workspace."
                : "Create a secure workspace for yourself or someone you care for."}
            </p>
          </div>

          <span className="hidden size-11 shrink-0 place-items-center rounded-2xl bg-[#e5f1ed] text-[#0d706d] sm:grid">
            <ShieldCheck className="size-5" />
          </span>
        </div>

        <div className="mt-7 grid grid-cols-2 rounded-xl bg-[#edf3f1] p-1">
          {(["signin", "signup"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => changeMode(item)}
              className={`h-10 rounded-lg text-sm font-semibold transition-all ${mode === item
                  ? "bg-white text-[#15363c] shadow-sm"
                  : "text-[#71858a] hover:text-[#35575d]"
                }`}
            >
              {item === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="full-name" className="text-sm font-semibold text-[#29494f]">
                Full name
              </Label>
              <Input
                id="full-name"
                required
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Enter your full name"
                className={inputClassName}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-[#29494f]">
              {mode === "signin" ? "Continue as" : "I am creating this account as"}
            </Label>

            <RadioGroup
              value={role}
              onValueChange={(value) => setRole(value as UserRole)}
              className="grid gap-3 sm:grid-cols-2"
            >
              <RoleOption
                value="parent"
                selected={role === "parent"}
                title="Parent"
                description="Receiving and managing care"
                icon={UserRound}
              />
              <RoleOption
                value="child"
                selected={role === "child"}
                title="Family member"
                description="Supporting a parent or relative"
                icon={Users}
              />
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-semibold text-[#29494f]">
              Email address
            </Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#87999c]" />
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className={`${inputClassName} pl-11`}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="password" className="text-sm font-semibold text-[#29494f]">
                Password
              </Label>

              {mode === "signin" && (
                <button
                  type="button"
                  onClick={() => setScreen("forgot")}
                  className="text-xs font-semibold text-[#0d706d] hover:underline"
                >
                  Forgot password?
                </button>
              )}
            </div>

            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#87999c]" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === "signup" ? "Minimum 6 characters" : "Enter your password"}
                className={`${inputClassName} pl-11 pr-12`}
              />
              <PasswordVisibilityButton
                visible={showPassword}
                onClick={() => setShowPassword((current) => !current)}
                label={showPassword ? "Hide password" : "Show password"}
              />
            </div>
          </div>

          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-sm font-semibold text-[#29494f]">
                Confirm password
              </Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#87999c]" />
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repeat your password"
                  className={`${inputClassName} pl-11 pr-12`}
                />
                <PasswordVisibilityButton
                  visible={showConfirmPassword}
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  label={showConfirmPassword ? "Hide password" : "Show password"}
                />
              </div>
            </div>
          )}

          <Button type="submit" disabled={loading} className={primaryButtonClassName}>
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner /> Please wait…
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                {mode === "signup" ? "Create account" : "Sign in"}
                <ArrowRight className="size-4" />
              </span>
            )}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-[#e0e9e6]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#95a4a7]">
            or continue with
          </span>
          <span className="h-px flex-1 bg-[#e0e9e6]" />
        </div>

        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={handleGoogle}
          className="h-12 w-full rounded-xl border-[#d6e2df] bg-white text-sm font-semibold text-[#26474d] hover:border-[#b8cfca] hover:bg-[#f7faf9]"
        >
          <GoogleIcon />
          Continue with Google
        </Button>

        <p className="mt-6 text-center text-sm text-[#71858a]">
          {mode === "signin" ? "New to ElderCare Connect?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => changeMode(mode === "signin" ? "signup" : "signin")}
            className="font-semibold text-[#0d706d] hover:underline"
          >
            {mode === "signin" ? "Create account" : "Sign in"}
          </button>
        </p>
      </AuthCard>
    </AuthLayout>
  );
}