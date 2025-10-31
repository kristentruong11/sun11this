// src/pages/Chat.jsx
import { invokeLLM } from "@/lib/custom-sdk";
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, Loader2 } from 'lucide-react';

import { base44 } from '@/api/base44Client';
import ChatSidebar from '../components/chat/ChatSidebar';
import MessageBubble from '../components/chat/MessageBubble';
import ChatInput from '../components/chat/ChatInput';
import EmptyState from '../components/chat/EmptyState';
import RoleSelector from '../components/chat/RoleSelector';
import RoleSwitcher from '../components/chat/RoleSwitcher';

import { findKBByGradeLesson, findKBInArray, parseGradeLessonFromText } from "../lib/kb-helpers";



// ---------- small helpers ----------
const detectPromptType = (content) => {
  if (!content || typeof content !== 'string') return 'text';
  const lower = content.toLowerCase();
  if (lower.includes('tạo ảnh') || lower.includes('minh họa')) return 'image';
  if (lower.includes('trắc nghiệm') || lower.includes('quiz')) return 'quiz';
  if (lower.includes('flashcard')) return 'flashcard';
  if (lower.includes('đúng-sai') || lower.includes('dung sai')) return 'true_false';
  return 'text';
};

const normalizeText = (s) => {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const parseUserQuery = (query) => {
  if (!query || typeof query !== 'string') return { gradeLevel: null, lessonNumber: null };
  const normalized = normalizeText(query);
  console.log('🔍 Normalized input:', normalized);

  let gradeLevel = null;
  let lessonNumber = null;

  const gradePatterns = [
    /lop\s+(10|11|12|muoi|muoi mot|muoi hai)\b/i,
    /lop\s*:\s*(10|11|12|muoi|muoi mot|muoi hai)\b/i,
  ];
  for (const pattern of gradePatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const gradeText = match[1];
      if (gradeText === 'muoi') gradeLevel = '10';
      else if (gradeText === 'muoi mot') gradeLevel = '11';
      else if (gradeText === 'muoi hai') gradeLevel = '12';
      else gradeLevel = gradeText;
      break;
    }
  }

  const lessonPatterns = [
    /bai\s+(\d+)\b/i,
    /bai\s*:\s*(\d+)\b/i,
    /bai\s+(mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\b/i,
  ];
  for (const pattern of lessonPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const lessonText = match[1];
      const textToNum = {
        mot: '1',
        hai: '2',
        ba: '3',
        bon: '4',
        nam: '5',
        sau: '6',
        bay: '7',
        tam: '8',
        chin: '9',
        muoi: '10',
      };
      lessonNumber = textToNum[lessonText] || lessonText;
      break;
    }
  }

  console.log('✅ Parsed result:', { gradeLevel, lessonNumber });
  return { gradeLevel, lessonNumber };
};

