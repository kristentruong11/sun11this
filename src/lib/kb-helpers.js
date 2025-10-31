// src/lib/kb-helpers.js
export function normalizeVietnamese(str = "") {
  return str
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toIntFromText(x) {
  if (x == null) return NaN;
  if (typeof x === "number") return x;
  const m = String(x).match(/\d+/);
  return m ? parseInt(m[0], 10) : NaN;
}

export function parseGradeLessonFromText(text = "") {
  const t = normalizeVietnamese(text);
  // Try both orders: "bai 3 lop 10" or "lop 10 bai 3"
  let m = t.match(/bai\s*(\d+).*?lop\s*(\d+)/) || t.match(/lop\s*(\d+).*?bai\s*(\d+)/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    // Decide which is grade vs lesson
    if (a >= 1 && a <= 12) return { grade: a, lesson: b };
    if (b >= 1 && b <= 12) return { grade: b, lesson: a };
    return { grade: b, lesson: a }; // fallback
  }
  // Fallback: first two numbers in string
  const nums = [...t.matchAll(/\d+/g)].map(x => parseInt(x[0], 10));
  if (nums.length >= 2) {
    const [n1, n2] = nums;
    if (n2 >= 1 && n2 <= 12) return { grade: n2, lesson: n1 };
    return { grade: n1, lesson: n2 };
  }
  return { grade: NaN, lesson: NaN };
}

export function coerceRowNumbers(row = {}) {
  // Your schema:
  // lesson_number (text), lesson (text)
  // grade_level (bigint), grade (text)
  const lesson_num = !Number.isNaN(row.lesson_number)
    ? Number(row.lesson_number)
    : toIntFromText(row.lesson_number ?? row.lesson);

  const grade_num = typeof row.grade_level === "number"
    ? row.grade_level
    : toIntFromText(row.grade ?? row.grade_level);

  return { ...row, __lesson: lesson_num, __grade: grade_num };
}

export function normalizeKBArray(kbArray = []) {
  return kbArray.map(coerceRowNumbers);
}

export function findKBByGradeLesson(kbArray = [], grade, lesson) {
  const g = toIntFromText(grade);
  const l = toIntFromText(lesson);
  if (Number.isNaN(g) || Number.isNaN(l)) return null;

  // exact on coerced numbers
  return kbArray.find(r => {
    const rr = coerceRowNumbers(r);
    return rr.__grade === g && rr.__lesson === l;
  }) || null;
}

export function findKBInArray(kbArray = [], queryText = "") {
  const q = normalizeVietnamese(queryText);
  return kbArray.filter(r =>
    normalizeVietnamese(r.title || "").includes(q)
  );
}
