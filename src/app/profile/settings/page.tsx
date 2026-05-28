"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ThemeSettings from "@/app/ThemeSettings";
import { createClient } from "@/lib/supabase/client";
import styles from "../profile.module.css";

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_static_url: string | null;
  banner_url: string | null;
  bio: string | null;
  status: string | null;
};

const PROFILE_BUCKET = "profile-media";

function getSafeReturnPath() {
  if (typeof window === "undefined") return "/profile";

  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get("returnTo");

  if (returnTo && returnTo.startsWith("/")) {
    return returnTo;
  }

  return "/profile";
}

export default function ProfileSettingsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState("");
  const [returnPath] = useState(getSafeReturnPath);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [customStatus, setCustomStatus] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarStaticUrl, setAvatarStaticUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");

  const [status, setStatus] = useState("Loading...");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        window.location.href = "/login";
        return;
      }

      setUserId(user.id);

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select(
          "id, username, display_name, avatar_url, avatar_static_url, banner_url, bio, status"
        )
        .eq("id", user.id)
        .maybeSingle<Profile>();

      if (profileError) {
        setStatus(profileError.message);
        return;
      }

      if (profile) {
        setUsername(profile.username);
        setDisplayName(profile.display_name ?? "");
        setAvatarUrl(profile.avatar_url ?? "");
        setAvatarStaticUrl(profile.avatar_static_url ?? profile.avatar_url ?? "");
        setBannerUrl(profile.banner_url ?? "");
        setBio(profile.bio ?? "");
        setCustomStatus(profile.status ?? "");
        setStatus("");
        return;
      }

      const fallbackUsername =
        user.email?.split("@")[0]?.toLowerCase().replace(/[^a-z0-9-_]/g, "") ??
        "user";

      setUsername(fallbackUsername);
      setDisplayName("");
      setAvatarUrl("");
      setAvatarStaticUrl("");
      setBannerUrl("");
      setBio("");
      setCustomStatus("");
      setStatus("Finish setting up your profile.");
    }

    loadProfile();
  }, [supabase]);

  function cleanUsername(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "")
      .slice(0, 24);
  }

  function getFileExtension(file: File) {
    const extension = file.name.split(".").pop()?.toLowerCase();

    if (!extension) {
      if (file.type === "image/png") return "png";
      if (file.type === "image/webp") return "webp";
      if (file.type === "image/gif") return "gif";
      return "jpg";
    }

    return extension;
  }

  async function createStaticAvatarPreview(file: File) {
    const objectUrl = URL.createObjectURL(file);

    try {
      const image = new Image();

      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Could not load image."));
        image.src = objectUrl;
      });

      const maxSize = 512;
      const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));

      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Could not create image preview.");
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => {
            if (result) {
              resolve(result);
            } else {
              reject(new Error("Could not create avatar preview."));
            }
          },
          "image/png",
          0.92
        );
      });

      return blob;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function uploadProfileImage(file: File, type: "avatar" | "banner") {
    if (!userId) {
      setStatus("You need to sign in first.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setStatus("Please upload an image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setStatus("Image must be smaller than 5MB.");
      return;
    }

    if (type === "avatar") {
      setIsUploadingAvatar(true);
    } else {
      setIsUploadingBanner(true);
    }

    setStatus("");

    try {
      const extension = getFileExtension(file);
      const filePath = `${userId}/${type}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(PROFILE_BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: true,
        });

      if (uploadError) {
        setStatus(uploadError.message);
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(PROFILE_BUCKET).getPublicUrl(filePath);

      const publicUrlWithCacheBust = `${publicUrl}?v=${Date.now()}`;

      if (type === "avatar") {
        const staticPreviewBlob = await createStaticAvatarPreview(file);
        const staticPath = `${userId}/avatar-static.png`;

        const { error: staticUploadError } = await supabase.storage
          .from(PROFILE_BUCKET)
          .upload(staticPath, staticPreviewBlob, {
            cacheControl: "3600",
            contentType: "image/png",
            upsert: true,
          });

        if (staticUploadError) {
          setStatus(staticUploadError.message);
          return;
        }

        const {
          data: { publicUrl: staticPublicUrl },
        } = supabase.storage.from(PROFILE_BUCKET).getPublicUrl(staticPath);

        const staticPublicUrlWithCacheBust = `${staticPublicUrl}?v=${Date.now()}`;

        setAvatarUrl(publicUrlWithCacheBust);
        setAvatarStaticUrl(staticPublicUrlWithCacheBust);
      } else {
        setBannerUrl(publicUrlWithCacheBust);
      }

      setStatus("Image uploaded. Save your profile to keep it.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not upload image."
      );
    } finally {
      if (type === "avatar") {
        setIsUploadingAvatar(false);
      } else {
        setIsUploadingBanner(false);
      }
    }
  }

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    await uploadProfileImage(file, "avatar");
    event.target.value = "";
  }

  async function handleBannerChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    await uploadProfileImage(file, "banner");
    event.target.value = "";
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();

    const clean = cleanUsername(username);
    const cleanDisplayName = displayName.trim().slice(0, 40);
    const cleanBio = bio.trim().slice(0, 160);
    const cleanStatus = customStatus.trim().slice(0, 40);

    if (!clean) {
      setStatus("Username cannot be empty.");
      return;
    }

    if (!userId) {
      setStatus("You need to sign in first.");
      return;
    }

    setIsSaving(true);
    setStatus("Saving...");

    const profile: Profile = {
      id: userId,
      username: clean,
      display_name: cleanDisplayName || null,
      avatar_url: avatarUrl || null,
      avatar_static_url: avatarStaticUrl || avatarUrl || null,
      banner_url: bannerUrl || null,
      bio: cleanBio || null,
      status: cleanStatus || null,
    };

    const { error } = await supabase.from("profiles").upsert(profile);

    setIsSaving(false);

    if (error) {
      if (error.message.includes("duplicate key")) {
        setStatus("That username is already taken.");
        return;
      }

      setStatus(error.message);
      return;
    }

    setUsername(clean);
    setStatus("Profile saved.");

    window.location.href = `/profile?returnTo=${encodeURIComponent(
      returnPath
    )}`;
  }

  const previewName = displayName.trim() || username || "Bubbles user";
  const previewUsername = username ? `@${cleanUsername(username)}` : "@user";
  const previewInitial = previewName.charAt(0).toUpperCase() || "?";

  return (
    <main className={styles.page}>
      <section className={styles.settingsShell}>
        <div className={styles.topbar}>
          <Link href={`/profile?returnTo=${encodeURIComponent(returnPath)}`}>
            ← Back to profile
          </Link>

          <Link href={returnPath}>Exit</Link>
        </div>

        <div className={styles.settingsGrid}>
          <section className={styles.settingsCard}>
            <h1>Profile Settings</h1>
            <p>Customize how you appear in Bubbles.</p>

            <ThemeSettings />

            <form className={styles.form} onSubmit={saveProfile}>
              <label>
                Username
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="username"
                />
              </label>

              <label>
                Display name
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Display name"
                />
              </label>

              <label>
                Custom status
                <input
                  value={customStatus}
                  onChange={(event) => setCustomStatus(event.target.value)}
                  placeholder="Feeling cozy"
                />
              </label>

              <label>
                About me
                <textarea
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  placeholder="Write a short bio..."
                  rows={4}
                />
              </label>

              <div className={styles.uploadGrid}>
                <label className={styles.uploadBox}>
                  Avatar
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleAvatarChange}
                  />
                  <span>
                    {isUploadingAvatar ? "Uploading..." : "Choose avatar"}
                  </span>
                </label>

                <label className={styles.uploadBox}>
                  Banner
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleBannerChange}
                  />
                  <span>
                    {isUploadingBanner ? "Uploading..." : "Choose banner"}
                  </span>
                </label>
              </div>

              <button disabled={isSaving}>
                {isSaving ? "Saving..." : "Save profile"}
              </button>
            </form>

            {status && <p className={styles.statusMessage}>{status}</p>}
          </section>

          <section className={styles.previewCard}>
            <h2>Preview</h2>

            <div className={styles.profileCard}>
              <div
                className={styles.banner}
                style={
                  bannerUrl
                    ? { backgroundImage: `url(${bannerUrl})` }
                    : undefined
                }
              />

              <div className={styles.profileContent}>
                <div className={styles.avatarWrap}>
                  {avatarUrl ? (
                    <img
                      className={styles.avatar}
                      src={avatarUrl}
                      alt={`${previewName} avatar`}
                    />
                  ) : (
                    <div className={styles.avatarFallback}>
                      {previewInitial}
                    </div>
                  )}
                </div>

                <div className={styles.profileMain}>
                  <div className={styles.profileHeader}>
                    <div>
                      <h1>{previewName}</h1>
                      <p>{previewUsername}</p>
                    </div>

                    {customStatus.trim() && (
                      <span className={styles.statusPill}>
                        {customStatus.trim()}
                      </span>
                    )}
                  </div>

                  <div className={styles.profileSection}>
                    <h2>About me</h2>
                    <p>
                      {bio.trim() ||
                        "Your bio will show here once you add one."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
