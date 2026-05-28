"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import styles from "./home.module.css";

type Server = {
  id: string;
  name: string;
  owner_id: string;
  avatar_url: string | null;
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
  const [isLoading, setIsLoading] = useState(true);

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
        setIsLoading(false);
        return;
      }

      const serverIds =
        memberships?.map((membership) => membership.server_id) ?? [];

      if (serverIds.length === 0) {
        setServers([]);
        setChannels([]);
        window.sessionStorage.removeItem("bubbles-channels");
        setStatus("");
        setIsLoading(false);
        return;
      }

      const { data: serverData, error: serverError } = await supabase
        .from("servers")
        .select("id, name, owner_id, avatar_url")
        .in("id", serverIds)
        .order("created_at", { ascending: true });

      if (serverError) {
        setStatus(serverError.message);
        setIsLoading(false);
        return;
      }

      const { data: channelData, error: channelError } = await supabase
        .from("channels")
        .select("id, server_id, name")
        .in("server_id", serverIds)
        .order("created_at", { ascending: true });

      if (channelError) {
        setStatus(channelError.message);
        setIsLoading(false);
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
      setIsLoading(false);
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
              {servers.length > 0
                ? "Pick a server to enter your first channel."
                : "Servers you join will appear here."}
            </p>
          </div>

          <Link href="/setup">Create server</Link>
        </div>

        {status && !isLoading && <p className={styles.status}>{status}</p>}

        <div className={styles.serverList}>
          {isLoading
            ? Array.from({ length: 4 }).map((_, index) => (
                <section
                  className={`${styles.server} ${styles.skeletonServer}`}
                  key={`server-skeleton-${index}`}
                  aria-hidden="true"
                >
                  <div className={styles.serverMainLink}>
                    <span
                      className={`${styles.serverIcon} ${styles.skeletonBlock}`}
                    />
                    <span className={styles.serverText}>
                      <span
                        className={`${styles.skeletonLine} ${styles.skeletonLineTitle}`}
                      />
                      <span
                        className={`${styles.skeletonLine} ${styles.skeletonLineMeta}`}
                      />
                    </span>
                    <span
                      className={`${styles.serverArrow} ${styles.skeletonBlock}`}
                    />
                  </div>
                </section>
              ))
            : servers.map((server) => {
            const firstChannel = getFirstChannel(server.id);
            const unreadCount = getServerUnreadCount(server.id);

            return (
              <section className={styles.server} key={server.id}>
                {firstChannel ? (
                  <Link
                    className={styles.serverMainLink}
                    href={`/channels/${firstChannel.id}`}
                  >
                    <span className={styles.serverIcon} aria-hidden="true">
                      {server.avatar_url ? (
                        <img src={server.avatar_url} alt="" />
                      ) : (
                        server.name.charAt(0).toUpperCase() || "B"
                      )}
                    </span>

                      <span className={styles.serverText}>
                        <h3>{server.name}</h3>

                        <span className={styles.serverMeta}>
                          {server.owner_id === currentUserId && (
                            <span className={styles.ownerBadge}>Owner</span>
                          )}
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
                      {server.avatar_url ? (
                        <img src={server.avatar_url} alt="" />
                      ) : (
                        server.name.charAt(0).toUpperCase() || "B"
                      )}
                    </span>

                      <span className={styles.serverText}>
                        <h3>{server.name}</h3>

                        <span className={styles.serverMeta}>
                          {server.owner_id === currentUserId && (
                            <span className={styles.ownerBadge}>Owner</span>
                          )}
                          <span>No channels yet</span>
                        </span>
                      </span>
                    </div>
                  )}
              </section>
            );
          })}

          {!isLoading && !status && servers.length === 0 && (
            <div className={styles.emptyState}>
              <h3>No servers yet</h3>
              <p>
                You can stay here without creating anything. Open an invite link
                to join a server, or create one when you want your own space.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
