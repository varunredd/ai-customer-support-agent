"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/Button";
import styles from "./login.module.css";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: { message?: unknown } };
      if (!response.ok) {
        throw new Error(typeof payload.error?.message === "string" ? payload.error.message : "Unable to sign in.");
      }
      const next = searchParams.get("next");
      router.replace(next && next.startsWith("/admin") ? next : "/admin");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.card} onSubmit={(event) => void onSubmit(event)}>
      <div className={styles.header}>
        <div className={styles.mark} aria-hidden="true">
          <Bot size={18} />
        </div>
        <p className={styles.eyebrow}>Staff console</p>
        <h1>Sign in to Jobform</h1>
        <p className={styles.copy}>Use your operations email and password.</p>
      </div>

      <label className={styles.field}>
        Email
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="ops@company.com"
          required
        />
      </label>
      <label className={styles.field}>
        Password
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <Button type="submit" size="lg" className={styles.submit} disabled={submitting}>
        {submitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <Suspense>
          <LoginForm />
        </Suspense>
        <Link href="/" className={styles.back}>Back to home</Link>
      </div>
    </div>
  );
}
