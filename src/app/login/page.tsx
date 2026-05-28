"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./login.module.css";

export default function LoginPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validateCredentials() {
    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      setStatus("Enter your email and password first.");
      return null;
    }

    if (password.length < 6) {
      setStatus("Password must be at least 6 characters.");
      return null;
    }

    return { email: cleanEmail, password };
  }

  function getAuthMessage(message: string) {
    if (message.toLowerCase().includes("anonymous")) {
      return "Enter your email and password first.";
    }

    return message;
  }

  async function signUp() {
    setStatus("");

    const credentials = validateCredentials();
    if (!credentials) return;

    setIsSubmitting(true);

    const { error } = await supabase.auth.signUp(credentials);

    setIsSubmitting(false);

    if (error) {
      setStatus(getAuthMessage(error.message));
      return;
    }

    setStatus("Account created. Check your email if confirmation is enabled.");
  }

  async function signIn() {
    setStatus("");

    const credentials = validateCredentials();
    if (!credentials) return;

    setIsSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword(credentials);

    setIsSubmitting(false);

    if (error) {
      setStatus(getAuthMessage(error.message));
      return;
    }

    window.location.href = "/";
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1>Welcome to Bubbles!</h1>
        <p>Sign in or create an account.</p>

        <input
          className={styles.input}
          type="email"
          placeholder="Email"
          value={email}
          autoComplete="email"
          required
          onChange={(event) => setEmail(event.target.value)}
        />

        <input
          className={styles.input}
          type="password"
          placeholder="Password"
          value={password}
          autoComplete="current-password"
          required
          onChange={(event) => setPassword(event.target.value)}
        />

        <div className={styles.buttons}>
          <button type="button" onClick={signIn} disabled={isSubmitting}>
            {isSubmitting ? "Working..." : "Sign in"}
          </button>
          <button type="button" onClick={signUp} disabled={isSubmitting}>
            Sign up
          </button>
        </div>

        {status && <p className={styles.status}>{status}</p>}
      </section>
    </main>
  );
}
