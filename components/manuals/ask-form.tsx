"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ask } from "@/app/(app)/vehicles/[vehicleId]/ask/actions";
import { buttonClass } from "@/components/ui/button-styles";
import { FormError, Textarea } from "@/components/ui/form";
import { AnswerView, type AnswerViewData } from "./answer-view";

export function AskForm({ vehicleId, jobs }: { vehicleId: string; jobs: { id: string; title: string }[] }) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AnswerViewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await ask(vehicleId, question);
            if (!res.ok) return setError(res.error);
            setAnswer(res.data);
            router.refresh(); // update history below
          });
        }}
        className="flex flex-col gap-3"
      >
        <Textarea
          aria-label="Your question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="e.g. Torque spec for the rear axle drain plug?"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.currentTarget.form as HTMLFormElement).requestSubmit();
          }}
        />
        <FormError message={error} />
        <button type="submit" disabled={pending || question.trim().length < 3} className={buttonClass()}>
          {pending ? "Searching your manuals…" : "Ask"}
        </button>
      </form>
      {answer && !pending && (
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <AnswerView data={answer} jobs={jobs} />
        </div>
      )}
    </div>
  );
}
