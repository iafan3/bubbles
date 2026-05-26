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

type UnreadMap = Record<string, number | { count?: number }>;

function normalizeUnreadCount(value: UnreadMap[string] | undefined) {
  if (typeof value === "number") return value;
  if (value && typeof value.count === "number") return value.count;
  return 0;
}

function readUnreadMap() {
  const possibleKeys = [
    "bubbles-unreads",
    "bubbles:unreads",
    "bubblesUnreadCounts",
  ];

  for (const key of possibleKeys) {
    const cached = window.localStorage.getItem(key);

    if (!cached) continue;

    try {
      const parsed = JSON.parse(cached);

      if (parsed && typeof parsed === "object") {
        return parsed as UnreadMap;
      }
    } catch {
      window.localStorage.removeItem(key);
    }
  }

  return {};
}

export default function HomePage() {
  const supabase = useMemo(() => createClient(), []);

  const [currentUserId, setCurrentUserId] = useState("");
  const [servers, setServers] = useState<Server[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [unreadByChannelId, setUnreadByChannelId] = useState<UnreadMap>({});
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
      setUnreadByChannelId(readUnreadMap());

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

      const nextChannels = channelData ?? [];

      setServers(serverData ?? []);
      setChannels(nextChannels);
      window.sessionStorage.setItem(
        "bubbles-channels",
        JSON.stringify(nextChannels)
      );
      setStatus("");
    }

    loadDashboard();

    function syncUnreadCounts() {
      setUnreadByChannelId(readUnreadMap());
    }

    window.addEventListener("storage", syncUnreadCounts);
    window.addEventListener("focus", syncUnreadCounts);

    return () => {
      window.removeEventListener("storage", syncUnreadCounts);
      window.removeEventListener("focus", syncUnreadCounts);
    };
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

  function getServerChannels(serverId: string) {
    return channels.filter((channel) => channel.server_id === serverId);
  }

  function getServerUnreadCount(serverId: string) {
    return getServerChannels(serverId).reduce((total, channel) => {
      return total + normalizeUnreadCount(unreadByChannelId[channel.id]);
    }, 0);
  }

  function getFirstChannel(serverId: string) {
    return getServerChannels(serverId)[0] ?? null;
  }

  const totalUnreadCount = servers.reduce((total, server) => {
    return total + getServerUnreadCount(server.id);
  }, 0);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Bubbles</h1>
          <p>
            {totalUnreadCount > 0
              ? `${totalUnreadCount} unread notification${
                  totalUnreadCount === 1 ? "" : "s"
                }`
              : "Your private servers"}
          </p>
        </div>

        <button type="button" onClick={logout}>
          Logout
        </button>
      </header>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>Your servers</h2>
            <p className={styles.cardSubtext}>
              Pick a server to enter your first channel.
            </p>
          </div>

          <Link href="/setup">Create server</Link>
        </div>

        {status && <p className={styles.status}>{status}</p>}

        <div className={styles.serverList}>
          {servers.map((server) => {
            const firstChannel = getFirstChannel(server.id);
            const isOwner = server.owner_id === currentUserId;
            const unreadCount = getServerUnreadCount(server.id);

            return (
              <section className={styles.server} key={server.id}>
                {firstChannel ? (
                  <Link
                    className={styles.serverMainLink}
                    href={`/channels/${firstChannel.id}`}
                  >
                    <span className={styles.serverIcon} aria-hidden="true">
                      {server.name.charAt(0).toUpperCase() || "B"}
                    </span>

                    <span className={styles.serverText}>
                      <h3>{server.name}</h3>

                      <span className={styles.serverMeta}>
                        {isOwner && (
                          <span className={styles.ownerBadge}>Owner</span>
                        )}
                        <span>Enter server</span>
                      </span>
                    </span>

                    {unreadCount > 0 && (
                      <span className={styles.serverUnreadBadge}>
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}

                    <span className={styles.serverArrow} aria-hidden="true">
                      →
                    </span>
                  </Link>
                ) : (
                  <div
                    className={`${styles.serverMainLink} ${styles.disabledServerLink}`}
                  >
                    <span className={styles.serverIcon} aria-hidden="true">
                      {server.name.charAt(0).toUpperCase() || "B"}
                    </span>

                    <span className={styles.serverText}>
                      <h3>{server.name}</h3>

                      <span className={styles.serverMeta}>
                        {isOwner && (
                          <span className={styles.ownerBadge}>Owner</span>
                        )}
                        <span>No channels yet</span>
                      </span>
                    </span>
                  </div>
                )}

                {isOwner && (
                  <button
                    className={styles.deleteButton}
                    type="button"
                    onClick={() => deleteServer(server.id, server.name)}
                  >
                    Delete
                  </button>
                )}
              </section>
            );
          })}

          {!status && servers.length === 0 && (
            <p className={styles.empty}>No servers yet. Create one to start.</p>
          )}
        </div>
      </section>
    </main>
  );
}
