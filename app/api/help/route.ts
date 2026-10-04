import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-sonnet-4-6";

/**
 * The in-app help desk. It sees what the person sees: the page they are on,
 * the last errors the app raised, and their question. It knows the pipeline
 * and the common failures, so "Forbidden" or "No reference art" gets a fix in
 * the app instead of a trip to a developer.
 */
const GUIDE = `You are the help assistant inside AI Studio, an internal tool a small Myanmar media team uses to turn a story into short live-action or animated AI video episodes. The people asking are creators, not developers.

HOW THE APP WORKS
Series page (Studio → a show):
1. The novel/source: upload a text PDF or write the story. 2. Read it. 3. Bible: tone and rules, drafted by AI, then Approve. 4. Cast: characters, locations, props, style. Each has a description that goes VERBATIM into every image prompt. "Generate set" makes reference art for every angle (characters: front, three-quarter, profile, full body, expression; locations: wide, medium, detail). Nano Banana Pro is the default and locks every angle to the first face. A later phase of the same person (same name before the bracket, e.g. "Nga Tet Pya (Commander Phase)") borrows the earliest phase's face and changes only the clothes. "use" marks one image as CANON — the art every shot of that character will use. "Upload art" adds your own image and makes it canon if none is chosen. 5. Episodes: "Plan the season" splits the source into one episode per story turn (it can make many episodes — don't press it for a single short). "Add episode" makes one by hand.
Series settings that matter: render style (live action / anime / etc.), aspect ratio (16:9 or 9:16), episode length in minutes (default 15 — set 1 for a one-minute teaser).

Episode page, in order, each locked until the one before is approved:
1. Scene plan → Approve. 2. Script: each scene written; Read / Edit / Rewrite / Reopen; then Approve the script. 3. Shots: "Build" turns each scene into shots (visual prompt, motion prompt, length, lines). Each scene has a "Note" box: text there is sent with that scene's next Build/Rebuild — use it to set exact shot count, seconds and dialogue. Rebuild replaces that scene's shots. Then Approve the shot list (it has Reopen). 4. Voice: assign a voice to each speaking character, Record, Fit (stretches shots to fit the spoken line). Stock voices do NOT speak Burmese — clone a voice from a 30–60s recording and use the cloned voice. Do voice before clips. Music: one cue per episode. 5. Casting the models: AI picks a clip model per shot; a few cents. 6. Production: Keyframes first (a still per shot; ~$0.15 on Nano Banana Pro), Approve each one you like, then Clips (image-to-video from the approved keyframe). Kling 3.0 Pro ~$0.84/5s for action; Veo 3.1 ~$1/5s for faces and dialogue. "chain shots" starts each clip from the previous clip's last frame within a scene. "Gateway capacity → Check" tests which video models are up, free.

RULES OF THUMB
- AI image/video models cannot write Burmese text. Title cards and subtitles go in the editor (CapCut / DaVinci), never in a prompt.
- Reference names in shots must match the cast names exactly, character for character, or the shot gets a stranger.
- Never generate clips from a keyframe you have not checked: a bad still is a wasted clip.
- One action per shot; one camera move per shot.

COMMON ERRORS AND WHAT TO DO
- "Sign in first" / 401: the session expired. Refresh the page or log in again.
- "Forbidden" / 403 from a generate button: almost always the fal.ai account — balance used up, or that model needs approval on fal. Check fal.ai → Billing. If "Gateway capacity → Check" says a model is DOWN, pick another model. Flux Dev is licence-blocked and should not be used.
- "No reference art for this shot": the shot names nobody with canon art. Pick canon art for the character ("use"), or the app falls back to text-to-image automatically on reference models.
- "Approve the keyframe first" / "Generate the keyframe first": do the keyframe step for that shot.
- "Unknown model": the page is out of date — refresh.
- "Shots reference art that does not exist: X": rename the cast entry or fix the name in the Note, then Rebuild that scene.
- Shot list far longer than the episode: Reopen the shot list, put exact shot counts and seconds in each scene's Note, Rebuild.
- Buttons for Rebuild / Note missing: the shot list is approved — press Reopen under it.
- "column notifications.title does not exist" or the bell erroring: a database update is missing; an admin must run the latest migration in Supabase (SQL editor).
- 504 / timeout: the AI step took too long; press it again. If it keeps happening on Build, ask for fewer shots in the Note.
- Generation stuck on "running" for many minutes: the provider's callback did not arrive — press the button again; you are only charged when a result comes back.
- A face changes between shots: the character has no canon art, or two phases of one person were made separately. Regenerate the later phase's set.

HOW TO ANSWER
- Reply in the language the person writes in (often Burmese). Short, direct, concrete: which button, on which page, in what order.
- Use the page context and recent errors you are given; quote the exact error you are explaining.
- Be frank about cost before suggesting anything that spends money, and say roughly how much.
- If the fix needs code or database work, say so plainly in one line ("this needs a developer: …") instead of guessing a workaround.
- Do not invent buttons or features that are not described above or visible in the page context.`;

