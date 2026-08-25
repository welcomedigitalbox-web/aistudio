import { createClient } from "@/lib/supabase/server";

export interface Ref {
  id: string;
  kind: "character" | "location" | "prop" | "style";
  name: string;
  description: string | null;
  chosen_image_id: string | null;
  voice_provider: string | null;
  voice_id: string | null;
}

/**
 * Build the context block every agent gets for an episode.
 *
 * The bible and the ref list are series-level and identical across episodes --
 * that is deliberate. An agent writing episode 8 sees the same character
 * definitions the episode 1 agent saw, so the show does not drift.
 *
 * Previous episode premises are included as one line each, not in full: enough
 * for continuity, cheap enough to keep including as the season grows.
 */
export async function buildSeriesContext(episodeId: string) {
  const supabase = createClient();

  const { data: episode } = await supabase
    .from("episodes")
    .select("id, n, title, premise, series_id, series(title, premise, bible, target_minutes, language)")
    .eq("id", episodeId)
    .single();

  if (!episode) throw new Error("Episode not found.");

  const series = episode.series as any;

  const [{ data: refs }, { data: earlier }] = await Promise.all([
    supabase
      .from("refs")
      .select("kind, name, description")
      .eq("series_id", episode.series_id)
      .order("kind"),
    supabase
      .from("episodes")
      .select("n, title, premise")
      .eq("series_id", episode.series_id)
      .lt("n", episode.n)
      .order("n"),
  ]);

  const byKind = (kind: string) =>
    (refs ?? [])
      .filter((r) => r.kind === kind)
      .map((r) => `- ${r.name}: ${r.description ?? ""}`)
      .join("\n");

  return [
    `# Series: ${series.title}`,
    series.premise && `Premise: ${series.premise}`,
    series.bible && `\n## Show bible\n${series.bible}`,
    `\nTarget runtime: ${series.target_minutes} minutes. Language: ${series.language}.`,
    byKind("character") && `\n## Characters\n${byKind("character")}`,
    byKind("location") && `\n## Locations\n${byKind("location")}`,
    byKind("style") && `\n## Visual style\n${byKind("style")}`,
    (earlier ?? []).length > 0 &&
      `\n## Earlier episodes\n${(earlier ?? [])
        .map((e) => `${e.n}. ${e.title} — ${e.premise ?? ""}`)
        .join("\n")}`,
    `\n## This episode\n${episode.n}. ${episode.title}\n${episode.premise ?? ""}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * A character is only usable as a video reference once it has a chosen image.
 * Surfacing this early stops someone from starting production on a series
 * where half the cast has no face yet.
 */
export function refsMissingImages(refs: Ref[]) {
  return refs.filter((r) => r.kind !== "style" && !r.chosen_image_id);
}
