import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type Channel = {
  id: string;
  server_id: string;
  name: string;
  type: "text" | "voice";
};

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
};

type DailyRoomResponse =
  | {
      id: string;
      name: string;
      url: string;
      privacy: "public" | "private";
      created_at: string;
      config?: Record<string, unknown>;
    }
  | {
      error: string;
      info?: string;
    };

type DailyTokenResponse =
  | {
      token: string;
    }
  | {
      error: string;
      info?: string;
    };

function getBearerToken(request: Request) {
  const authorizationHeader = request.headers.get("authorization");

  if (!authorizationHeader?.startsWith("Bearer ")) {
    return "";
  }

  return authorizationHeader.replace("Bearer ", "").trim();
}

function makeDailyRoomName(channelId: string) {
  return `bubbles_voice_${channelId}`.replace(/[^A-Za-z0-9_-]/g, "_");
}

export async function POST(request: Request) {
  try {
    const { channelId } = (await request.json()) as {
      channelId?: string;
    };

    if (!channelId) {
      return NextResponse.json(
        { error: "Missing channelId." },
        { status: 400 }
      );
    }

    const accessToken = getBearerToken(request);

    if (!accessToken) {
      return NextResponse.json(
        { error: "Missing auth token." },
        { status: 401 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const dailyApiKey = process.env.DAILY_API_KEY;
    const dailyDomain = process.env.DAILY_DOMAIN;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase environment variables are missing." },
        { status: 500 }
      );
    }

    if (!dailyApiKey || !dailyDomain) {
      return NextResponse.json(
        { error: "Daily environment variables are missing." },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: "You need to sign in first." },
        { status: 401 }
      );
    }

    const { data: channel, error: channelError } = await supabase
      .from("channels")
      .select("id, server_id, name, type")
      .eq("id", channelId)
      .single<Channel>();

    if (channelError || !channel) {
      return NextResponse.json(
        { error: channelError?.message ?? "Voice channel not found." },
        { status: 404 }
      );
    }

    if (channel.type !== "voice") {
      return NextResponse.json(
        { error: "This is not a voice channel." },
        { status: 400 }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .eq("id", user.id)
      .maybeSingle<Profile>();

    const displayName =
      profile?.display_name || profile?.username || user.email || "Bubbles user";

    const roomName = makeDailyRoomName(channel.id);

    const roomResponse = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${dailyApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: roomName,
        privacy: "private",
        properties: {
          enable_screenshare: true,
          enable_chat: false,
          enable_people_ui: true,
          enable_network_ui: true,
          start_audio_off: false,
          start_video_off: true,
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
        },
      }),
    });

    const roomData = (await roomResponse.json()) as DailyRoomResponse;

    const roomAlreadyExists =
      !roomResponse.ok &&
      "error" in roomData &&
      roomData.error.toLowerCase().includes("already exists");

    if (!roomResponse.ok && !roomAlreadyExists) {
      return NextResponse.json(
        {
          error:
            "error" in roomData
              ? roomData.error
              : "Could not create Daily room.",
        },
        { status: roomResponse.status }
      );
    }

    const roomUrl =
      "url" in roomData
        ? roomData.url
        : `https://${dailyDomain}.daily.co/${roomName}`;

    const tokenResponse = await fetch(
      "https://api.daily.co/v1/meeting-tokens",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${dailyApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            room_name: roomName,
            user_id: user.id,
            user_name: displayName,
            enable_screenshare: true,
            enable_prejoin_ui: true,
            start_video_off: true,
            start_audio_off: false,
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
          },
        }),
      }
    );

    const tokenData = (await tokenResponse.json()) as DailyTokenResponse;

    if (!tokenResponse.ok || !("token" in tokenData)) {
      return NextResponse.json(
        {
          error:
            "error" in tokenData
              ? tokenData.error
              : "Could not create Daily meeting token.",
        },
        { status: tokenResponse.status }
      );
    }

    return NextResponse.json({
      roomUrl,
      token: tokenData.token,
      roomName,
      channelName: channel.name,
    });
  } catch {
    return NextResponse.json(
      { error: "Unexpected Daily voice room error." },
      { status: 500 }
    );
  }
}