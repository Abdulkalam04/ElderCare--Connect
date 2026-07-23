import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none transition-colors focus:outline-none focus:ring-2 focus:ring-[#0d7774]/25 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-[#c8e0d6] bg-[#e5f2ed] text-[#176f5f]",
        secondary:
          "border-[#dce5e2] bg-[#f0f4f2] text-[#5d7377]",
        destructive:
          "border-[#e8ceca] bg-[#f8e8e6] text-[#a04e49]",
        outline:
          "border-[#d5e2de] bg-white text-[#557075]",
        warning:
          "border-[#ead6bd] bg-[#fbf5ec] text-[#95602f]",
        information:
          "border-[#cbdce8] bg-[#eef4f8] text-[#456f91]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
  VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };