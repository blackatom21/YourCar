export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-4 py-12">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Garage Log</h1>
        <p className="mt-1 text-zinc-500">Every job, part, and spec for your vehicles.</p>
      </div>
      {children}
    </main>
  );
}
