"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

const variants = {
  primary: "bg-amber-500 text-zinc-950 hover:bg-amber-400 disabled:bg-amber-300",
  secondary:
    "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
  danger: "bg-red-600 text-white hover:bg-red-500 disabled:bg-red-300",
} as const;

export const buttonClass = (variant: keyof typeof variants = "primary") =>
  `inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-4 text-base font-semibold transition-colors disabled:cursor-not-allowed ${variants[variant]}`;

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  ...props
}: ComponentProps<"button"> & { pendingText?: string; variant?: keyof typeof variants }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || props.disabled} {...props} className={`${buttonClass(variant)} ${props.className ?? ""}`}>
      {pending ? (pendingText ?? "Saving…") : children}
    </button>
  );
}
