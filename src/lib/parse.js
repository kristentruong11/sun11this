// src/lib/parse.js
export function parseGradeLessonFromText(txt) {
  if (!txt) return null;
  const s = String(txt).normalize('NFC').toLowerCase();

  // Strict: "bài 3 lớp 12" or "bai 3 lop 12"
  let m = s.match(/b[aàáai]?i?\s*(\d+)\s*l[ơo]́?p?\s*(\d+)/i);
  if (m) return { lesson: Number(m[1]), grade: Number(m[2]) };

  // Lenient: "Bài 3 (Lớp 12)" or variants
  m = s.match(/b[aàáai]?i?\s*(\d+).{0,10}l[ơo]́?p?\s*(\d+)/i);
  if (m) return { lesson: Number(m[1]), grade: Number(m[2]) };

  // "bai 3 lop12"
  m = s.match(/b[aàáai]?i?\s*(\d+)\s*l[ơo]́?p?\s*([0-9]{1,2})/i);
  if (m) return { lesson: Number(m[1]), grade: Number(m[2]) };

  return null;
}