// ---------- component ----------
export default function Chat() {
  const [isLoading, setIsLoading] = useState(false);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentLessonContext, setCurrentLessonContext] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const refetchTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  // load role
  useEffect(() => {
    const savedRole = localStorage.getItem('userRole');
    if (savedRole) setUserRole(savedRole);
    else setShowRoleSelector(true);
  }, []);

  // load lesson context per chat
  useEffect(() => {
    if (currentChatId) {
      const savedContext = localStorage.getItem(`lesson_context_${currentChatId}`);
      if (savedContext) {
        try {
          setCurrentLessonContext(JSON.parse(savedContext));
        } catch (e) {
          console.error('Error loading lesson context:', e);
          setCurrentLessonContext(null);
        }
      } else {
        setCurrentLessonContext(null);
      }
    } else {
      setCurrentLessonContext(null);
    }
  }, [currentChatId]);

  // chat list
  const { data: chatHistories = [] } = useQuery({
    queryKey: ['chatHistories'],
    queryFn: async () => {
      try {
        return await base44.entities.ChatHistory.list('-created_at');
      } catch (error) {
        console.error('Error loading chat histories:', error);
        return [];
      }
    },
    initialData: [],
    staleTime: 60_000,
  });

  // messages
  const { data: serverMessages = [], isFetching } = useQuery({
    queryKey: ['messages', currentChatId],
    queryFn: async () => {
      if (!currentChatId) return [];
      try {
        const msgs = await base44.entities.Message.list('timestamp', 100);
        const filtered = msgs?.filter((m) => m.chat_id === currentChatId) || [];
        return filtered;
      } catch (error) {
        console.error('❌ Error loading messages:', error);
        const existingCache = queryClient.getQueryData(['messages', currentChatId]);
        return existingCache || [];
      }
    },
    enabled: !!currentChatId,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    staleTime: Infinity,
    cacheTime: Infinity,
    placeholderData: (previousData) => previousData || [],
  });

  const messages = useMemo(() => {
    if (!currentChatId) return [];
    const localMessages = queryClient.getQueryData(['messages', currentChatId]) || [];
    const localCount = localMessages.length;
    const serverCount = serverMessages.length;

    console.log(`🔄 Merge: local=${localCount}, server=${serverCount}`);

    if (serverCount < localCount && localCount > 0) {
      console.log(`⚠️ Server behind (${serverCount} < ${localCount})! Keeping local`);
      setIsSyncing(true);
      if (refetchTimeoutRef.current) clearTimeout(refetchTimeoutRef.current);
      refetchTimeoutRef.current = setTimeout(() => {
        console.log('🔄 Retry refetch (server behind)');
        queryClient.invalidateQueries({ queryKey: ['messages', currentChatId] });
      }, 3000);
      return localMessages;
    }

    const merged = new Map();
    localMessages.forEach((msg) => merged.set(msg.id, msg));
    serverMessages.forEach((msg) => merged.set(msg.id, msg));

    const result = Array.from(merged.values()).sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );

    console.log(`✅ Merged: ${result.length} messages`);

    if (isSyncing && serverCount >= localCount) {
      console.log('✅ Server synced');
      setIsSyncing(false);
    }

    return result;
  }, [serverMessages, currentChatId, queryClient, isSyncing]);

  useEffect(() => {
    console.log(`💬 Displaying: ${messages?.length} messages, syncing: ${isSyncing}`);
  }, [messages?.length, isSyncing]);

  useEffect(() => {
    return () => {
      if (refetchTimeoutRef.current) clearTimeout(refetchTimeoutRef.current);
    };
  }, []);

  // knowledge base (prefetch)
  const { data: knowledgeBase = [] } = useQuery({
    queryKey: ['knowledgeBase'],
    queryFn: async () => {
      try {
        const kb = await base44.entities.KnowledgeBase.list();
        console.log('📚 Knowledge base loaded:', kb?.length || 0, 'lessons');
        return kb || [];
      } catch (error) {
        console.error('Error loading knowledge base:', error);
        return [];
      }
    },
    initialData: [],
    staleTime: 300_000,
  });

  // mutations
  const createChatMutation = useMutation({
    mutationFn: (data) => base44.entities.ChatHistory.create(data),
    onSuccess: () => queryClient.invalidateQueries(['chatHistories']),
  });

  const updateChatMutation = useMutation({
    mutationFn: (params) => base44.entities.ChatHistory.update(params.id, params.data),
    onSuccess: () => queryClient.invalidateQueries(['chatHistories']),
  });

  const deleteChatMutation = useMutation({
    mutationFn: (id) => base44.entities.ChatHistory.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['chatHistories']);
      queryClient.invalidateQueries(['messages']);
    },
  });

  const createMessageMutation = useMutation({
    mutationFn: (data) => base44.entities.Message.create(data),
    onMutate: async (newMessage) => {
      await queryClient.cancelQueries({ queryKey: ['messages', newMessage.chat_id] });
      const previousMessages =
        queryClient.getQueryData(['messages', newMessage.chat_id]) || [];

      const tempMessage = { ...newMessage, id: `temp_${Date.now()}` };

      queryClient.setQueryData(['messages', newMessage.chat_id], (old = []) => {
        const updated = [...old, tempMessage].sort(
          (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        );
        console.log(`⚡ Optimistic add: ${updated.length} messages`);
        return updated;
      });

      return { previousMessages, tempId: tempMessage.id };
    },
    onSuccess: (newMessage, variables, context) => {
      console.log('✅ Server confirmed:', newMessage?.id);
      queryClient.setQueryData(['messages', variables.chat_id], (old = []) => {
        const withoutTemp = old.filter((m) => m.id !== context.tempId);
        if (withoutTemp.some((m) => m.id === newMessage.id)) {
          console.log('⚠️ Real message already exists');
          return withoutTemp;
        }
        const updated = [...withoutTemp, newMessage].sort(
          (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        );
        console.log(`✅ Replaced temp with real: ${updated.length} messages`);
        return updated;
      });
      setIsSyncing(false);
    },
    onError: (err, variables, context) => {
      console.error('❌ Message creation failed:', err);
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', variables.chat_id], context.previousMessages);
        console.log('🔄 Rolled back to previous state');
      }
      setIsSyncing(false);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // role handlers
  const handleRoleSelect = (role) => {
    if (role === 'student' || role === 'teacher') {
      setUserRole(role);
      setShowRoleSelector(false);
      localStorage.setItem('userRole', role);
    }
  };

  const handleRoleSwitch = (newRole) => {
    if (newRole === 'student' || newRole === 'teacher') {
      setUserRole(newRole);
      localStorage.setItem('userRole', newRole);
    }
  };

  // chat handlers
  const handleNewChat = async () => {
    try {
      const newChat = await createChatMutation.mutateAsync({
        title: 'Cuộc trò chuyện mới',
        created_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      });
      if (newChat?.id) {
        setCurrentChatId(newChat.id);
        setCurrentLessonContext(null);
        localStorage.removeItem(`lesson_context_${newChat.id}`);
      }
    } catch (error) {
      console.error('Error creating chat:', error);
    }
  };

  const handleSelectChat = (chatId) => {
    if (chatId) setCurrentChatId(chatId);
  };

  const handleDeleteChat = async (chatId) => {
    if (!chatId) return;
    try {
      await deleteChatMutation.mutateAsync(chatId);
      if (currentChatId === chatId) {
        setCurrentChatId(null);
        setCurrentLessonContext(null);
      }
      localStorage.removeItem(`lesson_context_${chatId}`);
    } catch (error) {
      console.error('Error deleting chat:', error);
    }
  };

  // ------------ main send handler ------------
  const handleSendMessage = async (content) => {
    if (!content || typeof content !== 'string' || !content.trim()) return;

    const trimmedContent = content.trim();
    console.log('📨 Sending:', trimmedContent);

    // safety block
    const dangerousPatterns = [
      /cách\s+(giết|tự\s+t[ửử]|làm\s+h[ạa]i|ch[ếế]t|t[ửử]\s+vong)/i,
      /h[ướư]ng\s+d[ẫẫ]n.*(hack|l[ừử]a\s+đảo|phá\s+ho[ạa]i|vi\s+ph[ạa]m)/i,
      /mua\s+(ma\s+túy|ch[ấấ]t\s+c[ấấ]m|vũ\s+khí)/i,
      /(bomb|b[ộộ]m|v[ũũ]\s+khí|ch[ấấ]t\s+nổ)/i,
      /phân\s+biệt\s+(chủng\s+tộc|giới\s+tính|t[ôô]n\s+giáo)/i,
    ];
    const isDangerous = dangerousPatterns.some((p) => p.test(trimmedContent));

    // ensure chat
    let targetChatId = currentChatId;
    const ensureChat = async (title) => {
      if (targetChatId) return targetChatId;
      const newChat = await createChatMutation.mutateAsync({
        title,
        created_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      });
      targetChatId = newChat.id;
      setCurrentChatId(newChat.id);
      return targetChatId;
    };

    if (isDangerous) {
      setIsLoading(true);
      await ensureChat('Yêu cầu không phù hợp');
      await createMessageMutation.mutateAsync({
        chat_id: targetChatId,
        content: trimmedContent,
        role: 'user',
        timestamp: new Date().toISOString(),
        message_type: 'text',
      });
      await createMessageMutation.mutateAsync({
        chat_id: targetChatId,
        content:
          '⚠️ Mình không thể hỗ trợ yêu cầu này vì lý do an toàn hoặc đạo đức.\n\nMình có thể giúp bạn hiểu nguyên tắc chung hoặc hướng tìm trợ giúp phù hợp nếu bạn cần. 🙏',
        role: 'assistant',
        timestamp: new Date().toISOString(),
        message_type: 'text',
      });
      setIsLoading(false);
      return;
    }

    // light finance disclaimer
    const financialPatterns = [
      /có\s+\d+.*(?:tỷ|triệu|đồng).*đầu\s+tư/i,
      /nên\s+đầu\s+tư\s+vào\s+(?:cổ\s+phiếu|bất\s+động\s+sản|vàng)/i,
      /mua.*(?:cổ\s+phiếu|chứng\s+khoán).*nào/i,
      /tư vấn tài chính/i,
      /tài chính cá nhân/i,
      /quản lý tiền/i,
    ];
    const isFinancialAdvice = financialPatterns.some((p) => p.test(trimmedContent));

    setIsLoading(true);
    try {
      await ensureChat(trimmedContent.slice(0, 50));

      const messageType = detectPromptType(trimmedContent);
      await createMessageMutation.mutateAsync({
        chat_id: targetChatId,
        content: trimmedContent,
        role: 'user',
        timestamp: new Date().toISOString(),
        message_type: messageType,
      });
      console.log('✅ User message created');

      if (isFinancialAdvice) {
        const financialResponse = `📊 **Nguyên tắc chung về đầu tư:**

1. **Đa dạng hóa:** Không bỏ hết vào một kênh duy nhất  
2. **Hiểu rủi ro:** Lợi nhuận cao thường đi kèm rủi ro cao  
3. **Kỳ hạn phù hợp:** Ngắn hạn (tiết kiệm), trung hạn (trái phiếu), dài hạn (cổ phiếu/BĐS)  
4. **Học hỏi:** Tìm hiểu kỹ trước khi quyết định  
5. **Quỹ khẩn cấp:** Giữ 3–6 tháng chi phí sinh hoạt trước khi đầu tư

*⚠️ Lưu ý: Đây không phải tư vấn tài chính cá nhân hóa. Hãy tự đánh giá rủi ro hoặc tham khảo chuyên gia tài chính có chứng chỉ trước khi quyết định.*`;
        await createMessageMutation.mutateAsync({
          chat_id: targetChatId,
          content: financialResponse,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          message_type: 'text',
        });
        setIsLoading(false);
        return;
      }

      // parse lesson/grade
      const { gradeLevel, lessonNumber } = parseUserQuery(trimmedContent);
      console.log('📊 Parsed query:', { gradeLevel, lessonNumber });

      // generic prompts
      const genericPrompts = [
        'giai thich cho toi ve',
        'noi dung bai hoc',
        'tao anh minh hoa',
        'tao 5 cau trac nghiem',
        'trac nghiem',
        'tao 7 flashcards',
        'flashcard',
        'tao 3 cau dung-sai',
        'dung-sai',
      ];
      const isGenericPrompt = genericPrompts.some((p) =>
        normalizeText(trimmedContent).includes(p)
      );
      console.log('🔍 isGenericPrompt:', isGenericPrompt);
      console.log('🔍 Normalized content:', normalizeText(trimmedContent));
      console.log('🔍 Length:', trimmedContent.length);

      const isChooseAnotherLesson =
        normalizeText(trimmedContent).includes('giai thich cho toi ve') &&
        !gradeLevel &&
        !lessonNumber &&
        trimmedContent.length < 30;

      console.log('🔍 isChooseAnotherLesson:', isChooseAnotherLesson);

      if (isChooseAnotherLesson) {
        console.log('✅ Entering isChooseAnotherLesson block');
        setCurrentLessonContext(null);
        if (targetChatId) localStorage.removeItem(`lesson_context_${targetChatId}`);

        const askText =
          userRole === 'student'
            ? 'Cậu muốn học **Bài số mấy, Lớp mấy**? Ví dụ: `Bài 1 Lớp 10` hoặc nhập tên bài học nhé!'
            : 'Thầy/Cô muốn nội dung **Bài số mấy, Lớp mấy**? Ví dụ: `Bài 1 Lớp 10` hoặc nhập tên bài học nhé!';

        await createMessageMutation.mutateAsync({
          chat_id: targetChatId,
          content: askText,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          message_type: 'text',
        });
        setIsLoading(false);
        return;
      }

      // effective context
      const effectiveGrade = gradeLevel || currentLessonContext?.grade;
      const effectiveLesson = lessonNumber || currentLessonContext?.lesson;
      console.log('📖 Current Lesson Context:', currentLessonContext);
      console.log('➡️ Effective search context:', { effectiveGrade, effectiveLesson });

      // title search fallback if no numbers
      if (!effectiveLesson && !effectiveGrade && trimmedContent.length > 5 && messageType === 'text') {
        console.log('🔍 Trying title search...');
        const searchTerm = normalizeText(trimmedContent)
          .replace(/giai thich cho toi ve/g, '')
          .replace(/noi dung bai hoc/g, '')
          .trim();

        if (searchTerm.length >= 3) {
          const matchingLessons = knowledgeBase
            .filter((doc) => {
              if (!doc) return false;
              if (doc.category && doc.category !== 'theory') return false;
              const titleNormalized = normalizeText(doc.title || '');
              return titleNormalized.includes(searchTerm);
            })
            .slice(0, 10)
            .map((doc, idx) => {
              const displayLesson = doc.lesson_number?.replace('Bài ', '') || doc.lesson_number;
              const displayGrade = doc.grade_level;
              return {
                idx: idx + 1,
                lesson: displayLesson,
                grade: displayGrade,
                title: doc.title,
                value: `Bai ${displayLesson} Lop ${displayGrade}`,
              };
            });

          console.log('📚 Found matching lessons:', matchingLessons.length);

          if (matchingLessons.length > 0) {
            let suggestionText = `Mình tìm thấy ${matchingLessons.length} bài học phù hợp:\n\n`;
            matchingLessons.forEach((lesson) => {
              suggestionText += `${lesson.idx}. **Bài ${lesson.lesson} (Lớp ${lesson.grade})** — ${lesson.title}\n\n`;
            });
            suggestionText += '\nCậu hãy chọn một bài bằng cách nhập "Bài X Lớp Y" nhé!';

            await createMessageMutation.mutateAsync({
              chat_id: targetChatId,
              content: suggestionText,
              role: 'assistant',
              timestamp: new Date().toISOString(),
              message_type: 'text',
            });
            setIsLoading(false);
            return;
          }
        }
      }

      // ask for numbers if still generic
      if (isGenericPrompt && !effectiveGrade && !effectiveLesson) {
        const askText =
          userRole === 'student'
            ? 'Cậu muốn học **Bài số mấy, Lớp mấy**? Ví dụ: `Bài 1 Lớp 10` hoặc nhập tên bài học nhé!'
            : 'Thầy/Cô muốn nội dung **Bài số mấy, Lớp mấy**? Ví dụ: `Bài 1 Lớp 10` hoặc nhập tên bài học nhé!';

        await createMessageMutation.mutateAsync({
          chat_id: targetChatId,
          content: askText,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          message_type: 'text',
        });
        setIsLoading(false);
        return;
      }

      // ---------- LESSON LOOKUP (fixed) ----------
      let lessonDoc = null;

      if (effectiveLesson && effectiveGrade) {
        console.log('🔎 Searching KB (effective):', effectiveGrade, effectiveLesson);

        // 1) Try in-memory first
        const kbInArray = findKBInArray(knowledgeBase, {
          gradeLevel: String(effectiveGrade),
          lessonNumber: String(effectiveLesson),
        });

        // 2) Fallback to Supabase if not found in memory
        const kbFromDB = kbInArray
          ? kbInArray
          : await findKBByGradeLesson(String(effectiveGrade), String(effectiveLesson));

        lessonDoc = kbFromDB || null;

        console.log(
          '📖 Lesson result:',
          lessonDoc ? `${lessonDoc.lesson_number} - ${lessonDoc.title}` : 'NOT FOUND'
        );

        if (!lessonDoc) {
          await createMessageMutation.mutateAsync({
            chat_id: targetChatId,
            content: `Xin lỗi, không tìm thấy **Bài ${effectiveLesson} (Lớp ${effectiveGrade})** trong ngân hàng kiến thức. 😅\n\nCậu có thể thử bài khác không?`,
            role: 'assistant',
            timestamp: new Date().toISOString(),
            message_type: 'text',
          });
          setIsLoading(false);
          return;
        }

        const newLessonContext = {
          lesson: String(effectiveLesson),
          grade: String(effectiveGrade),
          title: lessonDoc.title,
          lesson_number: lessonDoc.lesson_number,
          grade_level: lessonDoc.grade_level,
        };
        setCurrentLessonContext(newLessonContext);
        localStorage.setItem(`lesson_context_${targetChatId}`, JSON.stringify(newLessonContext));
      }

      // ---------- TRUE/FALSE path ----------
      if (messageType === 'true_false') {
        console.log('🎯 TRUE_FALSE MESSAGE TYPE DETECTED');

        if (!lessonDoc) {
          await createMessageMutation.mutateAsync({
            chat_id: targetChatId,
            content:
              'Vui lòng chọn một bài học trước. Ví dụ: "Giải thích cho tôi về Bài 1 Lớp 10"',
            role: 'assistant',
            timestamp: new Date().toISOString(),
            message_type: 'text',
          });
          setIsLoading(false);
          return;
        }

        const targetLessonNormalized = normalizeText(lessonDoc.lesson_number || '');
        const targetGrade = String(lessonDoc.grade_level || '').trim();

        const allMatchingRecords = knowledgeBase.filter((doc) => {
          if (!doc) return false;
          const docLessonNormalized = normalizeText(doc.lesson_number || '');
          const docGrade = String(doc.grade_level || '').trim();
          return docLessonNormalized === targetLessonNormalized && docGrade === targetGrade;
        });

        let tfQuestions = [];
        allMatchingRecords.forEach((doc) => {
          const questions = doc.true_false_questions;
          if (Array.isArray(questions) && questions.length > 0) {
            tfQuestions = [...tfQuestions, ...questions];
          }
        });

        if (tfQuestions.length === 0) {
          await createMessageMutation.mutateAsync({
            chat_id: targetChatId,
            content: `Xin lỗi, **${lessonDoc.lesson_number}** chưa có câu đúng-sai trong hệ thống. 📚\n\nCậu có thể thử các tính năng khác nhé!`,
            role: 'assistant',
            timestamp: new Date().toISOString(),
            message_type: 'text',
          });
          setIsLoading(false);
          return;
        }

        const storageKey = `tf_index_${targetChatId}_${lessonDoc.lesson_number}_${lessonDoc.grade_level}`;
        let currentIndex = parseInt(localStorage.getItem(storageKey) || '0', 10);
        if (currentIndex >= tfQuestions.length) currentIndex = 0;

        const questionsToShow = tfQuestions.slice(currentIndex, currentIndex + 3);
        const actualShown = questionsToShow.length;
        const nextIndex = currentIndex + actualShown;
        localStorage.setItem(storageKey, String(nextIndex >= tfQuestions.length ? 0 : nextIndex));

        let tfText = `Đây là ${actualShown} câu đúng-sai từ **${lessonDoc.lesson_number}: ${lessonDoc.title}** 📝\n\n`;
        const totalShownSoFar = Math.min(nextIndex, tfQuestions.length);
        tfText += `*(Đã xem ${totalShownSoFar}/${tfQuestions.length} câu)*\n\n`;

        questionsToShow.forEach((q, idx) => {
          if (!q || !q.options || !q.answers) return;
          if (idx > 0) tfText += '\n\n---\n\n';

          tfText += `**${q.question_number || `Câu ${currentIndex + idx + 1}`}:**\n\n`;
          if (q.material) tfText += `*Tư liệu:* ${q.material}\n\n`;
          tfText += `a) ${q.options.a || '(Chưa có nội dung)'}\n\n`;
          tfText += `b) ${q.options.b || '(Chưa có nội dung)'}\n\n`;
          tfText += `c) ${q.options.c || '(Chưa có nội dung)'}\n\n`;
          tfText += `d) ${q.options.d || '(Chưa có nội dung)'}\n\n`;
          tfText += `**Đáp án:**\n\n`;
          tfText += `- a) ${q.answers.a || 'Đ'}\n`;
          tfText += `- b) ${q.answers.b || 'S'}\n`;
          tfText += `- c) ${q.answers.c || 'Đ'}\n`;
          tfText += `- d) ${q.answers.d || 'S'}`;
        });

        await createMessageMutation.mutateAsync({
          chat_id: targetChatId,
          content: tfText,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          message_type: 'true_false',
        });
        setIsLoading(false);
        return;
      }

      // ---------- Choose content mode ----------
      let contentMode = 'OPEN_SEARCH';
      let llmCategory = 'open_search';
      const contextForPromptDisplay = lessonDoc || currentLessonContext;

      if (messageType === 'quiz') {
        contentMode = 'STATIC_CONTENT';
        llmCategory = 'quiz';
      } else if (messageType === 'flashcard') {
        contentMode = 'STATIC_CONTENT';
        llmCategory = 'flashcard';
      } else if (messageType === 'text') {
        if (lessonDoc) {
          contentMode = 'STATIC_CONTENT';
          llmCategory = lessonDoc.category || 'theory';
          const openSearchCues = [
            'tại sao',
            'so sánh',
            'đánh giá',
            'phân tích',
            'nguồn nào',
            'hướng dẫn',
            'cách làm',
            'latest',
            'gần đây',
            'ở đâu',
            'tin tức',
            'ai là người',
          ];
          if (openSearchCues.some((cue) => normalizeText(trimmedContent).includes(normalizeText(cue)))) {
            contentMode = 'OPEN_SEARCH';
            llmCategory = 'open_search';
          }
        } else {
          contentMode = 'OPEN_SEARCH';
          llmCategory = 'open_search';
        }
      }

      const lessonTitleForPrompt = contextForPromptDisplay
        ? `${contextForPromptDisplay.lesson_number || contextForPromptDisplay.lesson} - ${contextForPromptDisplay.title}`
        : 'Chưa xác định';

      // ---------- Build prompt ----------
      let systemPrompt = '';
      if (messageType === 'image') {
        // handled below
      } else if (contentMode === 'STATIC_CONTENT') {
        if (messageType === 'quiz') {
          systemPrompt = `[MODE: STATIC_CONTENT]
[ROLE: ${userRole}]
[CATEGORY: ${llmCategory}]

Bài học: ${lessonTitleForPrompt}

Tạo 5 câu hỏi trắc nghiệm Lịch sử Việt Nam theo bài học này, dành cho học sinh ôn tập nhanh.

Yêu cầu:
- Mỗi câu theo cấp độ dễ đến trung bình.
- Mỗi câu chỉ có 1 đáp án đúng.
- Tránh diễn đạt quá học thuật, dùng ngôn ngữ dễ hiểu.
- Học sinh có thể làm trong khoảng 10 phút.

⚠ Mỗi lần sinh nội dung, hãy tạo một bộ câu hỏi KHÁC HOÀN TOÀN so với lần trước.

**Format bắt buộc:**
**Câu 1.** ...
- **A.** ...
- **B.** ...
- **C.** ...
- **D.** ...
**Đáp án:** **A**
_Giải thích:_ ...

---
(Tiếp tục đến Câu 5)`;
        } else if (messageType === 'flashcard') {
          systemPrompt = `[MODE: STATIC_CONTENT]
[ROLE: ${userRole}]
[CATEGORY: ${llmCategory}]

Chọn nguồn từ: ${lessonTitleForPrompt}

Tạo tối thiểu 7 flashcards, mỗi thẻ:
### 📌 Flashcard [số]
**Câu hỏi:** ...
**Trả lời:** ...
---
`;
        } else {
          systemPrompt = `[MODE: STATIC_CONTENT]
[ROLE: ${userRole}]
[CATEGORY: ${llmCategory}]

${contextForPromptDisplay ? `📚 **Bài học hiện tại:** ${lessonTitleForPrompt}` : ''}

**Nội dung bài học:**
Bài: ${lessonDoc?.lesson_number || ''}
Tiêu đề: ${lessonDoc?.title || ''}
Nội dung: ${lessonDoc?.content || ''}

**Câu hỏi của ${userRole === 'teacher' ? 'giáo viên' : 'học sinh'}:** ${trimmedContent}`;
        }
      } else {
        systemPrompt = `[MODE: OPEN_SEARCH]
[ROLE: ${userRole}]
[CATEGORY: ${llmCategory}]

**Câu hỏi:** ${trimmedContent}
- Trả lời ngắn gọn, rõ, có nguồn tham khảo khi cần.`;
      }

      let prompt = systemPrompt;
      if (lessonDoc && contentMode === 'STATIC_CONTENT') {
        prompt += `\n\nNội dung bài học:\nBài: ${lessonDoc.lesson_number || ''}\nTiêu đề: ${lessonDoc.title || ''}\nNội dung: ${lessonDoc.content || ''}`;
      }
      prompt += `\n`;

      // ---------- Invoke content ----------
      let assistantText = '';
      if (messageType === 'image') {
        try {
          const imgDescription = trimmedContent.replace(/tạo ảnh|minh họa|tao anh/gi, '').trim();
          const imgLessonContext = contextForPromptDisplay
            ? `${contextForPromptDisplay.lesson_number || contextForPromptDisplay.lesson} - ${contextForPromptDisplay.title}`
            : imgDescription;

          const imgPrompt = `Description provided by the ${
            userRole === 'teacher' ? 'teacher' : 'student'
          }: ${imgLessonContext}
Generate a cartoon-style Vietnamese history illustration for students.`;

          const imgResult = await base44.integrations.Core.GenerateImage({ prompt: imgPrompt });
          const imgUrl = imgResult?.url || imgResult?.data?.[0]?.url;
          if (!imgUrl) throw new Error('No image URL');

          assistantText = `Đây là ảnh minh họa cho **${imgLessonContext}**:\n\n![Ảnh minh họa](${imgUrl})`;
        } catch (imgError) {
          console.error('Image generation failed:', imgError);
          assistantText = 'Xin lỗi, không thể tạo ảnh lúc này. Vui lòng thử lại. 🙏';
        }
      } else {
        try {
          console.log('🤖 Calling LLM with prompt length:', prompt.length);
          // Build a safe kbContext (use whatever lesson info you already have in scope)
          const kbContext =
            (Array.isArray(matchedLessons) && matchedLessons.length
              ? matchedLessons.slice(0, 3) // cap to keep prompt small
                  .map(l => `Bài ${l.lesson} (Lớp ${l.grade}) — ${l.title || ""}`)
                  .join("\n")
              : "") || "";

// If you also keep a “selected lesson” object, you can append more detail:
          const selectedSnippet = (selectedLesson?.content || selectedLesson?.summary || "").toString().slice(0, 1200);
          const effectiveKbContext = [kbContext, selectedSnippet].filter(Boolean).join("\n").trim();

// Call your LLM (either via shimmed base44 or direct import)
          const llmResult = await base44.integrations.Core.InvokeLLM({
            prompt,
            kbContext: effectiveKbContext
});

// Or, if you imported it directly:
// import { invokeLLM } from "@/lib/custom-sdk";
// const llmResult = await invokeLLM({ prompt: normalizedContent, kbContext: effectiveKbContext });


          let body = '';
          if (typeof llmResult === 'string') body = llmResult;
          else if (llmResult?.text) body = llmResult.text;
          else if (llmResult?.content) body = llmResult.content;
          else if (llmResult?.message) body = llmResult.message;
          else if (llmResult?.response) body = llmResult.response;
          else if (llmResult?.choices?.[0]?.message?.content)
            body = llmResult.choices[0].message.content;
          else body = JSON.stringify(llmResult);

          if (body && messageType === 'text' && contentMode === 'STATIC_CONTENT') {
            if (lessonDoc) {
              let ln = (lessonDoc.lesson_number || '').replace(/^Bài\s+/i, '').trim();
              if (!ln) ln = String(lessonDoc.lesson_number || '');
              body = `# Bài ${ln} (Lớp ${lessonDoc.grade_level}): ${lessonDoc.title}\n\n${body}`;
            } else if (currentLessonContext) {
              let ln =
                (currentLessonContext.lesson_number || currentLessonContext.lesson || '').replace(
                  /^Bài\s+/i,
                  ''
                ).trim() || String(currentLessonContext.lesson_number || currentLessonContext.lesson || '');
              body = `# Bài ${ln} (Lớp ${
                currentLessonContext.grade_level || currentLessonContext.grade
              }): ${currentLessonContext.title}\n\n${body}`;
            }
          }

          const isExamPrep = normalizeText(trimmedContent).includes('on thi tot nghiep');
          if (isExamPrep && body) {
            body += `\n\n---\n\n💡 **Mách nhỏ:** Xem thêm bộ đề ôn tập của mùa trước (Google Drive).`;
          }

          assistantText = (body || '').trim() || 'Xin lỗi, chưa có câu trả lời. Vui lòng thử lại.';
        } catch (llmError) {
          console.error('LLM call failed:', llmError);
          assistantText = `Lỗi khi gọi LLM: ${llmError.message}`;
        }
      }

      await createMessageMutation.mutateAsync({
        chat_id: targetChatId,
        content: assistantText,
        role: 'assistant',
        timestamp: new Date().toISOString(),
        message_type: messageType,
      });
    } catch (error) {
      console.error('Error in handleSendMessage:', error);
      try {
        if (currentChatId) {
          await createMessageMutation.mutateAsync({
            chat_id: currentChatId,
            content: `Xin lỗi, có lỗi xảy ra: ${error.message}`,
            role: 'assistant',
            timestamp: new Date().toISOString(),
            message_type: 'text',
          });
        }
      } catch (saveError) {
        console.error('Failed to save error message:', saveError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ---------- UI ----------
  if (!userRole || (userRole !== 'student' && userRole !== 'teacher')) {
    return (
      <RoleSelector
        isOpen={showRoleSelector || !userRole}
        onSelectRole={handleRoleSelect}
        isDarkMode={isDarkMode}
      />
    );
  }

  return (
    <div className={`h-screen flex overflow-hidden ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
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
            isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
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
          <RoleSwitcher currentRole={userRole} onSwitch={handleRoleSwitch} isDarkMode={isDarkMode} />
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 py-6">
            {isSyncing && messages.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${
                  isDarkMode
                    ? 'bg-blue-900/30 text-blue-300 border border-blue-700'
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                }`}
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang đồng bộ với máy chủ...</span>
              </motion.div>
            )}

            {messages.length === 0 && !isFetching ? (
              <EmptyState isDarkMode={isDarkMode} userRole={userRole} onQuickReply={handleSendMessage} />
            ) : (
              <AnimatePresence mode="sync">
                {messages.map((message) => (
                  <MessageBubble
                    key={`${message.id}-${message.timestamp}`}
                    message={message}
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
              isDarkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'
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
