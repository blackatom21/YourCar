import Link from "next/link";
import { notFound } from "next/navigation";
import { JobForm } from "@/components/jobs/job-form";
import { vehicleName } from "@/lib/format";
import { getProfile } from "@/lib/profile";
import { requireUser } from "@/lib/supabase/server";
import { jobTypes, type JobType } from "@/lib/validation";

export const metadata = { title: "Log a job" };

export default async function NewJobPage({ params, searchParams }: PageProps<"/vehicles/[vehicleId]/jobs/new">) {
  const { vehicleId } = await params;
  const { type, reminder } = await searchParams;
  const [{ supabase, user }, profile] = await Promise.all([requireUser(), getProfile()]);

  const [{ data: vehicle }, { data: reminders }] = await Promise.all([
    supabase.from("vehicles").select("id, year, make, model, trim, current_mileage").eq("id", vehicleId).maybeSingle(),
    supabase.from("reminders").select("id, title").eq("vehicle_id", vehicleId).eq("active", true).order("title"),
  ]);
  if (!vehicle) notFound();

  const presetReminder = reminders?.find((r) => r.id === reminder);
  const presetType = jobTypes.includes(type as JobType) ? (type as JobType) : "maintenance";

  return (
    <section className="flex flex-col gap-6">
      <Link href={`/vehicles/${vehicle.id}`} className="text-sm text-zinc-500">
        ← {vehicleName(vehicle)}
      </Link>
      <h1 className="text-2xl font-bold">Log a job</h1>
      <JobForm
        userId={user.id}
        vehicleId={vehicle.id}
        reminders={reminders ?? []}
        mileageHint={vehicle.current_mileage}
        distanceUnit={profile.distance_unit}
        currency={profile.currency}
        initial={{
          id: null,
          type: presetReminder ? "maintenance" : presetType,
          title: presetReminder?.title ?? "",
          performed_on: "",
          mileage: "",
          description: "",
          labor: "",
          total_cost_is_manual: false,
          total_cost: "",
          reminder_id: presetReminder?.id ?? "",
          parts: [],
          videos: [],
        }}
      />
    </section>
  );
}
