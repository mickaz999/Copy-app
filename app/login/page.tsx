"use client";
import { useState } from "react";
import Logo from "@/components/Logo";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) window.location.href = "/";
    else setError("Mot de passe incorrect");
  }

  return (
    <div className="login">
      <form onSubmit={submit}>
        <Logo />
        <h2>ton espace <span className="accent">perso.</span></h2>
        <input type="password" autoFocus placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="primary">Entrer</button>
        {error && <span className="neg">{error}</span>}
      </form>
    </div>
  );
}
