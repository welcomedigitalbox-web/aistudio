/**
 * The pipeline, in order. Each step names what a person does next; the
 * database views (series_stage, episode_stage) decide which one is current.
 */

export const SERIES_STEPS = [
  { id: "write_bible",     label: "Write the bible",       where: "series" },
  { id: "approve_bible",   label: "Approve the bible",     where: "series" },
  { id: "add_source",      label: "Add the novel",         where: "series" },
  { id: "add_characters",  label: "Define characters",     where: "series" },
  { id: "generate_refs",   label: "Generate reference art", where: "series" },
  { id: "approve_refs",    label: "Approve the cast",      where: "series" },
  { id: "add_episode",     label: "Add episode 1",         where: "series" },
  { id: "ready",           label: "Ready for episodes",    where: "series" },
] as const;

export const EPISODE_STEPS = [
  { id: "write_script",       label: "Write the script" },
  { id: "approve_script",     label: "Approve the script" },
  { id: "plan_scenes",        label: "Plan the scenes" },
  { id: "approve_plan",       label: "Approve the plan" },
  { id: "build_shots",        label: "Build the shot list" },
  { id: "approve_shots",      label: "Approve the shots" },
  { id: "generate_keyframes", label: "Generate keyframes" },
  { id: "generate_clips",     label: "Generate clips" },
  { id: "done",               label: "Cut" },
] as const;

export type SeriesStep = (typeof SERIES_STEPS)[number]["id"];
export type EpisodeStep = (typeof EPISODE_STEPS)[number]["id"];

export function seriesStepIndex(id: string) {
  return SERIES_STEPS.findIndex((s) => s.id === id);
}
export function episodeStepIndex(id: string) {
  return EPISODE_STEPS.findIndex((s) => s.id === id);
}

/** Render styles. Fixed per series -- changing it mid-show gives you two shows. */
export const RENDER_STYLES = [
  {
    id: "2d_anime",
    label: "2D anime",
    fragment:
      "2D anime, cel-shaded, clean line art, hand-painted backgrounds, flat colour with soft gradient shading",
  },
  {
    id: "2d_painterly",
    label: "2D painterly",
    fragment:
      "hand-painted 2D animation, visible brushwork, watercolour texture, soft edges, storybook illustration",
  },
  {
    id: "3d_stylised",
    label: "3D stylised",
    fragment:
      "stylised 3D animation, soft subsurface shading, rounded forms, cinematic depth of field, Pixar-adjacent lighting",
  },
  {
    id: "3d_realistic",
    label: "3D realistic",
    fragment:
      "photorealistic 3D render, physically based materials, cinematic lighting, shallow depth of field",
  },
] as const;

export function styleFragment(id: string) {
  return RENDER_STYLES.find((s) => s.id === id)?.fragment ?? RENDER_STYLES[0].fragment;
}
