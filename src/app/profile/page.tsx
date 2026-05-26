"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import styles from "./profile.module.css";

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  status: string | null;
};

export default function ProfilePage() {
  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [returnPath, setReturnPath] = useState("/");
  const [status, setStatus] = useState("Loading...");

  useEffect(() => {
    function getSafeReturnPath() {
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get("returnTo");

      if (returnTo && returnTo.startsWith("/")) {
        return returnTo;
      }

      if (document.referrer) {
        try {
          const referrerUrl = new URL(document.referrer);

          if (referrerUrl.origin === window.location.origin) {
            return `${referrerUrl.pathname}${referrerUrl.search}`;
          }
        } catch {
          return "/";
        }
      }

      return "/";
    }

    setReturnPath(getSafeReturnPath());
  }, []);

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

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, username, display_name, avatar_url, banner_url, bio, status"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        setStatus(error.message);
        return;
      }

      if (!data) {
        window.location.href = `/profile/settings?returnTo=${encodeURIComponent(
          returnPath
        )}`;
        return;
      }

      setProfile(data as Profile);
      setStatus("");
    }

    loadProfile();
  }, [supabase, returnPath]);

  const displayName =
    profile?.display_name || profile?.username || "Bubbles user";

  const username = profile?.username ? `@${profile.username}` : "@user";

  const initial = displayName.charAt(0).toUpperCase() || "?";

  return (
    <main className={styles.page}>
      <section className={styles.profileShell}>
        <div className={styles.topbar}>
          <Link href={returnPath}>← Back</Link>

          <Link
            href={`/profile/settings?returnTo=${encodeURIComponent(
              returnPath
            )}`}
          >
            Edit profile
          </Link>
        </div>

        <section className={styles.profileCard}>
          <div
            className={styles.banner}
            style={
              profile?.banner_url
                ? { backgroundImage: `url(${profile.banner_url})` }
                : undefined
            }
          />

          <div className={styles.profileContent}>
            <div className={styles.avatarWrap}>
              {profile?.avatar_url ? (
                <img
                  className={styles.avatar}
                  src={profile.avatar_url}
                  alt={`${displayName} avatar`}
                />
              ) : (
                <div className={styles.avatarFallback}>{initial}</div>
              )}
            </div>

            <div className={styles.profileMain}>
              <div className={styles.profileHeader}>
                <div>
                  <h1>{displayName}</h1>
                  <p>{username}</p>
                </div>

                {profile?.status && (
                  <span className={styles.statusPill}>{profile.status}</span>
                )}
              </div>

              <div className={styles.profileSection}>
                <h2>About me</h2>
                <p>
                  {profile?.bio?.trim()
                    ? profile.bio
                    : "No bio yet. Add something in profile settings."}
                </p>
              </div>
            </div>
          </div>
        </section>

        {status && <p className={styles.statusMessage}>{status}</p>}
      </section>
    </main>
  );
}