import Link from "next/link";
import { signOut } from "../(auth)/actions";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user } = await requireUser();
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-background/90 backdrop-blur dark:border-zinc-800">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Link href="/vehicles" className="text-lg font-bold">
            Garage Log
          </Link>
          <div className="flex items-center">
            <Link href="/usage" className="flex min-h-11 items-center px-2 text-sm text-zinc-500 hover:text-foreground">
              Usage
            </Link>
            <Link href="/settings" className="flex min-h-11 items-center px-2 text-sm text-zinc-500 hover:text-foreground">
              Settings
            </Link>
            <form action={signOut}>
              <button className="min-h-11 px-2 text-sm text-zinc-500 hover:text-foreground" title={user.email}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
