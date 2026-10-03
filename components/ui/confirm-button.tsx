"use client";

import type { ReactNode } from "react";
import { SubmitButton } from "./button";

/** Destructive submit button that asks for confirmation first. */
export function ConfirmButton({ message, children }: { message: string; children: ReactNode }) {
  return (
    <SubmitButton
      variant="danger"
      pendingText="Deleting…"
      className="w-full"
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </SubmitButton>
  );
}