type Msg = { role: "user" | "assistant"; content: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * History. GET with ?thread= returns that conversation; without, it returns
 * the person's recent threads and the newest one's messages, so the panel
 * opens where they left off on any device.
 */
export async function GET(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const thread = new URL(req.url).searchParams.get("thread");

  const { data: recent, error } = await supabase
    .from("help_messages")
    .select("thread_id, role, content, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) return NextResponse.json({ threads: [], messages: [], threadId: null, unavailable: error.message });

  // Collapse to one row per thread: its first question and its latest time.
  const byThread = new Map<string, { threadId: string; title: string; updatedAt: string }>();
  for (const m of [...(recent ?? [])].reverse()) {
    const t = byThread.get(m.thread_id);
    if (!t) byThread.set(m.thread_id, { threadId: m.thread_id, title: m.role === "user" ? m.content.slice(0, 80) : "", updatedAt: m.created_at });
    else {
      t.updatedAt = m.created_at;
      if (!t.title && m.role === "user") t.title = m.content.slice(0, 80);
    }
  }
  const threads = [...byThread.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30);

  const open = thread && UUID.test(thread) ? thread : threads[0]?.threadId ?? null;
  let messages: Msg[] = [];
  if (open) {
    const { data } = await supabase
      .from("help_messages")
      .select("role, content")
      .eq("user_id", user.id)
      .eq("thread_id", open)
      .order("created_at", { ascending: true })
      .limit(200);
    messages = (data ?? []) as Msg[];
  }

  return NextResponse.json({ threads, threadId: open, messages });
}

export async function DELETE(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const thread = new URL(req.url).searchParams.get("thread");
  if (!thread || !UUID.test(thread)) return NextResponse.json({ error: "thread is required." }, { status: 400 });

  const { error } = await supabase.from("help_messages").delete().eq("user_id", user.id).eq("thread_id", thread);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const question = String(body.question ?? "").trim().slice(0, 4000);
  if (!question) return NextResponse.json({ error: "Ask a question." }, { status: 400 });
  const threadId: string = UUID.test(String(body.threadId ?? "")) ? body.threadId : crypto.randomUUID();

  // History comes from the database, so it survives reloads and devices. If
  // the table is not there yet, fall back to what the panel sent.
  let history: Msg[] = [];
  const { data: past, error: pastError } = await supabase
    .from("help_messages")
    .select("role, content")
    .eq("user_id", user.id)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(12);
  if (!pastError) history = ((past ?? []) as Msg[]).reverse();
  else if (Array.isArray(body.messages)) history = (body.messages as Msg[]).slice(-12);

  const ctx = body.context ?? {};
  const errors: string[] = Array.isArray(ctx.errors) ? ctx.errors.slice(-8) : [];
  const path = String(ctx.path ?? "").slice(0, 200);
  const context = [
    `Page: ${path}`,
    errors.length ? `Recent errors raised by the app (newest last):\n${errors.map((e) => `- ${String(e).slice(0, 400)}`).join("\n")}` : "Recent errors: none captured.",
    `What is on the screen (truncated):\n${String(ctx.page ?? "").slice(0, 6000)}`,
  ].join("\n\n");

  // The context rides on the latest question only, so the history stays small.
  const sent: Msg[] = [
    ...history.map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) })),
    { role: "user", content: `<context>\n${context}\n</context>\n\n${question}` },
  ];
  // The API wants the conversation to open on a user turn.
  while (sent.length && sent[0].role !== "user") sent.shift();

  let reply: string;
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: GUIDE,
      messages: sent,
    });
    reply = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim() || "No answer came back. Try again.";
  } catch (e) {
    return NextResponse.json({ error: `The help assistant could not answer: ${(e as Error).message}`, threadId }, { status: 502 });
  }

  const { error: saveError } = await supabase.from("help_messages").insert([
    { user_id: user.id, thread_id: threadId, role: "user", content: question, path },
    { user_id: user.id, thread_id: threadId, role: "assistant", content: reply, path },
  ]);

  return NextResponse.json({ reply, threadId, saved: !saveError });
}
