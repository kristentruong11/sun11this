// src/pages/Chat.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, Loader2 } from "lucide-react";

// Relative imports (Vercel-friendly)
import { base44 } from "../api/base44Client";
import { invokeLLM } from "../lib/custom-sdk";

import ChatSidebar from "../components/chat/ChatSidebar";
import MessageBubble from "../components/chat/MessageBubble";
import ChatInput from "../components/chat/ChatInput";
import EmptyState from "../components/chat/EmptyState";
import RoleSelector from "../components/chat/RoleSelector";
import RoleSwitcher from "../components/chat/RoleSwitcher";

//
// Utility helpers
//
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

const detectPromptType = (content) => {
  if (!content || typeof content !== "string") return "text";
  const lower = content.toLowerCase();
  if (lower.includes("tạo ảnh") || lower.includes("minh họa")) return "image";
  if (lower.includes("trắc nghiệm") || lower.includes("quiz")) return "quiz";
  if (lower.includes("flashcard")) return "flashcard";
  if (lower.includes("đúng-sai") || lower.includes("dung sai")) return "true_false";
  return "text";
};

// Pull integers “Bài x Lớp y” from free text like “bai 2 lop 12”
const parseUserQuery = (query) => {
  if (!query || typeof query !== "string") return { gradeLevel: null, lessonNumber: null };
  const t = normalizeText(query);
  const g = t.match(/\blop\s*(\d{1,2})\b/);
  const l = t.match(/\bbai\s*(\d{1,3})\b/);
  return {
    gradeLevel: g ? g[1] : null,
    lessonNumber: l ? l[1] : null,
  };
};

// Numeric helpers
const nInt = (v) => {
  if (v == null) return NaN;
  const m = String(v).match(/\d+/);
  return m ? parseInt(m[0], 10) : NaN;
};

// Normalize KB row to numeric compare fields
const withNums = (row = {}) => ({
  ...row,
  __lesson: nInt(row.lesson),
  __grade: nInt(row.grade),
});

// Exact match by numbers
const findByGradeLesson = (kbArr = [], grade, lesson) => {
  const g = nInt(grade);
  const l = nInt(lesson);
  if (Number.isNaN(g) || Number.isNaN(l)) return null;
  return kbArr.find((r) => {
    const x = withNums(r);
    return x.__grade === g && x.__lesson === l;
  }) || null;
};

// Fallback: simple substring title match
const searchByTitle = (kbArr = [], text = "") => {
  const needle = normalizeText(text);
  if (!needle) return [];
  return kbArr.filter((r) => normalizeText(r.title || "").includes(needle));
};

