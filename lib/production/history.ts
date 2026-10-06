/**
 * Every still a shot has had, newest first, so a redo never loses one.
 *
 * Stills are stored under a new name each time and nothing pointed back to
 * the old name, so a picture the creator uploaded or liked was gone the
 * moment someone pressed redo. The old key goes on this list instead.
 */
const KEEP = 12;

type Db = { from: (t: string) => any };

export async function rememberKeyframe(db: Db, shotId: string, oldKey: string | null | undefined) {
  if (!oldKey) return;
  const { data, error } = await db.from("shots").select("keyframe_history").eq("id", shotId).maybeSingle();
  if (error) return; // column not added yet: carry on without history
  const list: string[] = (data?.keyframe_history ?? []).filter((k: string) => k !== oldKey);
  await db.from("shots").update({ keyframe_history: [oldKey, ...list].slice(0, KEEP) }).eq("id", shotId);
}
