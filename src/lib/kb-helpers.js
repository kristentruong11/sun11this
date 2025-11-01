// src/lib/kb-helpers.js
export const toInt = (v) => {
  if (v === null || v === undefined) return NaN;
  const m = String(v).match(/\d+/);
  if (!m) return NaN;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : NaN;
};

/** Primary: match by numeric grade & lesson (supports both new and old field names). */
export function findKBByGradeLesson(list = [], grade, lesson) {
  const g = toInt(grade);
  const l = toInt(lesson);
  if (Number.isNaN(g) || Number.isNaN(l)) return null;

  return (
    list.find((r) => {
      const rg = toInt(r.grade ?? r.grade_level);
      const rl = toInt(r.lesson ?? r.lesson_number);
      return rg === g && rl === l;
    }) || null
  );
}

/** Fallback: fuzzy title contains search. */
export function findKBInArray(list = [], text = "") {
  const q = (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (!q) return [];
  return list.filter((r) => {
    const t = (r.title || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return t.includes(q);
  });
}

/** Optional: parse “bai X lop Y” from free text (you already import similar). */
export function parseGradeLessonFromText(text = "") {
  const s = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // strip accents

  const lg = s.match(/\blop\s*(10|11|12|muoi|muoi mot|muoi hai)\b/);
  const g = lg
    ? lg[1] === "muoi" ? "10" : lg[1] === "muoi mot" ? "11" : lg[1] === "muoi hai" ? "12" : lg[1]
    : null;

  const ll = s.match(/\bbai\s*:?[\s]*(\d+)\b/);
  const l = ll ? ll[1] : null;

  return { gradeLevel: g, lessonNumber: l };
}
