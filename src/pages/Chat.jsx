// src/pages/Chat.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, Loader2 } from "lucide-react";

// ✅ Use relative imports for Vercel compatibility
import { base44 } from "../api/base44Client";
import { invokeLLM } from "../lib/custom-sdk";

import ChatSidebar from "../components/chat/ChatSidebar";
import MessageBubble from "../components/chat/MessageBubble";
import ChatInput from "../components/chat/ChatInput";
import EmptyState from "../components/chat/EmptyState";
import RoleSelector from "../components/chat/RoleSelector";
import RoleSwitcher from "../components/chat/RoleSwitcher";

import {
  findKBByGradeLesson,
  findKBInArray,
} from "../lib/kb-helpers";

/* ----------------------------- Small utilities ----------------------------- */

const detectPromptType = (content) => {
  if (!content || typeof content !== "string") return "text";
  const lower = content.toLowerCase();
  if (lower.includes("tạo ảnh") || lower.includes("minh họa")) return "image";
  if (lower.includes("trắc nghiệm") || lower.includes("quiz")) return "quiz";
  if (lower.includes("flashcard")) return "flashcard";
  if (lower.includes("đúng-sai") || lower.includes("dung sai")) return "true_false";
  return "text";
};

const normalizeText = (s) => {
  if (!s || typeof s !== "string") return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const parseUserQuery = (query) => {
  if (!query || typeof query !== "string")
    return { gradeLevel: null, lessonNumber: null };

  const normalized = normalizeText(query);
  let gradeLevel = null;
  let lessonNumber = null;

  // lớp
  const g = normalized.match(/\blop\s*(10|11|12|muoi|muoi mot|muoi hai)\b/);
  if (g) {
    const t = g[1];
    gradeLevel =
      t === "muoi" ? "10" : t === "muoi mot" ? "11" : t === "muoi hai" ? "12" : t;
  }

  // bài
  const l =
    normalized.match(/\bbai\s*:\s*(\d+)\b/) ||
    normalized.match(/\bbai\s+(\d+)\b/);
  if (l) lessonNumber = l[1];

  return { gradeLevel, lessonNumber };
};

/* --------------------------------- Component -------------------------------- */

export default function Chat() {
  const [isLoading, setIsLoading] = useState(false);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentLessonContext, setCurrentLessonContext] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const queryClient = useQueryClient();
  const messagesEndRef = useRef(null);
  const refetchTimeoutRef = useRef(null);

  /* ------------------------------ Role persistence ------------------------------ */
  useEffect(() => {
    const savedRole = localStorage.getItem("userRole");
    if (savedRole) setUserRole(savedRole);
    else setShowRoleSelector(true);
  }, []);

  /* --------------------------- Load lesson context --------------------------- */
  useEffect(() => {
    if (!currentChatId) return setCurrentLessonContext(null);
    const saved = localStorage.getItem(`lesson_context_${currentChatId}`);
    if (!saved) return setCurrentLessonContext(null);
    try {
      setCurrentLessonContext(JSON.parse(saved));
    } catch {
      setCurrentLessonContext(null);
    }
  }, [currentChatId]);

  /* --------------------------------- Queries -------------------------------- */

  // Chats
  const { data: chatHistories = [] } = useQuery({
    queryKey: ["chatHistories"],
    queryFn: async () => {
      try {
        return await base44.entities.ChatHistory.list("-created_at");
      } catch (e) {
        console.error(e);
        return [];
      }
    },
    initialData: [],
    staleTime: 60_000,
  });

  // Messages for active chat
  const { data: serverMessages = [], isFetching } = useQuery({
    queryKey: ["messages", currentChatId],
    enabled: !!currentChatId,
    queryFn: async () => {
      if (!currentChatId) return [];
      try {
        const msgs = await base44.entities.Message.list("timestamp", 100);
        return (msgs || []).filter((m) => m.chat_id === currentChatId);
      } catch (e) {
        console.error("load messages error:", e);
        return queryClient.getQueryData(["messages", currentChatId]) || [];
      }
    },
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 2,
    staleTime: Infinity,
    cacheTime: Infinity,
    placeholderData: (prev) => prev || [],
  });

  // Merge local optimistic + server
  const messages = useMemo(() => {
    if (!currentChatId) return [];
    const localMsgs = queryClient.getQueryData(["messages", currentChatId]) || [];
    if (serverMessages.length < localMsgs.length && localMsgs.length > 0) {
      setIsSyncing(true);
      if (refetchTimeoutRef.current) clearTimeout(refetchTimeoutRef.current);
      refetchTimeoutRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["messages", currentChatId] });
      }, 2000);
      return localMsgs;
    }
    const map = new Map();
    [...localMsgs, ...serverMessages].forEach((m) => map.set(m.id, m));
    const merged = Array.from(map.values()).sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );
    if (isSyncing && serverMessages.length >= localMsgs.length) setIsSyncing(false);
    return merged;
  }, [serverMessages, currentChatId, queryClient, isSyncing]);

  useEffect(() => {
    return () => {
      if (refetchTimeoutRef.current) clearTimeout(refetchTimeoutRef.current);
    };
  }, []);

  // KnowledgeBase (prefetch)
  const { data: knowledgeBase = [] } = useQuery({
    queryKey: ["knowledgeBase"],
    queryFn: async () => {
      try {
        const kb = await base44.entities.KnowledgeBase.list();
        return kb || [];
      } catch (e) {
        console.error(e);
        return [];
      }
    },
    initialData: [],
    staleTime: 300_000,
  });

  /* -------------------------------- Mutations -------------------------------- */

  const createChatMutation = useMutation({
    mutationFn: (data) => base44.entities.ChatHistory.create(data),
    onSuccess: () => queryClient.invalidateQueries(["chatHistories"]),
  });

  const updateChatMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ChatHistory.update(id, data),
    onSuccess: () => queryClient.invalidateQueries(["chatHistories"]),
  });

  const deleteChatMutation = useMutation({
    mutationFn: (id) => base44.entities.ChatHistory.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(["chatHistories"]);
      queryClient.invalidateQueries(["messages"]);
    },
  });

  const createMessageMutation = useMutation({
    mutationFn: (data) => base44.entities.Message.create(data),
    onMutate: async (newMessage) => {
      await queryClient.cancelQueries({ queryKey: ["messages", newMessage.chat_id] });
      const prev =
        queryClient.getQueryData(["messages", newMessage.chat_id]) || [];
      const temp = { ...newMessage, id: `temp_${Date.now()}` };
      queryClient.setQueryData(["messages", newMessage.chat_id], (old = []) =>
        [...old, temp].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      );
      return { prev, tempId: temp.id };
    },
    onSuccess: (saved, vars, ctx) => {
      queryClient.setQueryData(["messages", vars.chat_id], (old = []) => {
        const withoutTemp = old.filter((m) => m.id !== ctx.tempId);
        if (withoutTemp.some((m) => m.id === saved.id)) return withoutTemp;
        return [...withoutTemp, saved].sort(
          (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        );
      });
      setIsSyncing(false);
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.prev)
        queryClient.setQueryData(["messages", vars.chat_id], ctx.prev);
      setIsSyncing(false);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* --------------------------------- Handlers -------------------------------- */

  const handleRoleSelect = (role) => {
    if (role !== "student" && role !== "teacher") return;
    setUserRole(role);
    setShowRoleSelector(false);
    localStorage.setItem("userRole", role);
  };

  const handleRoleSwitch = (role) => {
    if (role !== "student" && role !== "teacher") return;
    setUserRole(role);
    localStorage.setItem("userRole", role);
  };

  const handleNewChat = async () => {
    try {
      const row = await createChatMutation.mutateAsync({
        title: "Cuộc trò chuyện mới",
        created_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      });
      if (row?.id) {
        setCurrentChatId(row.id);
        setCurrentLessonContext(null);
        localStorage.removeItem(`lesson_context_${row.id}`);
      }
    } catch (e) {
      console.error("create chat error:", e);
    }
  };

  const handleSelectChat = (id) => setCurrentChatId(id || null);

  const handleDeleteChat = async (id) => {
    if (!id) return;
    try {
      await deleteChatMutation.mutateAsync(id);
      if (currentChatId === id) {
        setCurrentChatId(null);
        setCurrentLessonContext(null);
      }
      localStorage.removeItem(`lesson_context_${id}`);
    } catch (e) {
      console.error("delete chat error:", e);
    }
  };

  const handleSendMessage = async (content) => {
    if (!content || typeof content !== "string" || !content.trim()) return;

    const trimmed = content.trim();
    const messageType = detectPromptType(trimmed);

    // Ensure chat exists
    let chatId = currentChatId;
    const ensureChat = async (title) => {
      if (chatId) return chatId;
      const row = await createChatMutation.mutateAsync({
        title,
        created_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      });
      chatId = row.id;
      setCurrentChatId(chatId);
      return chatId;
    };

    setIsLoading(true);
    try {
      await ensureChat(trimmed.slice(0, 50));

      // Save user message
      await createMessageMutation.mutateAsync({
        chat_id: chatId,
        content: trimmed,
        role: "user",
        timestamp: new Date().toISOString(),
        message_type: messageType,
      });

      // Parse lesson
      const { gradeLevel, lessonNumber } = parseUserQuery(trimmed);

      // Figure effective context
      let effectiveGrade = gradeLevel || currentLessonContext?.grade;
      let effectiveLesson = lessonNumber || currentLessonContext?.lesson;

      // If generic “Giải thích cho tôi về” without numbers → ask for lesson/grade
      const isGeneric = normalizeText(trimmed).includes("giai thich cho toi ve");
      if (isGeneric && !effectiveGrade && !effectiveLesson) {
        await createMessageMutation.mutateAsync({
          chat_id: chatId,
          content:
            userRole === "teacher"
              ? 'Thầy/Cô muốn **Bài số mấy, Lớp mấy**? Ví dụ: `Bài 2 Lớp 12`.'
              : 'Cậu muốn **Bài số mấy, Lớp mấy**? Ví dụ: `Bài 2 Lớp 12`.',
          role: "assistant",
          timestamp: new Date().toISOString(),
          message_type: "text",
        });
        setIsLoading(false);
        return;
      }

      // Lookup lesson doc (if we have numbers)
      let lessonDoc = null;
      if (effectiveLesson && effectiveGrade) {
        // 1) Try in-memory
        lessonDoc =
          findKBInArray(knowledgeBase, {
            gradeLevel: String(effectiveGrade),
            lessonNumber: String(effectiveLesson),
          }) ||
          // 2) Fallback to DB
          (await findKBByGradeLesson(
            String(effectiveGrade),
            String(effectiveLesson)
          ));

        // Persist context if found
        if (lessonDoc) {
          const ctx = {
            lesson: String(effectiveLesson),
            grade: String(effectiveGrade),
            title: lessonDoc.title,
            lesson_number: lessonDoc.lesson_number,
            grade_level: lessonDoc.grade_level,
          };
          setCurrentLessonContext(ctx);
          localStorage.setItem(`lesson_context_${chatId}`, JSON.stringify(ctx));
        } else {
          await createMessageMutation.mutateAsync({
            chat_id: chatId,
            content: `Không tìm thấy **Bài ${effectiveLesson} (Lớp ${effectiveGrade})** trong ngân hàng kiến thức. Cậu thử bài khác nhé!`,
            role: "assistant",
            timestamp: new Date().toISOString(),
            message_type: "text",
          });
          setIsLoading(false);
          return;
        }
      }

      // True/False quick path (requires lesson)
      if (messageType === "true_false") {
        if (!lessonDoc) {
          await createMessageMutation.mutateAsync({
            chat_id: chatId,
            content:
              'Vui lòng chọn bài học trước, ví dụ: "Giải thích cho tôi về Bài 2 Lớp 12".',
            role: "assistant",
            timestamp: new Date().toISOString(),
            message_type: "text",
          });
          setIsLoading(false);
          return;
        }

        const targetLesson = normalizeText(lessonDoc.lesson_number || "");
        const targetGrade = String(lessonDoc.grade_level || "").trim();

        const all = knowledgeBase.filter((doc) => {
          if (!doc) return false;
          const ln = normalizeText(doc.lesson_number || "");
          const gr = String(doc.grade_level || "").trim();
          return ln === targetLesson && gr === targetGrade;
        });

        let tf = [];
        all.forEach((doc) => {
          if (Array.isArray(doc.true_false_questions))
            tf = tf.concat(doc.true_false_questions);
        });

        if (tf.length === 0) {
          await createMessageMutation.mutateAsync({
            chat_id: chatId,
            content: `Xin lỗi, **${lessonDoc.lesson_number}** chưa có câu đúng-sai trong hệ thống.`,
            role: "assistant",
            timestamp: new Date().toISOString(),
            message_type: "text",
          });
          setIsLoading(false);
          return;
        }

        const key = `tf_index_${chatId}_${lessonDoc.lesson_number}_${lessonDoc.grade_level}`;
        let idx = parseInt(localStorage.getItem(key) || "0", 10);
        if (idx >= tf.length) idx = 0;

        const take = tf.slice(idx, idx + 3);
        const next = idx + take.length;
        localStorage.setItem(key, String(next >= tf.length ? 0 : next));

        let body = `Đây là ${take.length} câu đúng-sai từ **${lessonDoc.lesson_number}: ${lessonDoc.title}** 📝\n\n`;
        body += `*(Đã xem ${Math.min(next, tf.length)}/${tf.length} câu)*\n\n`;
        take.forEach((q, i) => {
          if (i) body += `\n\n---\n\n`;
          body += `**${q.question_number || `Câu ${idx + i + 1}`}**\n\n`;
          body += `a) ${q.options?.a || "(...)"}\n\n`;
          body += `b) ${q.options?.b || "(...)"}\n\n`;
          body += `c) ${q.options?.c || "(...)"}\n\n`;
          body += `d) ${q.options?.d || "(...)"}\n\n`;
          body += `**Đáp án:** a) ${q.answers?.a ?? "?"}, b) ${q.answers?.b ?? "?"}, c) ${q.answers?.c ?? "?"}, d) ${q.answers?.d ?? "?"}`;
        });

        await createMessageMutation.mutateAsync({
          chat_id: chatId,
          content: body,
          role: "assistant",
          timestamp: new Date().toISOString(),
          message_type: "true_false",
        });
        setIsLoading(false);
        return;
      }
      // Safety guards in case older code paths still reference these
      const matchedLessons = [];     // <- prevents "matchedLessons is not defined"
      const currentKbText = "";      // <- prevents "currentKbText is not defined"

      // ---------- BEGIN: safe LLM context + call ----------
      const contentMode =
        messageType === "text" && lessonDoc ? "STATIC_CONTENT" : "OPEN_SEARCH";

      const lessonTitleForPrompt = lessonDoc
        ? `${lessonDoc.lesson_number} - ${lessonDoc.title}`
        : currentLessonContext
        ? `${currentLessonContext.lesson_number || currentLessonContext.lesson} - ${currentLessonContext.title || ""}`
        : "Chưa xác định";

      let systemPrompt = "";
      if (contentMode === "STATIC_CONTENT" && lessonDoc) {
        systemPrompt = `[MODE: STATIC_CONTENT]
[ROLE: ${userRole}]
[CATEGORY: ${lessonDoc.category || "theory"}]

📚 **Bài học:** ${lessonTitleForPrompt}

**Câu hỏi của ${userRole === "teacher" ? "giáo viên" : "học sinh"}:** ${trimmed}

Dựa vào nội dung bài học, giải thích ngắn gọn, rõ ràng, phù hợp học sinh.`;
      } else {
        systemPrompt = `[MODE: OPEN_SEARCH]
[ROLE: ${userRole}]
[CATEGORY: open_search]

**Câu hỏi:** ${trimmed}
Trả lời ngắn gọn, rõ, có nguồn khi cần.`;
      }

      const kbContext =
        lessonDoc
          ? `Bài ${lessonDoc.lesson_number} (Lớp ${lessonDoc.grade_level}) — ${lessonDoc.title}
${(lessonDoc.content || "").toString().slice(0, 1200)}`
          : currentLessonContext
          ? `Bài ${currentLessonContext.lesson_number || currentLessonContext.lesson} (Lớp ${currentLessonContext.grade_level || currentLessonContext.grade}) — ${currentLessonContext.title || ""}`
          : "";

      const llm = await invokeLLM({
        prompt: systemPrompt,
        kbContext,
      });

      let assistantText =
        (typeof llm === "string" && llm) ||
        llm?.content ||
        llm?.text ||
        llm?.message ||
        llm?.response ||
        llm?.choices?.[0]?.message?.content ||
        "Xin lỗi, chưa có câu trả lời.";

      if (contentMode === "STATIC_CONTENT") {
        const ln = lessonDoc?.lesson_number?.replace(/^Bài\s+/i, "") || "";
        assistantText = `# Bài ${ln} (Lớp ${lessonDoc?.grade_level}): ${lessonDoc?.title}\n\n${assistantText}`;
      }

      await createMessageMutation.mutateAsync({
        chat_id: chatId,
        content: assistantText.trim(),
        role: "assistant",
        timestamp: new Date().toISOString(),
        message_type: messageType,
      });
      // ---------- END: safe LLM context + call ----------
    } catch (err) {
      console.error("handleSendMessage error:", err);
      if (currentChatId) {
        await createMessageMutation.mutateAsync({
          chat_id: currentChatId,
          content: `Xin lỗi, có lỗi xảy ra: ${err.message}`,
          role: "assistant",
          timestamp: new Date().toISOString(),
          message_type: "text",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  /* ----------------------------------- UI ----------------------------------- */

  if (!userRole || (userRole !== "student" && userRole !== "teacher")) {
    return (
      <RoleSelector
        isOpen={showRoleSelector || !userRole}
        onSelectRole={handleRoleSelect}
        isDarkMode={isDarkMode}
      />
    );
    }

  return (
    <div
      className={`h-screen flex overflow-hidden ${
        isDarkMode ? "bg-gray-900" : "bg-gray-50"
      }`}
    >
      <ChatSidebar
        chatHistories={chatHistories}
        currentChatId={currentChatId}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      <div className="flex-1 flex flex-col h-screen">
        <div
          className={`sticky top-0 z-30 flex items-center justify-between px-4 py-3 border-b ${
            isDarkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"
          }`}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Toggle sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold">Trợ lí môn Lịch Sử</h1>
          </div>
          <RoleSwitcher
            currentRole={userRole}
            onSwitch={handleRoleSwitch}
            isDarkMode={isDarkMode}
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 py-6">
            {isSyncing && messages.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${
                  isDarkMode
                    ? "bg-blue-900/30 text-blue-300 border border-blue-700"
                    : "bg-blue-50 text-blue-700 border border-blue-200"
                }`}
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang đồng bộ với máy chủ...</span>
              </motion.div>
            )}

            {messages.length === 0 && !isFetching ? (
              <EmptyState
                isDarkMode={isDarkMode}
                userRole={userRole}
                onQuickReply={handleSendMessage}
              />
            ) : (
              <AnimatePresence mode="sync">
                {messages.map((m) => (
                  <MessageBubble
                    key={`${m.id}-${m.timestamp}`}
                    message={m}
                    isDarkMode={isDarkMode}
                    onQuickSelect={handleSendMessage}
                    lessonContext={currentLessonContext}
                    userRole={userRole}
                  />
                ))}
              </AnimatePresence>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="sticky bottom-0 z-30">
          <ChatInput
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            isDarkMode={isDarkMode}
            userRole={userRole}
          />
          <div
            className={`text-xs text-center p-2 ${
              isDarkMode ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-500"
            }`}
          >
            &copy; {new Date().getFullYear()} Trợ lí Lịch Sử.
            <br className="sm:hidden" />
            Vui lòng kiểm tra lại thông tin quan trọng.
          </div>
        </div>
      </div>
    </div>
  );
}
