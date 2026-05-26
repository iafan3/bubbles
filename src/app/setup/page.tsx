"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./setup.module.css";

export default function SetupPage() {
  const supabase = createClient();

  const [serverName, setServerName] = useState("Friends");
  const [status, setStatus] = useState("");

  async function createServer() {
    setStatus("Creating server...");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setStatus("You need to sign in first.");
      return;
    }

    const { data: server, error: serverError } = await supabase
      .from("servers")
      .insert({
        name: serverName,
        owner_id: user.id,
      })
      .select("id")
      .single();

    if (serverError || !server) {
      setStatus(serverError?.message ?? "Could not create server.");
      return;
    }

    const { error: memberError } = await supabase
      .from("server_members")
      .insert({
        server_id: server.id,
        user_id: user.id,
        role: "owner",
      });

    if (memberError) {
      setStatus(memberError.message);
      return;
    }

    const { data: channel, error: channelError } = await supabase
      .from("channels")
      .insert({
        server_id: server.id,
        name: "general",
      })
      .select("id")
      .single();

    if (channelError || !channel) {
      setStatus(channelError?.message ?? "Could not create channel.");
      return;
    }

    window.location.href = `/channels/${channel.id}`;
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1>Create your first server</h1>
        <p>This will make a private server with one channel called general.</p>

        <input
          className={styles.input}
          value={serverName}
          onChange={(event) => setServerName(event.target.value)}
          placeholder="Server name"
        />

        <button className={styles.button} onClick={createServer}>
          Create server
        </button>

        {status && <p className={styles.status}>{status}</p>}
      </section>
    </main>
  );
}