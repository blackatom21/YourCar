import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteVehicle } from "../../actions";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { getProfile } from "@/lib/profile";
import { requireUser } from "@/lib/supabase/server";
import { parseSpecs } from "@/lib/validation";

export const metadata = { title: "Edit vehicle" };

export default async function EditVehiclePage({ params, searchParams }: PageProps<"/vehicles/[vehicleId]/edit">) {
  const { vehicleId } = await params;
  const { photoError } = await searchParams;
  const [{ supabase, user }, profile] = await Promise.all([requireUser(), getProfile()]);
  const { data: v } = await supabase.from("vehicles").select("*").eq("id", vehicleId).maybeSingle();
  if (!v) notFound();

  return (
    <section className="flex flex-col gap-6">
      <Link href={`/vehicles/${v.id}`} className="text-sm text-zinc-500">
        ← Back
      </Link>
      <h1 className="text-2xl font-bold">Edit vehicle</h1>
      {typeof photoError === "string" && (
        <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Vehicle saved, but the cover photo didn&apos;t upload ({photoError}). Try adding it again below.
        </p>
      )}
      <VehicleForm
        userId={user.id}
        vehicleId={v.id}
        distanceUnit={profile.distance_unit}
        initial={{
          year: v.year?.toString() ?? "",
          make: v.make,
          model: v.model,
          trim: v.trim ?? "",
          vin: v.vin ?? "",
          engine: v.engine ?? "",
          current_mileage: String(v.current_mileage),
          purchase_date: v.purchase_date ?? "",
          notes: v.notes ?? "",
          specs: parseSpecs(v.specs),
        }}
      />
      <form action={deleteVehicle.bind(null, v.id)} className="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <ConfirmButton message="Delete this vehicle and ALL of its jobs, photos, and reminders? This can't be undone.">
          Delete vehicle
        </ConfirmButton>
      </form>
    </section>
  );
}
