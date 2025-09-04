"use client";
import { useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function Login() {
  const [email,setEmail]=useState("");
  const [pw,setPw]=useState("");
  const [err,setErr]=useState("");

  async function signIn(){
    try{ await signInWithEmailAndPassword(auth,email,pw); }
    catch(e:any){ setErr(e.message || String(e)); }
  }
  async function signUp(){
    try{ await createUserWithEmailAndPassword(auth,email,pw); }
    catch(e:any){ setErr(e.message || String(e)); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-3">
        <h1 className="text-2xl font-semibold">Welcome to Lara</h1>
        <input className="w-full border p-2" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input className="w-full border p-2" placeholder="Password" type="password" value={pw} onChange={e=>setPw(e.target.value)} />
        <button className="w-full border p-2" onClick={signIn}>Sign in</button>
        <button className="w-full border p-2" onClick={signUp}>Create account</button>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </main>
  );
}
