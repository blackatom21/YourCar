"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, type ButtonVariant } from "./button-styles";

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  ...props
}: ComponentProps<"button"> & { pendingText?: string; variant?: ButtonVariant }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || props.disabled} {...props} className={`${buttonClass(variant)} ${props.className ?? ""}`}>
      {pending ? (pendingText ?? "Saving…") : children}
    </button>
  );
}
