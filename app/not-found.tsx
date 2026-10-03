import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-sm flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">Not found</h1>
      <p className="text-zinc-500">This page doesn&apos;t exist, or it isn&apos;t yours.</p>
      <Link href="/vehicles" className="font-medium text-amber-600 underline">
        Back to your vehicles
      </Link>
    </main>
  );
}
