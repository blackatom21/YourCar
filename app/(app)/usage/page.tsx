import Link from "next/link";
import { formatDate } from "@/lib/format";
import { formatUsd } from "@/lib/rag/pricing";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Usage & cost" };

const KIND_LABEL: Record<string, string> = {
  ocr: "OCR (scanned pages)",
  embed_document: "Indexing manuals (embeddings)",
  embed_query: "Question search (embeddings)",
  rerank: "Result ranking",
  answer: "Answers (Claude)",
};

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

export default async function UsagePage() {
  const { supabase } = await requireUser();
  const since = daysAgoIso(30);
  const [{ data: events }, { data: manuals }, { data: questions }] = await Promise.all([
    supabase.from("usage_events").select("kind, cost_usd, input_tokens, output_tokens, pages, created_at").gte("created_at", since).limit(10000),
    supabase.from("manuals").select("id, title, page_count, ocr_pages, ingest_cost_usd, status").order("created_at", { ascending: false }),
    supabase.from("qa_questions").select("id, question, found, cost_usd, created_at, vehicle_id").order("created_at", { ascending: false }).limit(25),
  ]);

  const byKind = new Map<string, { cost: number; count: number; tokens: number; pages: number }>();
  for (const e of events ?? []) {
    const k = byKind.get(e.kind) ?? { cost: 0, count: 0, tokens: 0, pages: 0 };
    k.cost += Number(e.cost_usd);
    k.count += 1;
    k.tokens += e.input_tokens + e.output_tokens;
    k.pages += e.pages;
    byKind.set(e.kind, k);
  }
  const total30 = [...byKind.values()].reduce((s, k) => s + k.cost, 0);
  const answered = (questions ?? []).filter((q) => q.found);
  const avgQuestion = questions?.length ? questions.reduce((s, q) => s + Number(q.cost_usd), 0) / questions.length : 0;
  const ready = (manuals ?? []).filter((m) => m.status === "ready" && m.page_count);
  const pages = ready.reduce((s, m) => s + (m.page_count ?? 0), 0);
  const perThousandPages = pages ? (ready.reduce((s, m) => s + Number(m.ingest_cost_usd), 0) / pages) * 1000 : 0;

  const tile = "rounded-xl border border-zinc-200 p-3 dark:border-zinc-800";
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Usage &amp; cost</h1>
        <p className="text-sm text-zinc-500">Estimated from provider list prices. Your actual bill comes from Anthropic and Voyage.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className={tile}>
          <div className="text-xs text-zinc-500">Last 30 days</div>
          <div className="text-xl font-semibold">{formatUsd(total30)}</div>
        </div>
        <div className={tile}>
          <div className="text-xs text-zinc-500">Avg per question</div>
          <div className="text-xl font-semibold">{formatUsd(avgQuestion)}</div>
        </div>
        <div className={tile}>
          <div className="text-xs text-zinc-500">Per 1,000 manual pages</div>
          <div className="text-xl font-semibold">{formatUsd(perThousandPages)}</div>
        </div>
        <div className={tile}>
          <div className="text-xs text-zinc-500">Answered / asked</div>
          <div className="text-xl font-semibold">
            {answered.length}/{questions?.length ?? 0}
          </div>
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">By activity (30 days)</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="py-1 font-medium">Activity</th>
              <th className="py-1 text-right font-medium">Calls</th>
              <th className="py-1 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {[...byKind.entries()].map(([kind, k]) => (
              <tr key={kind} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-2">
                  {KIND_LABEL[kind] ?? kind}
                  {k.pages ? <span className="text-zinc-500"> · {k.pages} pages</span> : null}
                </td>
                <td className="py-2 text-right">{k.count}</td>
                <td className="py-2 text-right">{formatUsd(k.cost)}</td>
              </tr>
            ))}
            {byKind.size === 0 && (
              <tr>
                <td colSpan={3} className="py-2 text-zinc-500">
                  No usage yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Manual processing</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {(manuals ?? []).map((m) => (
            <li key={m.id} className="flex justify-between gap-2 border-t border-zinc-200 py-2 dark:border-zinc-800">
              <span className="min-w-0 truncate">
                {m.title}
                <span className="text-zinc-500">
                  {" "}
                  · {m.page_count ?? "?"} pages{m.ocr_pages ? `, ${m.ocr_pages} OCR` : ""}
                </span>
              </span>
              <span>{m.status === "ready" ? formatUsd(m.ingest_cost_usd) : m.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Recent questions</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {(questions ?? []).map((q) => (
            <li key={q.id} className="flex justify-between gap-2 border-t border-zinc-200 py-2 dark:border-zinc-800">
              <Link href={`/vehicles/${q.vehicle_id}/ask`} className="min-w-0 truncate underline-offset-2 hover:underline">
                {q.question}
                <span className="text-zinc-500"> · {formatDate(q.created_at)}{q.found ? "" : " · not found"}</span>
              </Link>
              <span>{formatUsd(q.cost_usd)}</span>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
