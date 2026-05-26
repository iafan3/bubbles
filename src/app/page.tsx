"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import styles from "./home.module.css";

type Server = {
  id: string;
  name: string;
  owner_id: string;
};

type Channel = {
  id: string;
  server_id: string;
  name: string;
};

export default function HomePage() {
  const supabase = useMemo(() => createClient(), []);

  const [currentUserId, setCurrentUserId] = useState("");
  const [servers, setServers] = useState<Server[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [newChannelNames, setNewChannelNames] = useState<Record<string, string>>(
    {}
  );
  const [status, setStatus] = useState("Loading...");

  useEffect(() => {
    async function loadDashboard() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        window.location.href = "/login";
        return;
      }

      setCurrentUserId(user.id);

      const { data: memberships, error: membershipError } = await supabase
        .from("server_members")
        .select("server_id")
        .eq("user_id", user.id);

      if (membershipError) {
        setStatus(membershipError.message);
        return;
      }

      const serverIds =
        memberships?.map((membership) => membership.server_id) ?? [];

      if (serverIds.length === 0) {
        setServers([]);
        setChannels([]);
        setStatus("You are not in any servers yet.");
        return;
      }

      const { data: serverData, error: serverError } = await supabase
        .from("servers")
        .select("id, name, owner_id")
        .in("id", serverIds)
        .order("created_at", { ascending: true });

      if (serverError) {
        setStatus(serverError.message);
        return;
      }

      const { data: channelData, error: channelError } = await supabase
        .from("channels")
        .select("id, server_id, name")
        .in("server_id", serverIds)
        .order("created_at", { ascending: true });

      if (channelError) {
        setStatus(channelError.message);
        return;
      }

      setServers(serverData ?? []);
      setChannels(channelData ?? []);
      setStatus("");
    }

    loadDashboard();
  }, [supabase]);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function deleteServer(serverId: string, serverName: string) {
    const confirmed = window.confirm(
      `Delete "${serverName}"? This will permanently delete its channels and messages.`
    );

    if (!confirmed) return;

    setStatus("");

    const { error } = await supabase
      .from("servers")
      .delete()
      .eq("id", serverId)
      .eq("owner_id", currentUserId);

    if (error) {
      setStatus(error.message);
      return;
    }

    const updatedServers = servers.filter((server) => server.id !== serverId);
    const updatedChannels = channels.filter(
      (channel) => channel.server_id !== serverId
    );

    setServers(updatedServers);
    setChannels(updatedChannels);

    if (updatedServers.length === 0) {
      setStatus("You are not in any servers yet.");
    }
  }

  async function createChannel(event: React.FormEvent, serverId: string) {
    event.preventDefault();

    const rawName = newChannelNames[serverId]?.trim();

    if (!rawName) return;

    const cleanName = rawName
      .replace(/^#+/, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .slice(0, 32);

    if (!cleanName) return;

    setStatus("");

    const { data: channel, error } = await supabase
      .from("channels")
      .insert({
        server_id: serverId,
        name: cleanName,
      })
      .select("id, server_id, name")
      .single();

    if (error) {
      setStatus(error.message);
      return;
    }

    if (channel) {
      setChannels((current) => [...current, channel]);
      setNewChannelNames((current) => ({
        ...current,
        [serverId]: "",
      }));
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Friend Chat</h1>
          <p>Your private servers and channels.</p>
        </div>

        <button onClick={logout}>Logout</button>
      </header>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2>Your servers</h2>
          <Link href="/setup">Create server</Link>
        </div>

        {status && <p className={styles.status}>{status}</p>}

        <div className={styles.serverList}>
          {servers.map((server) => {
            const serverChannels = channels.filter(
              (channel) => channel.server_id === server.id
            );

            const isOwner = server.owner_id === currentUserId;

            return (
              <section className={styles.server} key={server.id}>
                <div className={styles.serverHeader}>
                  <div>
                    <h3>{server.name}</h3>
                    {isOwner && <span className={styles.ownerBadge}>Owner</span>}
                  </div>

                  {isOwner && (
                    <button
                      className={styles.deleteButton}
                      onClick={() => deleteServer(server.id, server.name)}
                    >
                      Delete server
                    </button>
                  )}
                </div>

                {serverChannels.length === 0 ? (
                  <p className={styles.empty}>No channels yet.</p>
                ) : (
                  <div className={styles.channelList}>
                    {serverChannels.map((channel) => (
                      <Link
                        className={styles.channel}
                        href={`/channels/${channel.id}`}
                        key={channel.id}
                      >
                        # {channel.name}
                      </Link>
                    ))}
                  </div>
                )}

                {isOwner && (
                  <form
                    className={styles.channelForm}
                    onSubmit={(event) => createChannel(event, server.id)}
                  >
                    <input
                      value={newChannelNames[server.id] ?? ""}
                      onChange={(event) =>
                        setNewChannelNames((current) => ({
                          ...current,
                          [server.id]: event.target.value,
                        }))
                      }
                      placeholder="New channel name"
                    />
                    <button>Create channel</button>
                  </form>
                )}
              </section>
            );
          })}
        </div>
      </section>
    </main>
  );
}