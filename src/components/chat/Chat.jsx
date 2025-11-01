// src/components/chat/Chat.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChatSidebar from "./ChatSidebar";
import ChatInput from "./ChatInput";
import EmptyState from "./EmptyState";
import MessageBubble from "./MessageBubble";
import RoleSelector from "./RoleSelector";
import RoleSwitcher from "./RoleSwitcher";
import ChatFooter from "./ChatFooter";

import { parseGradeLessonFromText } from "@/lib/kb-helpers";
import { getKBByGradeLesson, getKBNeighbors } from "@/services/kb";
import { base44 } from "@/api/base44Client";

export default function Chat() {
  const [messages, setMessages] = useState([]); // {role:'user'|'assistant'|'kb', content, timestamp, message_type?, emotion?}
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [userRole, setUserRole] = useState(null); // 'student' | 'teacher'
  const [isLoading, setIsLoading] = useState(false);

  // Optional: basic chat history list for the sidebar (IDs only for now)
  const [chatHistories, setChatHistories] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const scrollRef = useRef(null);
  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // ---------- helpers ----------
  const nowTs = () => new Date().toISOString();

  const append = useCallback((m) => {
    setMessages((prev) => [...prev, { timestamp: nowTs(), ...m }]);
  }, []);

  const sendAI = useCallback(async ({ messages: history, kbContext = "" }) => {
    // Route through your Base44 client → custom-sdk → /api/chat
    // history: [{role:'user'|'assistant', content: string}, ...]
    const res = await base44.functions.historyAssistant({ messages: history, kbContext });
    return res?.content || "";
  }, []);

  // ---------- main send flow ----------
  const handleSendMessage = useCallback(async (text) => {
    if (!text?.trim()) return;
    const userText = text.trim();

    // 1) render user message
    append({ role: "user", content: userText });

    // 2) try KB first
    const parsed = parseGradeLessonFromText(userText);
    setIsLoading(true);
    try {
      if (parsed?.grade && parsed?.lesson) {
        const kb = await getKBByGradeLesson(parsed.grade, parsed.lesson);
        if (kb) {
          append({
            chat_id: chatId,
            role: "kb",
            content: kb.content || "",
            timestamp: new Date().toISOString(),
            message_type: "kb",
            lessonContext: { grade: kb.grade, lesson: kb.lesson, title: kb.title },
          });
          return;
        }

        // Not found → suggest neighbors and optionally call AI for a general explanation
        const neighbors = await getKBNeighbors(parsed.grade, 6);
        let suggestion = `😕 Chưa tìm thấy dữ liệu cho **Bài ${parsed.lesson} Lớp ${parsed.grade}**.`;
        if (neighbors.length) {
          suggestion += `\n\n📚 Các bài có sẵn:\n`;
          suggestion += neighbors
            .map((r) => `- Bài ${r.lesson} Lớp ${r.grade}: ${r.title || ""}`.trim())
            .join("\n");
          suggestion += `\n\nBạn gõ “Bài số Lớp số” để chọn nhé!`;
        } else {
          suggestion += `\n\n📩 Bạn có thể báo quản trị để thêm bài này.`;
        }

        append({ role: "assistant", content: suggestion });

        // (Optional) LLM fallback: general explanation without KB
        const ai = await sendAI({
          messages: [{ role: "user", content: `Giải thích bài ${parsed.lesson} lớp ${parsed.grade}` }],
        });
        if (ai) append({ role: "assistant", content: ai });
        return;
      }

      // 3) no parse → just call the LLM with whatever the user asked
      const ai = await sendAI({ messages: [{ role: "user", content: userText }] });
      append({ role: "assistant", content: ai || "Mình đang suy nghĩ, bạn gõ cụ thể hơn nhé!" });
    } catch (err) {
      console.error(err);
      append({ role: "assistant", content: "Hệ thống đang bận. Bạn thử lại sau một chút nhé." });
    } finally {
      setIsLoading(false);
    }
  }, [append, sendAI]);

  // quick reply / task actions bubble → just reuse same send flow
  const handleQuickReply = useCallback((prompt) => {
    if (!prompt) return;
    handleSendMessage(prompt);
  }, [handleSendMessage]);

  const handleQuickSelect = useCallback((prompt) => {
    if (!prompt) return;
    handleSendMessage(prompt);
  }, [handleSendMessage]);

  // ---------- Sidebar plumbing (minimal stubs) ----------
  const handleNewChat = useCallback(() => {
    setMessages([]);
    setCurrentChatId(crypto.randomUUID?.() || String(Date.now()));
  }, []);
  const handleSelectChat = useCallback((id) => {
    setCurrentChatId(id);
    // You can load chat by id here (not required for KB flow demo)
  }, []);
  const handleDeleteChat = useCallback((id) => {
    setChatHistories((prev) => prev.filter((c) => c.id !== id));
    if (currentChatId === id) {
      setMessages([]);
      setCurrentChatId(null);
    }
  }, [currentChatId]);

  // ---------- UI ----------
  return (
    <div className={`h-[100dvh] w-full flex`}>
      {/* Sidebar */}
      <ChatSidebar
        chatHistories={chatHistories}
        currentChatId={currentChatId}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode((s) => !s)}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((s) => !s)}
      />

      {/* Main panel */}
      <div className="flex-1 flex flex-col">
        {/* Top bar: role switcher + burger (optional) */}
        <div className="p-3 flex items-center gap-2 border-b">
          {userRole && (
            <RoleSwitcher
              currentRole={userRole}
              onSwitch={setUserRole}
              isDarkMode={isDarkMode}
            />
          )}
          <button
            onClick={() => setSidebarOpen((s) => !s)}
            className="ml-auto px-3 py-2 rounded-lg border"
            aria-label="Toggle sidebar"
          >
            Menu
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4" data-chat-scroll>
          {messages.length === 0 ? (
            <EmptyState
              isDarkMode={isDarkMode}
              userRole={userRole || "student"}
              onQuickReply={handleQuickReply}
            />
          ) : (
            <div className="max-w-4xl mx-auto">
              {messages.map((m, i) => (
                <MessageBubble
                  key={`${m.timestamp}-${i}`}
                  message={m}
                  isDarkMode={isDarkMode}
                  userRole={userRole || "student"}
                  onQuickSelect={handleQuickSelect}
                  lessonContext={m.lessonContext /* forwarded to show correct task bubbles */}
                />
              ))}
              <div ref={scrollRef} />
            </div>
          )}
        </div>

        <ChatInput
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          isDarkMode={isDarkMode}
          userRole={userRole || "student"}
        />
        <ChatFooter isDarkMode={isDarkMode} />
      </div>

      {/* First-time role selection modal */}
      <RoleSelector
        isOpen={!userRole}
        onSelectRole={setUserRole}
        isDarkMode={isDarkMode}
      />
    </div>
  );
}
