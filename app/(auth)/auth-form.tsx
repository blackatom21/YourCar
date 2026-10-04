"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import type { AuthState } from "./actions";

export function AuthForm({
  mode,
  action,
  next,
}: {
  mode: "login" | "signup";
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  next?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const isLogin = mode === "login";

  if (state?.message) {
    return <p className="rounded-lg bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{state.message}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required inputMode="email" defaultValue={state?.email} />
      </Field>
      <Field label="Password" hint={isLogin ? undefined : "At least 8 characters."}>
        <Input
          name="password"
          type="password"
          autoComplete={isLogin ? "current-password" : "new-password"}
          minLength={8}
          required
        />
      </Field>
      <FormError message={state?.error} />
      <SubmitButton pendingText={isLogin ? "Signing in…" : "Creating account…"}>
        {isLogin ? "Sign in" : "Create account"}
      </SubmitButton>
      <p className="text-center text-sm text-zinc-500">
        {isLogin ? "New here? " : "Already have an account? "}
        <Link className="font-medium text-amber-600 underline" href={isLogin ? "/signup" : "/login"}>
          {isLogin ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </form>
  );
}
