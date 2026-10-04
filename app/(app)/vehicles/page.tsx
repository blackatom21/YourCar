import Link from "next/link";
import { buttonClass } from "@/components/ui/button-styles";
import { formatMileage, vehicleName } from "@/lib/format";
import { getProfile } from "@/lib/profile";
import { BUCKETS, signedUrls } from "@/lib/storage";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Vehicles" };

export default async function VehiclesPage() {
  const [{ supabase }, profile] = await Promise.all([requireUser(), getProfile()]);
  const [{ data: vehicles }, { data: due }] = await Promise.all([
    supabase.from("vehicles").select("*").is("archived_at", null).order("created_at"),
    supabase.from("reminder_status").select("vehicle_id, status").eq("active", true).in("status", ["overdue", "due_soon"]),
  ]);
  const covers = await signedUrls(supabase, BUCKETS.vehicle, (vehicles ?? []).map((v) => v.cover_photo_path));

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Your vehicles</h1>
      {vehicles?.length ? (
        <ul className="flex flex-col gap-3">
          {vehicles.map((v) => {
            const overdue = due?.filter((d) => d.vehicle_id === v.id && d.status === "overdue").length ?? 0;
            const soon = due?.filter((d) => d.vehicle_id === v.id && d.status === "due_soon").length ?? 0;
            const cover = v.cover_photo_path ? covers[v.cover_photo_path] : null;
            return (
              <li key={v.id}>
                <Link
                  href={`/vehicles/${v.id}`}
                  className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                      <img src={cover} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-2xl">🚙</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{vehicleName(v)}</div>
                    <div className="text-sm text-zinc-500">{formatMileage(v.current_mileage, profile.distance_unit)}</div>
                    {(overdue > 0 || soon > 0) && (
                      <div className="mt-1 flex gap-2 text-xs font-medium">
                        {overdue > 0 && <span className="text-red-600">{overdue} overdue</span>}
                        {soon > 0 && <span className="text-amber-600">{soon} due soon</span>}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-zinc-500">No vehicles yet. Add your first one to start logging jobs.</p>
      )}
      <Link href="/vehicles/new" className={buttonClass()}>
        + Add vehicle
      </Link>
    </section>
  );
}
