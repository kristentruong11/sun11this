// src/services/kb.js
import { getSupabase } from "@/lib/supabase-client";

/** Get a single KB article by numeric grade & lesson */
export async function getKBByGradeLesson(grade, lesson) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("knowledge_base")
    .select("id, title, grade, lesson, content, published, status, updated_at")
    .eq("grade", Number(grade))
    .eq("lesson", Number(lesson))
    .or("published.eq.true,status.eq.published")
    .maybeSingle();

  if (error) {
    console.error("[KB] fetch error:", error);
    return null;
  }
  return data || null;
}

/** Neighbor suggestions for a given grade (numeric) */
export async function getKBNeighbors(grade, limit = 6) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("knowledge_base")
    .select("id, title, grade, lesson")
    .eq("grade", Number(grade))
    .or("published.eq.true,status.eq.published")
    .order("lesson", { ascending: true })
    .limit(limit);

  if (error) return [];
  return Array.isArray(data) ? data : [];
}
