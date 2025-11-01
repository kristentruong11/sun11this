// src/components/chat/MessageBubble.jsx
import React from "react";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";

/**
 * MessageBubble
 * - Renders user/assistant/kb messages
 * - For KB messages, shows task chips that auto-embed (Bài X, Lớp Y) in the prompt if lessonContext exists
 */
export default function MessageBubble({
  message,
  userRole = "student",
  isDarkMode = false,
  onQuickSelect,
}) {
  const role = message?.role || "assistant";
  const isUser = role === "user";
  const isKB = role === "kb";

  const lc = message?.lessonContext || null; // { grade, lesson, title }

  const wrapperClass = `max-w-4xl ${isUser ? "ml-auto" : ""}`;
  const bubbleClass = [
    "rounded-2xl px-4 py-3 shadow-sm border",
    isUser
      ? isDarkMode
        ? "bg-indigo-600 text-white border-transparent"
        : "bg-blue-600 text-white border-transparent"
      : isKB
      ? isDarkMode
        ? "bg-emerald-900/20 text-emerald-100 border-emerald-700"
        : "bg-emerald-50 text-emerald-800 border-emerald-200"
      : isDarkMode
      ? "bg-gray-800 text-gray-100 border-gray-700"
      : "bg-white text-gray-800 border-gray-200",
  ].join(" ");

  const titleLine = isKB ? (
    <div
      className={`text-sm font-semibold mb-1 ${
        isDarkMode ? "text-emerald-200" : "text-emerald-700"
      }`}
    >
      {lc?.title || "Nội dung bài học"}
      {lc?.lesson && lc?.grade ? ` (Bài ${lc.lesson} - Lớp ${lc.grade})` : ""}
    </div>
  ) : null;

  const handleTaskClick = (basePrompt) => {
    if (!onQuickSelect) return;
    const withContext =
      lc?.lesson && lc?.grade
        ? `${basePrompt} về Bài ${lc.lesson} Lớp ${lc.grade}`
        : basePrompt;
    onQuickSelect(withContext);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={wrapperClass}
    >
      <div className={bubbleClass}>
        {titleLine}

        <div className="prose prose-sm max-w-none">
          <ReactMarkdown>{String(message?.content ?? "")}</ReactMarkdown>
        </div>

        {isKB && (
          <div className="mt-3 flex flex-wrap gap-2">
            <TaskChip
              label="Tạo 5 câu trắc nghiệm"
              onClick={() => handleTaskClick("Tạo 5 câu trắc nghiệm")}
              isDarkMode={isDarkMode}
            />
            <TaskChip
              label="Tạo 3 câu đúng-sai"
              onClick={() => handleTaskClick("Tạo 3 câu đúng-sai")}
              isDarkMode={isDarkMode}
            />
            <TaskChip
              label="Tạo 7 flashcards"
              onClick={() => handleTaskClick("Tạo 7 flashcards")}
              isDarkMode={isDarkMode}
            />
            <TaskChip
              label="Giải thích bài học"
              onClick={() => handleTaskClick("Giải thích bài học")}
              isDarkMode={isDarkMode}
            />
            <TaskChip
              label="Tạo ảnh minh họa"
              onClick={() => handleTaskClick("Tạo ảnh minh họa")}
              isDarkMode={isDarkMode}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

function TaskChip({ label, onClick, isDarkMode }) {
  const cls = [
    "px-3 py-1.5 rounded-full border text-xs transition-colors",
    isDarkMode
      ? "border-gray-600 text-gray-100 hover:bg-gray-700"
      : "border-gray-200 text-gray-700 hover:bg-gray-100",
  ].join(" ");

  return (
    <button type="button" onClick={onClick} className={cls} aria-label={label}>
      {label}
    </button>
  );
}
