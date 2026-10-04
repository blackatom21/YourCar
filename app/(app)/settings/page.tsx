import { SettingsForm } from "./settings-form";
import { getProfile } from "@/lib/profile";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [{ user }, profile] = await Promise.all([requireUser(), getProfile()]);
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="text-sm text-zinc-500">Signed in as {user.email}</p>
      <SettingsForm initial={profile} />
    </section>
  );
}
