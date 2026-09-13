import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { speakLine, fitShotsToVoice, VOICE_MODELS } from "@/lib/production/voice";
import { requestMusic, pollMusic } from "@/lib/production/music";

export const maxDuration = 300;

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await req.json();
  const db = createServiceClient();

  try {
    switch (body.action) {
      case "speak": {
        const { lineId, model } = body;
        if (!lineId || !(model in VOICE_MODELS)) {
          return NextResponse.json(
            { error: "lineId and a valid model are required." },
            { status: 400 }
          );
        }
        return NextResponse.json(await speakLine(lineId, model, user.id));
      }

      /** Assign a voice to a character. It then reads every line they speak. */
      case "assign-voice": {
        const { refId, voiceId, voiceLabel } = body;
        if (!refId) return NextResponse.json({ error: "refId is required." }, { status: 400 });

        const { error } = await db
          .from("refs")
          .update({ voice_id: voiceId || null, voice_label: voiceLabel || null })
          .eq("id", refId);

        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }

      case "fit": {
        if (!body.episodeId) {
          return NextResponse.json({ error: "episodeId is required." }, { status: 400 });
        }
        return NextResponse.json(await fitShotsToVoice(body.episodeId));
      }

      case "music": {
        const { episodeId, prompt } = body;
        if (!episodeId || !prompt?.trim()) {
          return NextResponse.json(
            { error: "episodeId and a prompt are required." },
            { status: 400 }
          );
        }
        return NextResponse.json(await requestMusic(episodeId, prompt, user.id));
      }

      case "poll-music": {
        if (!body.musicId) {
          return NextResponse.json({ error: "musicId is required." }, { status: 400 });
        }
        return NextResponse.json(await pollMusic(body.musicId));
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
