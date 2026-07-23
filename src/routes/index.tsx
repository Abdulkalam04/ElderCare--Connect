import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Activity,
  ArrowRight,
  BellRing,
  CalendarDays,
  Check,
  ChevronRight,
  HeartPulse,
  LockKeyhole,
  Menu,
  MessageCircleHeart,
  Pill,
  ShieldCheck,
  Stethoscope,
  Users,
  Video,
  X,
} from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,

  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();

    if (data.session) {
      throw redirect({
        to: "/dashboard",
      });
    }
  },

  component: HomePage,
});

const features = [
  {
    icon: Pill,
    title: "Medication management",
    description:
      "Create schedules, track adherence and keep every family member informed without constant follow-ups.",
  },
  {
    icon: Activity,
    title: "Health monitoring",
    description:
      "Review vitals, wellbeing check-ins and meaningful changes from one calm, easy-to-read workspace.",
  },
  {
    icon: CalendarDays,
    title: "Coordinated care",
    description:
      "Organise appointments, caregivers, transport and consultations around one shared care plan.",
  },
  {
    icon: ShieldCheck,
    title: "Emergency readiness",
    description:
      "Keep emergency contacts, SOS controls and safety workflows ready when every second matters.",
  },
  {
    icon: Users,
    title: "Family collaboration",
    description:
      "Give the right people the right updates while protecting private health information.",
  },
  {
    icon: MessageCircleHeart,
    title: "AI-assisted support",
    description:
      "Use risk checks, emergency detection and a companion experience designed to support—not overwhelm.",
  },
];

const steps = [
  {
    number: "01",
    title: "Create the care circle",
    description:
      "Add the parent, trusted family members, caregivers and emergency contacts.",
  },
  {
    number: "02",
    title: "Build the daily routine",
    description:
      "Set medicines, appointments, wellbeing check-ins and transport needs.",
  },
  {
    number: "03",
    title: "Stay informed, not overwhelmed",
    description:
      "See important updates, risks and next actions in one clear dashboard.",
  },
];

