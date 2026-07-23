import { cn } from "@/lib/utils";

type BrandSize = "sm" | "md" | "lg";
type BrandTone = "dark" | "light";

const sizeClasses: Record<
  BrandSize,
  {
    icon: string;
    title: string;
    subtitle: string;
    gap: string;
  }
> = {
  sm: {
    icon: "size-8",
    title: "text-sm",
    subtitle: "text-[9px]",
    gap: "gap-2",
  },
  md: {
    icon: "size-10",
    title: "text-base",
    subtitle: "text-[10px]",
    gap: "gap-2.5",
  },
  lg: {
    icon: "size-12",
    title: "text-xl",
    subtitle: "text-[11px]",
    gap: "gap-3",
  },
};

export function BrandIcon({
  className,
  rounded = true,
}: {
  className?: string;
  rounded?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      role="img"
      aria-label="ElderCare Connect"
    >
      <defs>
        <linearGradient
          id="eldercare-mark-background"
          x1="8"
          y1="6"
          x2="55"
          y2="58"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#15827d" />
          <stop offset="1" stopColor="#0a4f53" />
        </linearGradient>

        <linearGradient
          id="eldercare-mark-line"
          x1="18"
          y1="20"
          x2="47"
          y2="44"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#d9f1e8" />
          <stop offset="1" stopColor="#8bcbb9" />
        </linearGradient>
      </defs>

      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx={rounded ? 17 : 0}
        fill="url(#eldercare-mark-background)"
      />

      <path
        d="M32 13.5 49 20v11.2c0 10.4-6.5 16.9-17 20.4-10.5-3.5-17-10-17-20.4V20l17-6.5Z"
        fill="#ffffff"
        fillOpacity="0.12"
        stroke="#ffffff"
        strokeOpacity="0.82"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      <path
        d="M20.5 33h7l3.4-7.1 4.4 13.2 3.1-6.1h5.1"
        fill="none"
        stroke="url(#eldercare-mark-line)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BrandLogo({
  className,
  size = "md",
  tone = "dark",
  showSubtitle = false,
}: {
  className?: string;
  size?: BrandSize;
  tone?: BrandTone;
  showSubtitle?: boolean;
}) {
  const styles = sizeClasses[size];

  return (
    <div
      className={cn(
        "inline-flex min-w-0 items-center",
        styles.gap,
        className,
      )}
    >
      <BrandIcon
        className={cn(
          styles.icon,
          "rounded-2xl shadow-[0_12px_24px_-14px_rgba(8,79,83,0.9)]",
        )}
      />

      <div className="min-w-0">
        <span
          className={cn(
            "block truncate font-display font-extrabold leading-none tracking-[-0.035em]",
            styles.title,
            tone === "light" ? "text-white" : "text-[#14343a]",
          )}
        >
          ElderCare{" "}
          <span
            className={
              tone === "light" ? "text-[#9ed6c7]" : "text-[#0d7774]"
            }
          >
            Connect
          </span>
        </span>

        {showSubtitle && (
          <span
            className={cn(
              "mt-1 block truncate font-semibold uppercase tracking-[0.12em]",
              styles.subtitle,
              tone === "light"
                ? "text-white/48"
                : "text-[#7a8e92]",
            )}
          >
            Connected family care
          </span>
        )}
      </div>
    </div>
  );
}