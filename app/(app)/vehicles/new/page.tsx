import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { getProfile } from "@/lib/profile";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Add vehicle" };

export default async function NewVehiclePage() {
  const [{ user }, profile] = await Promise.all([requireUser(), getProfile()]);
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Add a vehicle</h1>
      <VehicleForm
        userId={user.id}
        vehicleId={null}
        distanceUnit={profile.distance_unit}
        initial={{ year: "", make: "", model: "", trim: "", vin: "", engine: "", current_mileage: "", purchase_date: "", notes: "", specs: [] }}
      />
    </section>
  );
}
