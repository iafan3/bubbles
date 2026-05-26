"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./settings.module.css";

type Server = {
  id: string;
  name: string;
  owner_id: string;
};

type ServerSettings = {
  server_id: string;
  reaction_emojis: string[];
};

const DEFAULT_REACTION_EMOJIS = ["👍", "😂", "❤️", "🔥", "😭", "🎉"];

export default function ServerSettingsPage() {
  const params = useParams<{ serverId: string }>();
  const serverId = params.serverId;

  const supabase = useMemo(() => createClient(), []);

  const [server, setServer] = useState<Server | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [reactionEmojis, setReactionEmojis] = useState<string[]>(
    DEFAULT_REACTION_EMOJIS
  );
  const [newEmoji, setNewEmoji] = useState("");
  const [status, setStatus] = useState("Loading...");
  const [backChannelId, setBackChannelId] = useState("");

  useEffect(() => {
    async function loadSettings() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        window.location.href = "/login";
        return;
      }

      setCurrentUserId(user.id);

      const { data: serverData, error: serverError } = await supabase
        .from("servers")
        .select("id, name, owner_id")
        .eq("id", serverId)
        .single();

      if (serverError || !serverData) {
        setStatus(serverError?.message ?? "Server not found.");
        return;
      }

      setServer(serverData);

      if (serverData.owner_id !== user.id) {
        setStatus("Only the server owner can edit these settings.");
        return;
      }

      const { data: settingsData, error: settingsError } = await supabase
        .from("server_settings")
        .select("server_id, reaction_emojis")
        .eq("server_id", serverId)
        .maybeSingle();

      if (settingsError) {
        setStatus(settingsError.message);
        return;
      }

      if (settingsData?.reaction_emojis?.length) {
        setReactionEmojis(settingsData.reaction_emojis);
      } else {
        setReactionEmojis(DEFAULT_REACTION_EMOJIS);
      }

      const { data: firstChannel } = await supabase
        .from("channels")
        .select("id")
        .eq("server_id", serverId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstChannel?.id) {
        setBackChannelId(firstChannel.id);
      }

      setStatus("");
    }

    loadSettings();
  }, [serverId, supabase]);

  function cleanEmoji(value: string) {
    return value.trim().slice(0, 16);
  }

  function addEmoji(event: React.FormEvent) {
    event.preventDefault();

    const cleaned = cleanEmoji(newEmoji);

    if (!cleaned) return;

    if (reactionEmojis.includes(cleaned)) {
      setStatus("That emoji is already in this server.");
      return;
    }

    setReactionEmojis((current) => [...current, cleaned]);
    setNewEmoji("");
    setStatus("");
  }

  function deleteEmoji(emoji: string) {
    setReactionEmojis((current) => current.filter((item) => item !== emoji));
  }

  async function saveSettings() {
    if (!server) return;

    if (server.owner_id !== currentUserId) {
      setStatus("Only the server owner can edit these settings.");
      return;
    }

    if (reactionEmojis.length === 0) {
      setStatus("Add at least one reaction emoji.");
      return;
    }

    setStatus("Saving...");

    const settings: ServerSettings = {
      server_id: serverId,
      reaction_emojis: reactionEmojis,
    };

    const { error } = await supabase
      .from("server_settings")
      .upsert(settings, {
        onConflict: "server_id",
      });

    if (error) {
      setStatus(error.message);
      return;
    }

    setStatus("Settings saved.");
  }

  const backHref = backChannelId ? `/channels/${backChannelId}` : "/";

  const canEdit = server?.owner_id === currentUserId;

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.topbar}>
          <Link href={backHref}>← Back to server</Link>
        </div>

        <header className={styles.header}>
          <div>
            <h1>Server Settings</h1>
            <p>{server?.name ?? "Loading server..."}</p>
          </div>
        </header>

        <section className={styles.section}>
          <h2>Reaction emojis</h2>
          <p>
            These emojis appear in the right-click reaction menu for this server.
          </p>

          <div className={styles.emojiGrid}>
            {reactionEmojis.map((emoji) => (
              <div className={styles.emojiItem} key={emoji}>
                <span>{emoji}</span>

                {canEdit && (
                  <button type="button" onClick={() => deleteEmoji(emoji)}>
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>

          {canEdit && (
            <form className={styles.addEmojiForm} onSubmit={addEmoji}>
              <input
                value={newEmoji}
                onChange={(event) => setNewEmoji(event.target.value)}
                placeholder="Add emoji, e.g. 💀"
              />
              <button>Add</button>
            </form>
          )}
        </section>

        {canEdit && (
          <button className={styles.saveButton} onClick={saveSettings}>
            Save settings
          </button>
        )}

        {status && <p className={styles.status}>{status}</p>}
      </section>
    </main>
  );
}