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
  avatar_url: string | null;
  avatar_path: string | null;
};

type Channel = {
  id: string;
  server_id: string;
  name: string;
  type: "text" | "voice";
  sort_order: number | null;
};

type ServerSettings = {
  server_id: string;
  reaction_emojis: string[] | null;
};

type CustomEmoji = {
  id: string;
  server_id: string;
  name: string;
  image_url: string;
  image_path: string;
  created_at: string;
};

const SERVER_ASSETS_BUCKET = "server-assets";
const FALLBACK_REACTION_EMOJIS = ["👍", "😂", "❤️", "🔥", "😭", "🎉"];
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const MAX_EMOJI_SIZE = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function cleanFileName(fileName: string) {
  const parts = fileName.split(".");
  const extension = parts.length > 1 ? parts.pop() : "";
  const baseName = parts.join(".") || "image";

  const safeBaseName = baseName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .slice(0, 48);

  return `${safeBaseName || "image"}${extension ? `.${extension}` : ""}`;
}

function cleanEmojiName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/^:+|:+$/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .slice(0, 32);
}

export default function ServerSettingsPage() {
  const params = useParams<{ serverId: string }>();
  const serverId = params.serverId;
  const supabase = useMemo(() => createClient(), []);

  const [currentUserId, setCurrentUserId] = useState("");
  const [server, setServer] = useState<Server | null>(null);
  const [firstTextChannel, setFirstTextChannel] = useState<Channel | null>(null);
  const [reactionEmojis, setReactionEmojis] = useState<string[]>(
    FALLBACK_REACTION_EMOJIS
  );
  const [customEmojis, setCustomEmojis] = useState<CustomEmoji[]>([]);

  const [serverName, setServerName] = useState("");
  const [newReactionEmoji, setNewReactionEmoji] = useState("");
  const [newCustomEmojiName, setNewCustomEmojiName] = useState("");
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [customEmojiFile, setCustomEmojiFile] = useState<File | null>(null);

  const [status, setStatus] = useState("Loading server settings...");
  const [isSavingServer, setIsSavingServer] = useState(false);
  const [isSavingReactions, setIsSavingReactions] = useState(false);
  const [isUploadingEmoji, setIsUploadingEmoji] = useState(false);

  const isOwner = Boolean(server && currentUserId && server.owner_id === currentUserId);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  useEffect(() => {
    async function loadSettings() {
      setStatus("Loading server settings...");

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
        .select("id, name, owner_id, avatar_url, avatar_path")
        .eq("id", serverId)
        .single();

      if (serverError || !serverData) {
        setStatus(serverError?.message ?? "Could not load server.");
        return;
      }

      const loadedServer = serverData as Server;
      setServer(loadedServer);
      setServerName(loadedServer.name);

      if (loadedServer.owner_id !== user.id) {
        setStatus("Only the server owner can edit these settings.");
        return;
      }

      const { data: channelData } = await supabase
        .from("channels")
        .select("id, server_id, name, type, sort_order")
        .eq("server_id", serverId)
        .eq("type", "text")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      setFirstTextChannel((channelData as Channel | null) ?? null);

      const { data: settingsData, error: settingsError } = await supabase
        .from("server_settings")
        .select("server_id, reaction_emojis")
        .eq("server_id", serverId)
        .maybeSingle();

      if (settingsError) {
        setStatus(settingsError.message);
        return;
      }

      const settings = settingsData as ServerSettings | null;

      if (settings?.reaction_emojis?.length) {
        setReactionEmojis(settings.reaction_emojis);
      }

      const { data: customEmojiData, error: customEmojiError } = await supabase
        .from("server_custom_emojis")
        .select("id, server_id, name, image_url, image_path, created_at")
        .eq("server_id", serverId)
        .order("created_at", { ascending: false });

      if (customEmojiError) {
        setStatus(customEmojiError.message);
        return;
      }

      setCustomEmojis((customEmojiData ?? []) as CustomEmoji[]);
      setStatus("");
    }

    loadSettings();
  }, [serverId, supabase]);

  function validateImageFile(file: File, maxSize: number) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setStatus("Please choose a PNG, JPG, WebP, or GIF image.");
      return false;
    }

    if (file.size > maxSize) {
      setStatus(
        `Image must be smaller than ${(maxSize / 1024 / 1024).toFixed(0)}MB.`
      );
      return false;
    }

    return true;
  }

  function handleAvatarFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;
    if (!validateImageFile(file, MAX_AVATAR_SIZE)) return;

    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }

    setAvatarFile(file);
    setAvatarPreviewUrl(URL.createObjectURL(file));
    setStatus("");
  }

  function handleCustomEmojiFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;
    if (!validateImageFile(file, MAX_EMOJI_SIZE)) return;

    setCustomEmojiFile(file);
    setStatus("");
  }

  async function uploadServerAvatar() {
    if (!avatarFile || !server) {
      return {
        avatar_url: server?.avatar_url ?? null,
        avatar_path: server?.avatar_path ?? null,
      };
    }

    const safeFileName = cleanFileName(avatarFile.name);
    const avatarPath = `${serverId}/avatar/${crypto.randomUUID()}-${safeFileName}`;

    const { error: uploadError } = await supabase.storage
      .from(SERVER_ASSETS_BUCKET)
      .upload(avatarPath, avatarFile, {
        cacheControl: "3600",
        contentType: avatarFile.type,
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(SERVER_ASSETS_BUCKET).getPublicUrl(avatarPath);

    if (server.avatar_path) {
      await supabase.storage
        .from(SERVER_ASSETS_BUCKET)
        .remove([server.avatar_path]);
    }

    return {
      avatar_url: publicUrl,
      avatar_path: avatarPath,
    };
  }

  async function saveServerOverview(event: React.FormEvent) {
    event.preventDefault();

    if (!server || !isOwner) return;

    const cleanName = serverName.trim().slice(0, 64);

    if (!cleanName) {
      setStatus("Server name cannot be empty.");
      return;
    }

    setIsSavingServer(true);
    setStatus("");

    try {
      const avatarFields = await uploadServerAvatar();

      const { data, error } = await supabase
        .from("servers")
        .update({
          name: cleanName,
          avatar_url: avatarFields.avatar_url,
          avatar_path: avatarFields.avatar_path,
        })
        .eq("id", serverId)
        .eq("owner_id", currentUserId)
        .select("id, name, owner_id, avatar_url, avatar_path")
        .single();

      if (error) {
        setStatus(error.message);
        return;
      }

      const updatedServer = data as Server;
      setServer(updatedServer);
      setServerName(updatedServer.name);
      setAvatarFile(null);
      setAvatarPreviewUrl("");
      setStatus("Server settings saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save server.");
    } finally {
      setIsSavingServer(false);
    }
  }

  async function removeServerAvatar() {
    if (!server || !isOwner) return;

    setIsSavingServer(true);
    setStatus("");

    if (server.avatar_path) {
      await supabase.storage.from(SERVER_ASSETS_BUCKET).remove([server.avatar_path]);
    }

    const { data, error } = await supabase
      .from("servers")
      .update({
        avatar_url: null,
        avatar_path: null,
      })
      .eq("id", serverId)
      .eq("owner_id", currentUserId)
      .select("id, name, owner_id, avatar_url, avatar_path")
      .single();

    setIsSavingServer(false);

    if (error) {
      setStatus(error.message);
      return;
    }

    setServer(data as Server);
    setAvatarFile(null);

    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }

    setAvatarPreviewUrl("");
    setStatus("Server avatar removed.");
  }

  function addReactionEmoji(event: React.FormEvent) {
    event.preventDefault();

    const emoji = newReactionEmoji.trim();

    if (!emoji) return;

    if (reactionEmojis.includes(emoji)) {
      setNewReactionEmoji("");
      return;
    }

    setReactionEmojis((current) => [...current, emoji].slice(0, 30));
    setNewReactionEmoji("");
  }

  function removeReactionEmoji(emoji: string) {
    setReactionEmojis((current) => current.filter((item) => item !== emoji));
  }

  async function saveReactionEmojis() {
    if (!isOwner) return;

    setIsSavingReactions(true);
    setStatus("");

    const uniqueReactionEmojis = Array.from(
      new Set(reactionEmojis.map((emoji) => emoji.trim()).filter(Boolean))
    ).slice(0, 30);

    const { error } = await supabase.from("server_settings").upsert({
      server_id: serverId,
      reaction_emojis: uniqueReactionEmojis,
    });

    setIsSavingReactions(false);

    if (error) {
      setStatus(error.message);
      return;
    }

    setReactionEmojis(uniqueReactionEmojis);
    setStatus("Reaction picker saved.");
  }

  async function uploadCustomEmoji(event: React.FormEvent) {
    event.preventDefault();

    if (!isOwner) return;

    const cleanName = cleanEmojiName(newCustomEmojiName);

    if (!cleanName) {
      setStatus("Custom emoji needs a name.");
      return;
    }

    if (!customEmojiFile) {
      setStatus("Choose an image for the custom emoji.");
      return;
    }

    setIsUploadingEmoji(true);
    setStatus("");

    try {
      const safeFileName = cleanFileName(customEmojiFile.name);
      const emojiPath = `${serverId}/emojis/${cleanName}-${crypto.randomUUID()}-${safeFileName}`;

      const { error: uploadError } = await supabase.storage
        .from(SERVER_ASSETS_BUCKET)
        .upload(emojiPath, customEmojiFile, {
          cacheControl: "3600",
          contentType: customEmojiFile.type,
          upsert: false,
        });

      if (uploadError) {
        setStatus(uploadError.message);
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(SERVER_ASSETS_BUCKET).getPublicUrl(emojiPath);

      const { data, error } = await supabase
        .from("server_custom_emojis")
        .insert({
          server_id: serverId,
          name: cleanName,
          image_url: publicUrl,
          image_path: emojiPath,
          created_by: currentUserId,
        })
        .select("id, server_id, name, image_url, image_path, created_at")
        .single();

      if (error) {
        await supabase.storage.from(SERVER_ASSETS_BUCKET).remove([emojiPath]);
        setStatus(error.message);
        return;
      }

      setCustomEmojis((current) => [data as CustomEmoji, ...current]);
      setNewCustomEmojiName("");
      setCustomEmojiFile(null);
      setStatus(`Custom emoji :${cleanName}: added.`);
    } finally {
      setIsUploadingEmoji(false);
    }
  }

  async function deleteCustomEmoji(emoji: CustomEmoji) {
    if (!isOwner) return;

    const confirmed = window.confirm(`Delete :${emoji.name}:?`);

    if (!confirmed) return;

    setStatus("");

    const { error } = await supabase
      .from("server_custom_emojis")
      .delete()
      .eq("id", emoji.id)
      .eq("server_id", serverId);

    if (error) {
      setStatus(error.message);
      return;
    }

    await supabase.storage.from(SERVER_ASSETS_BUCKET).remove([emoji.image_path]);

    setCustomEmojis((current) => current.filter((item) => item.id !== emoji.id));
    setStatus(`Custom emoji :${emoji.name}: deleted.`);
  }

  const avatarSrc = avatarPreviewUrl || server?.avatar_url || "";

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.topbar}>
          <Link href={firstTextChannel ? `/channels/${firstTextChannel.id}` : "/"}>
            ← Back to server
          </Link>
        </div>

        <header className={styles.header}>
          <div className={styles.serverAvatarPreview}>
            {avatarSrc ? (
              <img src={avatarSrc} alt={`${server?.name ?? "Server"} avatar`} />
            ) : (
              <span>{server?.name?.charAt(0).toUpperCase() || "B"}</span>
            )}
          </div>

          <div>
            <h1>{server?.name ?? "Server settings"}</h1>
            <p>Server avatar, name, reaction picker, and custom emojis.</p>
          </div>
        </header>

        {!isOwner && status && <p className={styles.status}>{status}</p>}

        {isOwner && (
          <>
            <section className={styles.section}>
              <h2>Server overview</h2>
              <p>Change the server name and avatar shown around Bubbles.</p>

              <form className={styles.form} onSubmit={saveServerOverview}>
                <label>
                  Server name
                  <input
                    value={serverName}
                    onChange={(event) => setServerName(event.target.value)}
                    maxLength={64}
                    placeholder="Server name"
                  />
                </label>

                <label className={styles.uploadBox}>
                  <strong>Server avatar</strong>
                  <span>
                    PNG, JPG, WebP, or GIF. Max {(MAX_AVATAR_SIZE / 1024 / 1024).toFixed(0)}MB.
                  </span>
                  <input
                    type="file"
                    accept={ALLOWED_IMAGE_TYPES.join(",")}
                    onChange={handleAvatarFileChange}
                  />
                </label>

                <div className={styles.buttonRow}>
                  <button
                    className={styles.saveButton}
                    type="submit"
                    disabled={isSavingServer}
                  >
                    {isSavingServer ? "Saving..." : "Save overview"}
                  </button>

                  {server?.avatar_url && (
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      onClick={removeServerAvatar}
                      disabled={isSavingServer}
                    >
                      Remove avatar
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className={styles.section}>
              <h2>Reaction picker</h2>
              <p>These are the quick reactions shown in the message reaction picker.</p>

              <div className={styles.emojiGrid}>
                {reactionEmojis.map((emoji) => (
                  <div className={styles.emojiItem} key={emoji}>
                    <span>{emoji}</span>
                    <button type="button" onClick={() => removeReactionEmoji(emoji)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <form className={styles.addEmojiForm} onSubmit={addReactionEmoji}>
                <input
                  value={newReactionEmoji}
                  onChange={(event) => setNewReactionEmoji(event.target.value)}
                  placeholder="Add emoji, e.g. 🫧"
                  maxLength={16}
                />
                <button type="submit">Add</button>
              </form>

              <button
                className={styles.saveButton}
                type="button"
                onClick={saveReactionEmojis}
                disabled={isSavingReactions}
              >
                {isSavingReactions ? "Saving..." : "Save reaction picker"}
              </button>
            </section>

            <section className={styles.section}>
              <h2>Custom emojis</h2>
              <p>Upload server-specific emoji images for future custom reactions and chat UI.</p>

              <form className={styles.customEmojiForm} onSubmit={uploadCustomEmoji}>
                <input
                  value={newCustomEmojiName}
                  onChange={(event) => setNewCustomEmojiName(event.target.value)}
                  placeholder="emoji-name"
                  maxLength={32}
                />

                <label className={styles.fileButton}>
                  {customEmojiFile ? customEmojiFile.name : "Choose image"}
                  <input
                    type="file"
                    accept={ALLOWED_IMAGE_TYPES.join(",")}
                    onChange={handleCustomEmojiFileChange}
                  />
                </label>

                <button type="submit" disabled={isUploadingEmoji}>
                  {isUploadingEmoji ? "Uploading..." : "Upload"}
                </button>
              </form>

              <div className={styles.customEmojiGrid}>
                {customEmojis.map((emoji) => (
                  <article className={styles.customEmojiItem} key={emoji.id}>
                    <img src={emoji.image_url} alt={`:${emoji.name}:`} />
                    <div>
                      <strong>:{emoji.name}:</strong>
                      <button type="button" onClick={() => deleteCustomEmoji(emoji)}>
                        Delete
                      </button>
                    </div>
                  </article>
                ))}

                {customEmojis.length === 0 && (
                  <p className={styles.empty}>No custom emojis yet.</p>
                )}
              </div>
            </section>

            {status && <p className={styles.status}>{status}</p>}
          </>
        )}
      </section>
    </main>
  );
}
