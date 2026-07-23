import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7774]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-[#0d6665] bg-[#0d6665] text-white shadow-[0_12px_26px_-16px_rgba(13,102,101,0.85)] hover:-translate-y-0.5 hover:border-[#0a5958] hover:bg-[#0a5958] hover:shadow-[0_18px_32px_-18px_rgba(13,102,101,0.75)]",
        destructive:
          "border border-[#a74742] bg-[#a74742] text-white shadow-[0_12px_25px_-17px_rgba(167,71,66,0.7)] hover:-translate-y-0.5 hover:border-[#913c38] hover:bg-[#913c38]",
        outline:
          "border border-[#d4e1dd] bg-white text-[#3d5d62] shadow-[0_10px_22px_-20px_rgba(18,49,54,0.5)] hover:-translate-y-0.5 hover:border-[#aecac1] hover:bg-[#f2f8f5] hover:text-[#0d6665]",
        secondary:
          "border border-[#cfe0da] bg-[#e7f2ee] text-[#176f69] hover:-translate-y-0.5 hover:border-[#b8d2ca] hover:bg-[#dcece6]",
        ghost:
          "border border-transparent text-[#60787d] hover:bg-[#edf5f2] hover:text-[#0d6665]",
        link:
          "h-auto rounded-md border-0 bg-transparent px-0 text-[#0d7774] shadow-none underline-offset-4 hover:underline",
        success:
          "border border-[#2f8167] bg-[#2f8167] text-white shadow-[0_12px_25px_-17px_rgba(47,129,103,0.7)] hover:-translate-y-0.5 hover:bg-[#286f59]",
        warning:
          "border border-[#a76a38] bg-[#a76a38] text-white hover:-translate-y-0.5 hover:bg-[#915a2f]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-xl px-6 text-base",
        icon: "size-10 rounded-xl",
        "icon-sm": "size-8 rounded-lg",
        "icon-lg": "size-12 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      type,
      ...props
    },
    ref,
  ) => {
    const Component = asChild ? Slot : "button";

    return (
      <Component
        ref={ref}
        type={asChild ? undefined : (type ?? "button")}
        className={cn(
          buttonVariants({ variant, size }),
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";

export { Button, buttonVariants };