function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f7faf9] text-[#102a2f]">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-[#dfe9e6]/80 bg-[#f7faf9]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <Link
            to="/"
            className="flex items-center gap-3"
            aria-label="ElderCare Connect home"
          >
            <span className="grid size-11 place-items-center rounded-2xl bg-[#0d6665] shadow-[0_10px_30px_-15px_rgba(13,102,101,0.75)]">
              <HeartPulse
                className="size-6 text-white"
                strokeWidth={2.1}
              />
            </span>

            <span className="font-sans text-lg font-bold tracking-[-0.03em] text-[#102a2f] sm:text-xl">
              ElderCare{" "}
              <span className="text-[#0d7774]">Connect</span>
            </span>
          </Link>

          <nav
            className="hidden items-center gap-8 lg:flex"
            aria-label="Main navigation"
          >
            <a
              className="text-sm font-semibold text-[#476066] transition-colors hover:text-[#0d6665]"
              href="#features"
            >
              Platform
            </a>

            <a
              className="text-sm font-semibold text-[#476066] transition-colors hover:text-[#0d6665]"
              href="#how-it-works"
            >
              How it works
            </a>

            <a
              className="text-sm font-semibold text-[#476066] transition-colors hover:text-[#0d6665]"
              href="#security"
            >
              Security
            </a>
          </nav>

          <div className="hidden items-center gap-3 sm:flex">
            <Button
              asChild
              variant="ghost"
              className="h-11 rounded-xl px-5 font-semibold text-[#23444a] hover:bg-[#eaf2f0]"
            >
              <Link to="/auth">Sign in</Link>
            </Button>

            <Button
              asChild
              className="h-11 rounded-xl bg-[#0d6665] px-5 font-semibold text-white shadow-[0_14px_30px_-16px_rgba(13,102,101,0.85)] hover:bg-[#0a5958]"
            >
              <Link to="/auth">
                Get started
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>

          <button
            type="button"
            className="grid size-11 place-items-center rounded-xl border border-[#d8e5e1] bg-white text-[#23444a] sm:hidden"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={
              mobileMenuOpen
                ? "Close navigation menu"
                : "Open navigation menu"
            }
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <X className="size-5" />
            ) : (
              <Menu className="size-5" />
            )}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-[#dfe9e6] bg-white px-5 py-5 sm:hidden">
            <nav
              className="mx-auto flex max-w-7xl flex-col gap-2"
              aria-label="Mobile navigation"
            >
              {[
                ["Platform", "#features"],
                ["How it works", "#how-it-works"],
                ["Security", "#security"],
              ].map(([label, href]) => (
                <a
                  key={label}
                  href={href}
                  className="rounded-xl px-4 py-3 text-sm font-semibold text-[#36555b] hover:bg-[#edf5f2]"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {label}
                </a>
              ))}

              <Button
                asChild
                className="mt-2 h-11 rounded-xl bg-[#0d6665] text-white hover:bg-[#0a5958]"
              >
                <Link to="/auth">
                  Sign in or create account
                </Link>
              </Button>
            </nav>
          </div>
        )}
      </header>

      <main>
        {/* Hero section */}
        <section className="relative overflow-hidden border-b border-[#e2ece8]">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-28 top-10 size-[32rem] rounded-full bg-[#d9eee6]/70 blur-3xl" />
            <div className="absolute -left-36 bottom-0 size-[28rem] rounded-full bg-[#f3e8d9]/70 blur-3xl" />
          </div>

          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.02fr_0.98fr] lg:px-10 lg:py-24">
            <div className="max-w-2xl">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#cde2db] bg-white/85 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#0d6665] shadow-sm">
                <ShieldCheck className="size-4" />
                Family-first care coordination
              </div>

              <h1 className="font-sans text-4xl font-bold leading-[1.08] tracking-[-0.045em] text-[#0d2730] sm:text-5xl lg:text-[4rem]">
                Confident care,
                <span className="block text-[#0d7774]">
                  even from a distance.
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-8 text-[#587077] sm:text-lg">
                ElderCare Connect gives families one secure place
                to manage medicines, health updates, appointments,
                caregivers and emergencies—without turning care
                into another full-time job.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  className="h-13 rounded-xl bg-[#0d6665] px-7 text-base font-semibold text-white shadow-[0_18px_38px_-18px_rgba(13,102,101,0.9)] hover:bg-[#0a5958]"
                >
                  <Link to="/auth">
                    Start managing care
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>

                <a
                  href="#features"
                  className="inline-flex h-13 items-center justify-center gap-2 rounded-xl border border-[#cadbd6] bg-white px-7 text-base font-semibold text-[#23444a] transition hover:border-[#9fbfb5] hover:bg-[#f1f7f5]"
                >
                  Explore the platform
                  <ChevronRight className="size-4" />
                </a>
              </div>

              <div className="mt-9 grid max-w-xl gap-3 text-sm text-[#476066] sm:grid-cols-3">
                {[
                  "Secure by design",
                  "Built for families",
                  "Simple daily workflows",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2"
                  >
                    <span className="grid size-5 place-items-center rounded-full bg-[#dff0e9] text-[#0d7774]">
                      <Check
                        className="size-3.5"
                        strokeWidth={2.5}
                      />
                    </span>

                    <span className="font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Professional dashboard preview */}
            <div className="relative mx-auto w-full max-w-2xl lg:max-w-none">
              <div className="absolute -inset-5 rounded-[2.25rem] bg-gradient-to-br from-[#cfe5de]/70 via-white/10 to-[#f1dec7]/60 blur-2xl" />

              <div className="relative overflow-hidden rounded-[2rem] border border-white/90 bg-[#0d343b] p-3 shadow-[0_35px_90px_-35px_rgba(15,35,57,0.55)] sm:p-4">
                <div className="rounded-[1.45rem] bg-[#f8fbfa] p-4 sm:p-6">
                  <div className="flex items-center justify-between border-b border-[#e3ece9] pb-5">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#799095]">
                        Today&apos;s care overview
                      </p>

                      <h2 className="mt-1 font-sans text-xl font-bold tracking-[-0.03em] text-[#17343a]">
                        Good morning, Aarav
                      </h2>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="relative grid size-10 place-items-center rounded-xl border border-[#dce8e4] bg-white text-[#31565d]">
                        <BellRing className="size-4.5" />
                        <span className="absolute right-2 top-2 size-1.5 rounded-full bg-[#d87846]" />
                      </span>

                      <span className="grid size-10 place-items-center rounded-xl bg-[#0d6665] text-sm font-bold text-white">
                        AM
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <MetricCard
                      label="Medicines"
                      value="4 of 5"
                      detail="1 due at 8:30 PM"
                      tone="teal"
                      icon={Pill}
                    />

                    <MetricCard
                      label="Wellbeing"
                      value="Stable"
                      detail="Check-in completed"
                      tone="green"
                      icon={HeartPulse}
                    />

                    <MetricCard
                      label="Next visit"
                      value="11:00 AM"
                      detail="Video consultation"
                      tone="orange"
                      icon={Video}
                    />
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.22fr_0.78fr]">
                    <div className="rounded-2xl border border-[#dfeae6] bg-white p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7a9095]">
                            Health trend
                          </p>

                          <h3 className="mt-1 font-sans text-base font-bold text-[#17343a]">
                            Vitals remain within range
                          </h3>
                        </div>

                        <span className="rounded-full bg-[#e4f2ec] px-3 py-1 text-xs font-bold text-[#19715f]">
                          Normal
                        </span>
                      </div>

                      <div className="mt-5 grid grid-cols-3 gap-3">
                        {[
                          ["Heart rate", "72", "bpm"],
                          ["Blood pressure", "120/80", "mmHg"],
                          ["Oxygen", "98", "%"],
                        ].map(([label, value, unit]) => (
                          <div
                            key={label}
                            className="rounded-xl bg-[#f5f8f7] p-3"
                          >
                            <p className="text-[11px] font-semibold text-[#71878c]">
                              {label}
                            </p>

                            <p className="mt-2 text-lg font-bold tracking-[-0.03em] text-[#18363c]">
                              {value}{" "}
                              <span className="text-[10px] font-semibold text-[#7c9094]">
                                {unit}
                              </span>
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-5 flex h-24 items-end gap-2 rounded-xl bg-[#f5f8f7] px-4 pb-4 pt-3">
                        {[
                          42, 58, 48, 72, 62, 78, 67, 84, 74, 88,
                          80, 92,
                        ].map((height, index) => (
                          <span
                            key={`${height}-${index}`}
                            className="flex-1 rounded-t-full bg-gradient-to-t from-[#0d6665] to-[#68aaa1]"
                            style={{
                              height: `${height}%`,
                              opacity: 0.72 + index * 0.018,
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#dfeae6] bg-white p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7a9095]">
                            Care circle
                          </p>

                          <h3 className="mt-1 font-sans text-base font-bold text-[#17343a]">
                            Everyone is connected
                          </h3>
                        </div>

                        <Users className="size-5 text-[#0d7774]" />
                      </div>

                      <div className="mt-5 space-y-3">
                        {[
                          [
                            "Priya Sharma",
                            "Primary caregiver",
                            "PS",
                            "bg-[#dceee8] text-[#12695f]",
                          ],
                          [
                            "Dr. Anjali Mehta",
                            "Family doctor",
                            "AM",
                            "bg-[#e8edf5] text-[#3f5c83]",
                          ],
                          [
                            "Rohan Mehta",
                            "Family member",
                            "RM",
                            "bg-[#f5e8dc] text-[#9b5a2f]",
                          ],
                        ].map(
                          ([
                            name,
                            role,
                            initials,
                            avatarClass,
                          ]) => (
                            <div
                              key={name}
                              className="flex items-center gap-3 rounded-xl bg-[#f7faf9] p-3"
                            >
                              <span
                                className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold ${avatarClass}`}
                              >
                                {initials}
                              </span>

                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold text-[#213f45]">
                                  {name}
                                </p>

                                <p className="truncate text-xs text-[#7a8d91]">
                                  {role}
                                </p>
                              </div>

                              <span
                                className="size-2 rounded-full bg-[#39a77a]"
                                title="Active"
                              />
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-6 -left-4 hidden w-52 rounded-2xl border border-[#dce8e4] bg-white p-4 shadow-[0_20px_45px_-22px_rgba(15,35,57,0.4)] sm:block">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-[#f7e8dc] text-[#c66d39]">
                    <Stethoscope className="size-5" />
                  </span>

                  <div>
                    <p className="text-xs font-semibold text-[#74898e]">
                      Next appointment
                    </p>

                    <p className="mt-0.5 text-sm font-bold text-[#19373d]">
                      Tomorrow, 10:30 AM
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Platform statistics */}
        <section className="bg-white py-10">
          <div className="mx-auto grid max-w-7xl gap-6 px-5 sm:grid-cols-2 sm:px-8 lg:grid-cols-4 lg:px-10">
            {[
              ["One shared view", "for the whole care circle"],
              ["24/7 readiness", "for urgent situations"],
              ["Private by default", "with controlled access"],
              ["Daily clarity", "without unnecessary noise"],
            ].map(([title, detail]) => (
              <div
                key={title}
                className="border-l-2 border-[#bdd8d0] pl-5"
              >
                <p className="text-base font-bold tracking-[-0.02em] text-[#18363c]">
                  {title}
                </p>

                <p className="mt-1 text-sm text-[#75898e]">
                  {detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section
          id="features"
          className="border-y border-[#e3ece9] bg-[#f4f8f6] py-20 sm:py-24"
        >
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0d7774]">
                One connected platform
              </p>

              <h2 className="mt-4 font-sans text-3xl font-bold tracking-[-0.04em] text-[#102d34] sm:text-4xl">
                Everything your family needs to coordinate care
                with confidence.
              </h2>

              <p className="mt-5 max-w-2xl text-base leading-7 text-[#62787d]">
                Designed around the real work of caring—clear
                priorities, simple actions and useful context for
                every person involved.
              </p>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {features.map(
                (
                  {
                    icon: Icon,
                    title,
                    description,
                  },
                  index,
                ) => (
                  <article
                    key={title}
                    className="group rounded-2xl border border-[#dce7e3] bg-white p-6 shadow-[0_16px_36px_-30px_rgba(15,35,57,0.45)] transition duration-300 hover:-translate-y-1 hover:border-[#b9d2ca] hover:shadow-[0_24px_46px_-28px_rgba(15,35,57,0.35)]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <span className="grid size-11 place-items-center rounded-xl bg-[#e6f2ee] text-[#0d706d] transition group-hover:bg-[#0d6665] group-hover:text-white">
                        <Icon className="size-5" />
                      </span>

                      <span className="text-xs font-bold text-[#b3c1c2]">
                        0{index + 1}
                      </span>
                    </div>

                    <h3 className="mt-6 font-sans text-lg font-bold tracking-[-0.025em] text-[#17343a]">
                      {title}
                    </h3>

                    <p className="mt-3 text-sm leading-6 text-[#6e8388]">
                      {description}
                    </p>
                  </article>
                ),
              )}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
          className="bg-white py-20 sm:py-24"
        >
          <div className="mx-auto grid max-w-7xl gap-14 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:px-10">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0d7774]">
                How it works
              </p>

              <h2 className="mt-4 font-sans text-3xl font-bold tracking-[-0.04em] text-[#102d34] sm:text-4xl">
                Set up once. Stay aligned every day.
              </h2>

              <p className="mt-5 max-w-md text-base leading-7 text-[#667c81]">
                ElderCare Connect reduces scattered messages and
                missed details by giving everyone a single,
                structured care workflow.
              </p>

              <Button
                asChild
                variant="outline"
                className="mt-8 h-12 rounded-xl border-[#bdd3cc] bg-white px-6 font-semibold text-[#1d4e52] hover:bg-[#eef6f3]"
              >
                <Link to="/auth">
                  Create your care circle
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>

            <div className="space-y-4">
              {steps.map((step) => (
                <article
                  key={step.number}
                  className="grid gap-5 rounded-2xl border border-[#dce7e3] bg-[#f8fbfa] p-6 sm:grid-cols-[4rem_1fr] sm:items-start"
                >
                  <span className="font-sans text-2xl font-bold tracking-[-0.05em] text-[#a6c8be]">
                    {step.number}
                  </span>

                  <div>
                    <h3 className="font-sans text-lg font-bold tracking-[-0.025em] text-[#18363c]">
                      {step.title}
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-[#70858a]">
                      {step.description}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Security */}
        <section
          id="security"
          className="px-5 pb-20 sm:px-8 sm:pb-24 lg:px-10"
        >
          <div className="mx-auto grid max-w-7xl overflow-hidden rounded-[2rem] bg-[#0c3d43] lg:grid-cols-[1.08fr_0.92fr]">
            <div className="p-8 sm:p-12 lg:p-14">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#bfe1d7]">
                <LockKeyhole className="size-4" />
                Privacy and security
              </div>

              <h2 className="mt-6 max-w-2xl font-sans text-3xl font-bold tracking-[-0.04em] text-white sm:text-4xl">
                Sensitive care information deserves serious
                protection.
              </h2>

              <p className="mt-5 max-w-2xl text-base leading-7 text-[#c4d6d7]">
                Role-based access, secure authentication and
                privacy-focused workflows help families share what
                matters without exposing what does not.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {[
                  "Controlled family access",
                  "Secure account authentication",
                  "Clear emergency permissions",
                  "Private health records",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 text-sm font-semibold text-white/90"
                  >
                    <span className="grid size-6 place-items-center rounded-full bg-[#78b9a7]/20 text-[#9dd3c4]">
                      <Check className="size-3.5" />
                    </span>

                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative min-h-72 overflow-hidden border-t border-white/10 bg-[#0a3237] p-8 lg:border-l lg:border-t-0">
              <div className="absolute -right-16 -top-16 size-56 rounded-full border border-white/10" />
              <div className="absolute -right-4 -top-4 size-36 rounded-full border border-white/10" />

              <div className="relative flex h-full items-center justify-center">
                <div className="w-full max-w-sm rounded-2xl border border-white/12 bg-white/8 p-6 backdrop-blur-sm">
                  <div className="flex items-center gap-4">
                    <span className="grid size-12 place-items-center rounded-2xl bg-[#79bba8] text-[#08363a]">
                      <ShieldCheck className="size-6" />
                    </span>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#91bdb5]">
                        Protection status
                      </p>

                      <p className="mt-1 text-lg font-bold text-white">
                        Your care circle is secure
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 space-y-3">
                    {[
                      "Identity verified",
                      "Access permissions active",
                      "Emergency contacts confirmed",
                    ].map((item) => (
                      <div
                        key={item}
                        className="flex items-center justify-between rounded-xl bg-white/7 px-4 py-3"
                      >
                        <span className="text-sm font-medium text-white/80">
                          {item}
                        </span>

                        <Check className="size-4 text-[#91d2bd]" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Call to action */}
        <section className="border-y border-[#e1ebe8] bg-[#edf5f2] py-16">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 sm:px-8 lg:flex-row lg:items-center lg:px-10">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0d7774]">
                Start with clarity
              </p>

              <h2 className="mt-3 font-sans text-3xl font-bold tracking-[-0.04em] text-[#102d34]">
                Bring your family&apos;s care into one calm place.
              </h2>

              <p className="mt-3 text-base text-[#667c81]">
                Set up your account and create a shared care circle
                today.
              </p>
            </div>

            <Button
              asChild
              className="h-13 shrink-0 rounded-xl bg-[#0d6665] px-7 text-base font-semibold text-white hover:bg-[#0a5958]"
            >
              <Link to="/auth">
                Get started now
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#092f34] py-10 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-white/10">
              <HeartPulse className="size-5 text-[#a5d4c6]" />
            </span>

            <div>
              <p className="font-sans text-base font-bold">
                ElderCare Connect
              </p>

              <p className="mt-0.5 text-xs text-white/55">
                Care coordination for modern families
              </p>
            </div>
          </div>

          <p className="text-xs text-white/50">
            © {new Date().getFullYear()} ElderCare Connect. Built
            with care and privacy in mind.
          </p>
        </div>
      </footer>
    </div>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
  detail: string;
  tone: "teal" | "green" | "orange";
  icon: typeof Pill;
};

function MetricCard({
  label,
  value,
  detail,
  tone,
  icon: Icon,
}: MetricCardProps) {
  const toneClasses = {
    teal: "bg-[#e2f1ed] text-[#0d706d]",
    green: "bg-[#e6f2e8] text-[#4a8a5b]",
    orange: "bg-[#f7e9dd] text-[#c46d38]",
  } as const;

  return (
    <div className="rounded-2xl border border-[#dfeae6] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-[#72878c]">
          {label}
        </p>

        <span
          className={`grid size-8 place-items-center rounded-lg ${toneClasses[tone]}`}
        >
          <Icon className="size-4" />
        </span>
      </div>

      <p className="mt-4 text-lg font-bold tracking-[-0.03em] text-[#17343a]">
        {value}
      </p>

      <p className="mt-1 text-[11px] leading-4 text-[#819397]">
        {detail}
      </p>
    </div>
  );
}