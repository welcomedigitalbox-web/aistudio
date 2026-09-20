import { createClient, createServiceClient } from "@/lib/supabase/server";

export type LabRole = "owner" | "editor" | "reviewer" | "viewer" | null;

/**
 * Who this person is to this lab.
 *
 * The lab API writes with the service-role key, which goes around RLS
 * entirely -- so every route that writes has to ask this first. The policies
 * in the database protect direct reads; this protects the API.
 */
export async function labRole(labId: string, userId: string): Promise<LabRole> {
  const db = createServiceClient();

  const [{ data: profile }, { data: lab }, { data: grant }] = await Promise.all([
    db.from("profiles").select("role").eq("id", userId).single(),
    db.from("lab_projects").select("created_by").eq("id", labId).single(),
    db.from("lab_access").select("access").eq("lab_id", labId).eq("user_id", userId).maybeSingle(),
  ]);

  if (profile?.role === "admin") return "owner";
  if (lab?.created_by === userId) return "owner";
  return (grant?.access as LabRole) ?? null;
}

export const canEdit   = (r: LabRole) => r === "owner" || r === "editor";
export const canReview = (r: LabRole) => r === "owner" || r === "reviewer";
export const canSee    = (r: LabRole) => r !== null;

/** Resolve the lab a chapter belongs to, so callers can pass either one. */
export async function labIdForChapter(chapterId: string): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db.from("lab_chapters").select("lab_id").eq("id", chapterId).single();
  return data?.lab_id ?? null;
}

/** The signed-in user, or null. */
export async function currentUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
