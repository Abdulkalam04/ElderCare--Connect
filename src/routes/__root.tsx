import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Home,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f9f7] px-5 py-12">
      <section className="w-full max-w-xl rounded-[2rem] border border-[#dce8e4] bg-white p-7 text-center shadow-[0_30px_80px_-50px_rgba(17,51,56,0.5)] sm:p-10">
        <BrandLogo className="justify-center" size="lg" />

        <span className="mx-auto mt-9 grid size-14 place-items-center rounded-2xl bg-[#e8f3ef] text-[#176f69]">
          <Home className="size-6" />
        </span>

        <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-[#0d7774]">
          Error 404
        </p>

        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-[#14343a]">
          This page could not be found
        </h1>

        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#6d8387]">
          The link may be outdated, or the page may have moved to a
          different part of ElderCare Connect.
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl border-[#d4e2dd] bg-white px-5"
            onClick={() => window.history.back()}
          >
            <ArrowLeft className="size-4" />
            Go back
          </Button>

          <Button
            asChild
            className="h-11 rounded-xl bg-[#0d6665] px-5 text-white hover:bg-[#0a5958]"
          >
            <a href="/">
              <Home className="size-4" />
              Return home
            </a>
          </Button>
        </div>
      </section>
    </main>
  );
}

function ErrorComponent({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    reportLovableError(error, { boundary: "root" });
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f9f7] px-5 py-12">
      <section className="w-full max-w-xl rounded-[2rem] border border-[#e4d8d3] bg-white p-7 text-center shadow-[0_30px_80px_-50px_rgba(17,51,56,0.5)] sm:p-10">
        <BrandLogo className="justify-center" size="lg" />

        <span className="mx-auto mt-9 grid size-14 place-items-center rounded-2xl bg-[#f8e8e6] text-[#a44e49]">
          <AlertTriangle className="size-6" />
        </span>

        <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-[#a44e49]">
          Application error
        </p>

        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-[#14343a]">
          Something went wrong
        </h1>

        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#6d8387]">
          The page could not finish loading. Your account data has
          not been changed.
        </p>

        <div className="mx-auto mt-5 max-w-md rounded-xl border border-[#eadbd7] bg-[#fff8f7] px-4 py-3 text-left">
          <p className="text-xs font-semibold leading-5 text-[#8f5b56]">
            {error.message || "An unexpected application error occurred."}
          </p>
        </div>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl border-[#d4e2dd] bg-white px-5"
            onClick={() => window.location.assign("/")}
          >
            <Home className="size-4" />
            Return home
          </Button>

          <Button
            type="button"
            className="h-11 rounded-xl bg-[#0d6665] px-5 text-white hover:bg-[#0a5958]"
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            <RefreshCw className="size-4" />
            Try again
          </Button>
        </div>
      </section>
    </main>
  );
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      {
        title: "ElderCare Connect | Family Care Coordination",
      },
      {
        name: "description",
        content:
          "Coordinate medicines, health monitoring, appointments, caregivers, family communication and emergency support in one secure platform.",
      },
      {
        name: "theme-color",
        content: "#0c3f45",
      },
      {
        name: "color-scheme",
        content: "light",
      },
      {
        property: "og:title",
        content: "ElderCare Connect",
      },
      {
        property: "og:description",
        content:
          "Professional family care coordination and remote health support.",
      },
      {
        property: "og:type",
        content: "website",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon.svg",
      },
      {
        rel: "apple-touch-icon",
        href: "/favicon.svg",
      },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href:
          "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&family=Manrope:wght@600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>

      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data: subscription } =
      supabase.auth.onAuthStateChange((event) => {
        if (
          event !== "SIGNED_IN" &&
          event !== "SIGNED_OUT" &&
          event !== "USER_UPDATED"
        ) {
          return;
        }

        if (event === "SIGNED_OUT") {
          queryClient.clear();
          router.invalidate();
          return;
        }

        queryClient.invalidateQueries({
          queryKey: ["currentUser"],
        });

        router.invalidate();
      });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, [queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />

      <Toaster
        richColors
        position="top-right"
        closeButton
        toastOptions={{
          classNames: {
            toast:
              "rounded-2xl border-[#dce8e4] bg-white text-[#17343a] shadow-[0_20px_55px_-35px_rgba(17,51,56,0.45)]",
            title: "font-semibold",
            description: "text-[#71868a]",
            actionButton:
              "rounded-lg bg-[#0d6665] text-white hover:bg-[#0a5958]",
            cancelButton:
              "rounded-lg bg-[#edf3f1] text-[#466267]",
          },
        }}
      />
    </QueryClientProvider>
  );
}