import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Channel = {
  id: string;
  server_id: string;
  name: string;
  type: "text" | "voice" | null;
};

const DAILY_API_BASE_URL = "https://api.daily.co/v1";

function getEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not set.`);
  }

  return value;
}

function makeDailyRoomName(channelId: string) {
  return `bubbles-${channelId}`
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 96);
}

async function dailyRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<{ data: T | null; error: string | null; status: number }> {
  const apiKey = getEnv("DAILY_API_KEY");

  const response = await fetch(`${DAILY_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      data?.info ||
      data?.error ||
      data?.message ||
      `Daily request failed with status ${response.status}.`;

    return {
      data: null,
      error: message,
      status: response.status,
    };
  }

  return {
    data: data as T,
    error: null,
    status: response.status,
  };
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return NextResponse.json({ error: "Missing Supabase session." }, { status: 401 });
    }

    const body = (await request.json()) as {
      channelId?: string;
    };

    if (!body.channelId) {
      return NextResponse.json({ error: "Missing channelId." }, { status: 400 });
    }

    const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseAnonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "Invalid Supabase session." }, { status: 401 });
    }

    const { data: channelData, error: channelError } = await supabase
      .from("channels")
      .select("id, server_id, name, type")
      .eq("id", body.channelId)
      .single();

    if (channelError || !channelData) {
      return NextResponse.json(
        { error: channelError?.message ?? "Voice channel not found." },
        { status: 404 }
      );
    }

    const channel = channelData as Channel;

    if (channel.type !== "voice") {
      return NextResponse.json(
        { error: "This is not a voice channel." },
        { status: 400 }
      );
    }

    const { data: membership, error: membershipError } = await supabase
      .from("server_members")
      .select("server_id")
      .eq("server_id", channel.server_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }

    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this server." },
        { status: 403 }
      );
    }

    const roomName = makeDailyRoomName(channel.id);
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const roomExpiresAt = nowInSeconds + 60 * 60 * 24;
    const tokenExpiresAt = nowInSeconds + 60 * 60 * 12;

    type DailyRoom = {
      name: string;
      url: string;
    };

    let room: DailyRoom | null = null;

    const createRoom = await dailyRequest<DailyRoom>("/rooms", {
      method: "POST",
      body: JSON.stringify({
        name: roomName,
        privacy: "private",
        properties: {
          exp: roomExpiresAt,
          eject_at_room_exp: true,
          enable_screenshare: true,
          start_video_off: true,
          start_audio_off: false,
          enable_people_ui: true,
        },
      }),
    });

    if (createRoom.data) {
      room = createRoom.data;
    } else {
      const existingRoom = await dailyRequest<DailyRoom>(
        `/rooms/${encodeURIComponent(roomName)}`,
        {
          method: "GET",
        }
      );

      if (existingRoom.data) {
        room = existingRoom.data;
      } else {
        return NextResponse.json(
          {
            error:
              createRoom.error ||
              existingRoom.error ||
              "Could not create or load Daily room.",
          },
          { status: createRoom.status || existingRoom.status || 500 }
        );
      }
    }

    type DailyMeetingToken = {
      token: string;
    };

    const meetingToken = await dailyRequest<DailyMeetingToken>("/meeting-tokens", {
      method: "POST",
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          user_id: user.id.slice(0, 36),
          user_name: user.email ?? "Bubbles user",
          is_owner: false,
          enable_screenshare: true,
          start_video_off: true,
          start_audio_off: false,
          exp: tokenExpiresAt,
        },
      }),
    });

    if (!meetingToken.data?.token) {
      return NextResponse.json(
        { error: meetingToken.error ?? "Could not create Daily meeting token." },
        { status: meetingToken.status || 500 }
      );
    }

    return NextResponse.json({
      roomUrl: room.url,
      token: meetingToken.data.token,
      channelName: channel.name,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create Daily voice room.",
      },
      { status: 500 }
    );
  }
}
