"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./invite.module.css";

export default function InvitePage() {
  const params = useParams<{ code: string }>();
  const code = params.code;

  const supabase = createClient();

  const [status, setStatus] = useState("");

  async function acceptInvite() {
    setStatus("Joining server...");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data: invite, error: inviteError } = await supabase
      .from("invites")
      .select("id, server_id")
      .eq("code", code)
      .is("used_by", null)
      .single();

    if (inviteError || !invite) {
      setStatus("Invite not found or already used.");
      return;
    }

    const { error: memberError } = await supabase
      .from("server_members")
      .insert({
        server_id: invite.server_id,
        user_id: user.id,
        role: "member",
      });

    if (memberError && !memberError.message.includes("duplicate key")) {
      setStatus(memberError.message);
      return;
    }

    await supabase
      .from("invites")
      .update({ used_by: user.id })
      .eq("id", invite.id);

    const { data: channel, error: channelError } = await supabase
      .from("channels")
      .select("id")
      .eq("server_id", invite.server_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (channelError || !channel) {
      setStatus("Joined server, but no channel was found.");
      return;
    }

    window.location.href = `/channels/${channel.id}`;
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1>Join server</h1>
        <p>You were invited to join a private friend server.</p>

        <button onClick={acceptInvite}>Accept invite</button>

        {status && <p className={styles.status}>{status}</p>}
      </section>
    </main>
  );
}