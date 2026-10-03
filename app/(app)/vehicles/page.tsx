import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Vehicles" };

export default async function VehiclesPage() {
  const { supabase } = await requireUser();
  const { data: vehicles } = await supabase.from("vehicles").select("id, year, make, model").order("created_at");

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Your vehicles</h1>
      {vehicles?.length ? (
        <ul className="flex flex-col gap-2">
          {vehicles.map((v) => (
            <li key={v.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              {[v.year, v.make, v.model].filter(Boolean).join(" ")}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-zinc-500">No vehicles yet.</p>
      )}
    </section>
  );
}
