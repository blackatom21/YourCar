import { signIn } from "../actions";
import { AuthForm } from "../auth-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return (
    <>
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          That link is invalid or has expired. Please sign in or sign up again.
        </p>
      ) : null}
      <AuthForm mode="login" action={signIn} next={typeof next === "string" ? next : undefined} />
    </>
  );
}
