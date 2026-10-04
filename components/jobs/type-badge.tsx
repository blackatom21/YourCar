import type { JobType } from "@/lib/validation";

const styles: Record<JobType, string> = {
  maintenance: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  upgrade: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  repair: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
};

export function TypeBadge({ type }: { type: JobType }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[type]}`}>{type}</span>;
}
