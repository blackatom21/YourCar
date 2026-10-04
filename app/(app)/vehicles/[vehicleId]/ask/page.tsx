import Link from "next/link";
import { notFound } from "next/navigation";
import { AnswerView, type AnswerViewData } from "@/components/manuals/answer-view";
import { AskForm } from "@/components/manuals/ask-form";
import { formatDate, vehicleName } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Ask your manuals" };

interface StoredAnswer {
  parts?: AnswerViewData["parts"];
  citations?: AnswerViewData["citations"];
  notFoundReason?: string | null;
}

export default async function AskPage({ params }: PageProps<"/vehicles/[vehicleId]/ask">) {
  const { vehicleId } = await params;
  const { supabase } = await requireUser();
  const [{ data: vehicle }, { data: manuals }, { data: history }, { data: jobs }] = await Promise.all([
    supabase.from("vehicles").select("id, year, make, model, trim").eq("id", vehicleId).maybeSingle(),
    supabase.from("manuals").select("id, title, status").eq("vehicle_id", vehicleId),
    supabase
      .from("qa_questions")
      .select("id, question, found, answer, citations, warnings, candidates, cost_usd, created_at")
      .eq("vehicle_id", vehicleId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("jobs").select("id, title").eq("vehicle_id", vehicleId).order("performed_on", { ascending: false }).limit(30),
  ]);
  if (!vehicle) notFound();
  const ready = (manuals ?? []).filter((m) => m.status === "ready");
  const processing = (manuals ?? []).filter((m) => m.status === "queued" || m.status === "processing");

  return (
    <section className="flex flex-col gap-6">
      <Link href={`/vehicles/${vehicle.id}`} className="text-sm text-zinc-500">
        ← {vehicleName(vehicle)}
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Ask your manuals</h1>
        <p className="text-sm text-zinc-500">
          Answers come only from your uploaded manuals, with page citations.{" "}
          {ready.length ? `Searching ${ready.map((m) => m.title).join(", ")}.` : ""}
        </p>
      </div>

      {ready.length === 0 ? (
        <p className="rounded-lg bg-zinc-50 p-4 text-sm dark:bg-zinc-900">
          {processing.length ? "Your manual is still processing — check back shortly. " : "No manuals ready yet. "}
          <Link href={`/vehicles/${vehicle.id}/manuals`} className="font-medium text-amber-700 underline dark:text-amber-400">
            {processing.length ? "See progress" : "Upload a manual"}
          </Link>
        </p>
      ) : (
        <AskForm vehicleId={vehicle.id} jobs={jobs ?? []} />
      )}

      {history && history.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Recent questions</h2>
          {history.map((q) => {
            const stored = (q.citations ?? {}) as StoredAnswer;
            return (
              <details key={q.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <summary className="cursor-pointer">
                  <span className="font-medium">{q.question}</span>
                  <span className="ml-2 text-xs text-zinc-500">
                    {formatDate(q.created_at)} · {q.found ? "answered" : "not found"}
                  </span>
                </summary>
                <div className="mt-3">
                  <AnswerView
                    jobs={jobs ?? []}
                    data={{
                      question: q.question,
                      found: q.found,
                      parts: stored.parts ?? [],
                      citations: stored.citations ?? [],
                      notFoundReason: stored.notFoundReason ?? (q.found ? null : q.answer),
                      warnings: (q.warnings ?? []) as unknown as AnswerViewData["warnings"],
                      closest: (q.candidates ?? []) as unknown as AnswerViewData["closest"],
                      costUsd: Number(q.cost_usd),
                    }}
                  />
                </div>
              </details>
            );
          })}
        </section>
      )}
    </section>
  );
}
