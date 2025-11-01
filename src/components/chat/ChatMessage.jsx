// src/components/chat/MessageBubble.jsx
import React from "react";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";

/**
 * Props:
 * - message: { id, role: 'user'|'assistant'|'kb', content: string, timestamp?: string,
 *              lessonContext?: { grade, lesson, title } }
 * - userRole: 'student'|'teacher'
 * - isDarkMode: boolean
 * - onQuickSelect: (text: string) => void
 *
 * IMPORTANT: No scanning of assistant text. Task chips only when role === 'kb'.
 */
export default function MessageBubble({ message, userRole = "student", isDarkMode, onQuickSelect }) {
  const role = message?.role || "assistant";
  const isUser = role === "user";
  const isKB = role === "kb";

  const wrapperClass = `max-w-4xl ${isUser ? "ml-auto" : ""}`;
  const bubbleClass = [
    "rounded-2xl px-4 py-3 shadow-sm",
    isUser ? "bg-blue-600 text-white"
           : isKB  ? "bg-emerald-50"
                   : "bg-gray-50"
  ].join(" ");

  const lc = message?.lessonContext || null;
  const titleLine = isKB ? (
    <div className="text-sm font-semibold mb-1">
      {lc?.title || "Nội dung bài học"}
      {(lc?.grade && lc?.lesson) ? ` (Bài ${lc.lesson} - Lớp ${lc.grade})` : ""}
    </div>
  ) : null;

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={wrapperClass}>
      <div className={bubbleClass}>
        {titleLine}
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown>{String(message?.content ?? "")}</ReactMarkdown>
        </div>

        {isKB && (
          <div className="mt-3 flex flex-wrap gap-2">
            <TaskChip label="Tạo 5 câu trắc nghiệm" onClick={() => onQuickSelect?.("Tạo 5 câu trắc nghiệm")} />
            <TaskChip label="Tạo 3 câu đúng-sai" onClick={() => onQuickSelect?.("Tạo 3 câu đúng-sai")} />
            <TaskChip label="Tạo 7 flashcards" onClick={() => onQuickSelect?.("Tạo 7 flashcards")} />
            <TaskChip label="Giải thích bài học" onClick={() => onQuickSelect?.("Giải thích bài học")} />
            <TaskChip label="Tạo ảnh minh họa" onClick={() => onQuickSelect?.("Tạo ảnh minh họa")} />
          </div>
        )}
      </div>
    </motion.div>
  );
}

function TaskChip({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-full border text-xs hover:bg-gray-100"
    >
      {label}
    </button>
  );
}
