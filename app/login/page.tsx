"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
} from "firebase/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // If already signed in, go to home
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) router.replace("/");
    });
    return () => unsub();
  }, [router]);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pw);
      router.replace("/");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), pw);
      router.replace("/");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <header className="text-center space-y-1">
          <h1 className="text-2xl font-semibold">Welcome to Lara</h1>
          <p className="text-sm text-neutral-400">
            Sign in or create an account to continue.
          </p>
        </header>

        <form className="space-y-3" onSubmit={handleSignIn}>
          <input
            className="w-full rounded border border-neutral-700 bg-white text-black px-3 py-2"
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="w-full rounded border border-neutral-700 bg-white text-black px-3 py-2"
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
          />

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded bg-white text-black px-3 py-2 font-medium disabled:opacity-60"
            >
              {loading ? "Working…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={loading}
              className="flex-1 rounded border border-white/60 px-3 py-2 font-medium disabled:opacity-60"
            >
              {loading ? "Working…" : "Create account"}
            </button>
          </div>
        </form>

        {err && (
          <p className="text-sm text-red-400" role="alert">
            {err}
          </p>
        )}

        <p className="text-xs text-neutral-500 text-center">
          By continuing you agree to our terms and privacy.
        </p>
      </div>
    </main>
  );
}