// Safely parse TEXT → JSON array
const safeParseJSON = (maybeJSON) => {
  if (!maybeJSON || typeof maybeJSON !== "string") return null;
  const s = maybeJSON.trim();
  if (!s.startsWith("[") && !s.startsWith("{")) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

export default function Chat() {
  const [isLoading, setIsLoading] = useState(false);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentLessonContext, setCurrentLessonContext] = useState(null); // {grade, lesson, title}
  const [isSyncing, setIsSyncing] = useState(false);

  const queryClient = useQueryClient();
  const messagesEndRef = useRef(null);
  const refetchTimeoutRef = useRef(null);

  //
  // Role persistence
  //
  useEffect(() => {
    const savedRole = localStorage.getItem("userRole");
    if (savedRole === "student" || savedRole === "teacher") {
      setUserRole(savedRole);
    } else {
      setShowRoleSelector(true);
    }
  }, []);

  //
  // Reload lesson context when switching chat
  //
  useEffect(() => {
    if (!currentChatId) {
      setCurrentLessonContext(null);
      return;
    }
    const raw = localStorage.getItem(`lesson_context_${currentChatId}`);
    if (!raw) {
      setCurrentLessonContext(null);
      return;
    }
    try {
      setCurrentLessonContext(JSON.parse(raw));
    } catch {
      setCurrentLessonContext(null);
    }
  }, [currentChatId]);

  //
  // Queries
  //
  const { data: chatHistories = [] } = useQuery({
    queryKey: ["chatHistories"],
    queryFn: async () => {
      try {
        return await base44.entities.ChatHistory.list("-created_at");
      } catch {
        return [];
      }
    },
    initialData: [],
    staleTime: 60_000,
  });

  const { data: serverMessages = [], isFetching } = useQuery({
    queryKey: ["messages", currentChatId],
    enabled: !!currentChatId,
    queryFn: async () => {
      if (!currentChatId) return [];
      try {
        const msgs = await base44.entities.Message.list("timestamp", 100);
        return (msgs || []).filter((m) => m.chat_id === currentChatId);
      } catch {
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

  const messages = useMemo(() => {
    if (!currentChatId) return [];
    const local = queryClient.getQueryData(["messages", currentChatId]) || [];
    if (serverMessages.length < local.length && local.length > 0) {
      setIsSyncing(true);
      if (refetchTimeoutRef.current) clearTimeout(refetchTimeoutRef.current);
      refetchTimeoutRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["messages", currentChatId] });
      }, 2000);
      return local;
    }
    const map = new Map();
    [...local, ...serverMessages].forEach((m) => map.set(m.id, m));
    const merged = Array.from(map.values()).sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );
    if (isSyncing && serverMessages.length >= local.length) setIsSyncing(false);
    return merged;
  }, [serverMessages, currentChatId, queryClient, isSyncing]);

  useEffect(() => {
    return () => {
      if (refetchTimeoutRef.current) clearTimeout(refetchTimeoutRef.current);
    };
  }, []);

  // Prefetch entire KB (small enough for client; if large, convert to paged or RPC)
  const { data: knowledgeBase = [] } = useQuery({
    queryKey: ["knowledgeBase"],
    queryFn: async () => {
      try {
        const kb = await base44.entities.KnowledgeBase.list();
        return kb || [];
      } catch {
        return [];
      }
    },
    initialData: [],
    staleTime: 300_000,
  });

  //
  // Mutations
  //
  const createChatMutation = useMutation({
    mutationFn: (data) => base44.entities.ChatHistory.create(data),
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
      const prev = queryClient.getQueryData(["messages", newMessage.chat_id]) || [];
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
      if (ctx?.prev) queryClient.setQueryData(["messages", vars.chat_id], ctx.prev);
      setIsSyncing(false);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  //
  // Handlers
  //
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

    // Ensure a chat exists
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

      // Try to resolve a lesson context
      const { gradeLevel, lessonNumber } = parseUserQuery(trimmed);
      let effectiveGrade = gradeLevel || currentLessonContext?.grade || null;
      let effectiveLesson = lessonNumber || currentLessonContext?.lesson || null;

      // If the user sent a generic opener, prompt for lesson/grade
      const isGenericAsk = /^gi[aả]i th[íi]ch cho t[ôo]i v[eề]$/i.test(normalizeText(trimmed));
      if (isGenericAsk && (!effectiveGrade || !effectiveLesson)) {
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

      // Locate KB row
      let lessonDoc = null;
      if (effectiveGrade && effectiveLesson) {
        lessonDoc = findByGradeLesson(knowledgeBase, effectiveGrade, effectiveLesson);
      }
      if (!lessonDoc) {
        const byTitle = searchByTitle(knowledgeBase, trimmed);
        if (byTitle.length > 0) {
          lessonDoc = byTitle[0];
          effectiveGrade = nInt(lessonDoc.grade);
          effectiveLesson = nInt(lessonDoc.lesson);
        }
      }

      // If still nothing, stop here
      if (!lessonDoc) {
        await createMessageMutation.mutateAsync({
          chat_id: chatId,
          content: `Không tìm thấy **Bài ${effectiveLesson || "?"} (Lớp ${effectiveGrade || "?"})** trong ngân hàng kiến thức. Cậu thử bài khác nhé!`,
          role: "assistant",
          timestamp: new Date().toISOString(),
          message_type: "text",
        });
        setIsLoading(false);
        return;
      }

      // Persist lesson context (drives task chips)
      const ctx = {
        lesson: String(nInt(lessonDoc.lesson)),
        grade: String(nInt(lessonDoc.grade)),
        title: lessonDoc.title,
        lesson_number: lessonDoc.lesson,  // for compatibility
        grade_level: lessonDoc.grade,
      };
      setCurrentLessonContext(ctx);
      localStorage.setItem(`lesson_context_${chatId}`, JSON.stringify(ctx));

      // Post a KB anchor message so chips appear (role=kb)
      await createMessageMutation.mutateAsync({
        chat_id: chatId,
        content: lessonDoc.content || `Nội dung bài học: ${lessonDoc.title || ""}`,
        role: "kb",
        timestamp: new Date().toISOString(),
        message_type: "kb",
        lessonContext: { grade: ctx.grade, lesson: ctx.lesson, title: ctx.title },
      });

      // Quick path: True/False
      if (messageType === "true_false") {
        // pull all TF from rows that match exact lesson/grade (if duplicates exist)
        const allMatching = knowledgeBase.filter((row) => {
          const x = withNums(row);
          return x.__lesson === nInt(ctx.lesson) && x.__grade === nInt(ctx.grade);
        });

        let tfAll = [];
        for (const row of allMatching) {
          // If column is TEXT containing JSON, parse it
          const parsed = Array.isArray(row.true_false_questions)
            ? row.true_false_questions
            : safeParseJSON(row.true_false_questions);
          if (Array.isArray(parsed)) tfAll = tfAll.concat(parsed);
        }

        if (tfAll.length === 0) {
          await createMessageMutation.mutateAsync({
            chat_id: chatId,
            content: `Xin lỗi, **Bài ${ctx.lesson} (Lớp ${ctx.grade})** chưa có câu đúng-sai trong hệ thống.`,
            role: "assistant",
            timestamp: new Date().toISOString(),
            message_type: "text",
          });
          setIsLoading(false);
          return;
        }

        // simple rotating window of 3
        const key = `tf_index_${chatId}_${ctx.lesson}_${ctx.grade}`;
        let idx = parseInt(localStorage.getItem(key) || "0", 10);
        if (idx >= tfAll.length) idx = 0;
        const take = tfAll.slice(idx, idx + 3);
        const next = idx + take.length;
        localStorage.setItem(key, String(next >= tfAll.length ? 0 : next));

        let body = `Đây là ${take.length} câu đúng-sai từ **Bài ${ctx.lesson} (Lớp ${ctx.grade}): ${ctx.title}** 📝\n\n`;
        body += `*(Đã xem ${Math.min(next, tfAll.length)}/${tfAll.length} câu)*\n\n`;

        take.forEach((q, i) => {
          if (i) body += `\n\n---\n\n`;
          // Support two common shapes:
          // 1) {question_number, options:{a,b,c,d}, answers:{a:true/false,...}}
          // 2) {statement: "...", answer: true/false}
          if (q?.statement != null) {
            body += `**Câu ${idx + i + 1}.** ${q.statement}\n\n**Đáp án:** ${q.answer === true ? "Đúng" : q.answer === false ? "Sai" : "?"}`;
          } else {
            body += `**${q?.question_number || `Câu ${idx + i + 1}`}**\n\n`;
            body += `a) ${q?.options?.a ?? "(...)"}\n\n`;
            body += `b) ${q?.options?.b ?? "(...)"}\n\n`;
            body += `c) ${q?.options?.c ?? "(...)"}\n\n`;
            body += `d) ${q?.options?.d ?? "(...)"}\n\n`;
            body += `**Đáp án:** a) ${q?.answers?.a ?? "?"}, b) ${q?.answers?.b ?? "?"}, c) ${q?.answers?.c ?? "?"}, d) ${q?.answers?.d ?? "?"}`;
          }
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

      // Otherwise, generate an explanation using lessonDoc content
      const systemPrompt = `[MODE: STATIC_CONTENT]
[ROLE: ${userRole}]
[CATEGORY: ${lessonDoc.category || "theory"}]

📚 **Bài học:** Bài ${ctx.lesson} (Lớp ${ctx.grade}) — ${ctx.title}

**Câu hỏi của ${userRole === "teacher" ? "giáo viên" : "học sinh"}:** ${trimmed}

Dựa vào nội dung bài học, giải thích ngắn gọn, rõ ràng, phù hợp học sinh.`;

      const kbContext =
        `Bài ${ctx.lesson} (Lớp ${ctx.grade}) — ${lessonDoc.title}\n` +
        String(lessonDoc.content || "").slice(0, 2000);

      const llm = await invokeLLM({ prompt: systemPrompt, kbContext });

      const assistantText =
        (typeof llm === "string" && llm) ||
        llm?.content ||
        llm?.text ||
        llm?.message ||
        llm?.response ||
        llm?.choices?.[0]?.message?.content ||
        "Xin lỗi, chưa có câu trả lời.";

      await createMessageMutation.mutateAsync({
        chat_id: chatId,
        content: assistantText.trim(),
        role: "assistant",
        timestamp: new Date().toISOString(),
        message_type: messageType,
      });
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

  //
  // UI
  //
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
    <div className={`h-screen flex overflow-hidden ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
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
