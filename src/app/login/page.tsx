"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./login.module.css";

export default function LoginPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  async function signUp() {
    setStatus("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setStatus(error.message);
      return;
    }

    setStatus("Account created. Check your email if confirmation is enabled.");
  }

  async function signIn() {
    setStatus("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setStatus(error.message);
      return;
    }

    window.location.href = "/setup";
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1>Friend Chat</h1>
        <p>Sign in or create an account.</p>

        <input
          className={styles.input}
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <input
          className={styles.input}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <div className={styles.buttons}>
          <button onClick={signIn}>Sign in</button>
          <button onClick={signUp}>Sign up</button>
        </div>

        {status && <p className={styles.status}>{status}</p>}
      </section>
    </main>
  );
}