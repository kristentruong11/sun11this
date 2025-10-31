// src/lib/kb-helpers.js

/**
 * Parse "Bài X Lớp Y" from any text the user typed.
 * Returns { lesson: number|null, grade: number|null }
 */
export function parseGradeLessonFromText(text) {
  if (!text || typeof text !== 'string') return { lesson: null, grade: null }
  // Accept forms like: "bài 2 lớp 12", "Bai 2 Lop 12", "Bài 2 Lớp 12", "Bài 2", "Lớp 10"
  const lower = text.toLowerCase().normalize('NFC')
  const lessonMatch = lower.match(/b[àa]i\s*(\d+)/i)
  const gradeMatch  = lower.match(/l[ớo]p\s*(\d+)/i)
  const lesson = lessonMatch ? Number(lessonMatch[1]) : null
  const grade  = gradeMatch  ? Number(gradeMatch[1])  : null
  return { lesson, grade }
}

/**
 * Find an item in a KB array by grade+lesson.
 * kbArray = [{ grade: 12, lesson: 2, ...}, ...]
 */
export function findKBInArray(kbArray, grade, lesson) {
  if (!Array.isArray(kbArray)) return null
  return kbArray.find(
    (it) =>
      (Number(it?.grade) === Number(grade)) &&
      (Number(it?.lesson) === Number(lesson))
  ) || null
}

/**
 * Convenience: parse grade/lesson from free text, then search in kbArray.
 */
export function findKBByGradeLesson(kbArray, freeText) {
  const { grade, lesson } = parseGradeLessonFromText(freeText)
  if (grade == null || lesson == null) return null
  return findKBInArray(kbArray, grade, lesson)
}
