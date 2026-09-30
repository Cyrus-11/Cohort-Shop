import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GoogleButton } from "@/components/google-button";
import { getCurrentUser, safeNextPath } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

type LoginProps = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function LoginPage({ searchParams }: LoginProps) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (await getCurrentUser()) redirect(next);

  return (
    <div className="shell page">
      <section className="panel" aria-labelledby="login-title">
        <p className="brand-mark">Cohort Shop</p>
        <h1 id="login-title" className="panel-title">Sign in</h1>
        <p className="page-copy">
          Browsing is open to everyone. Sign in with Google to save items to your cart and check out.
        </p>
        {params.error ? (
          <p role="alert" className="form-error">
            Sign-in did not complete. Please try again.
          </p>
        ) : null}
        <GoogleButton next={next} />
      </section>
    </div>
  );
}
