
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, Loader2 } from 'lucide-react';

import ChatSidebar from '../components/chat/ChatSidebar';
import MessageBubble from '../components/chat/MessageBubble';
import ChatInput from '../components/chat/ChatInput';
import EmptyState from '../components/chat/EmptyState';
import RoleSelector from '../components/chat/RoleSelector';
import RoleSwitcher from '../components/chat/RoleSwitcher';

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
  return s.toLowerCase()
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
        'mot': '1', 'hai': '2', 'ba': '3', 'bon': '4', 'nam': '5',
        'sau': '6', 'bay': '7', 'tam': '8', 'chin': '9', 'muoi': '10'
      };

      lessonNumber = textToNum[lessonText] || lessonText;
      break;
    }
  }

  console.log('✅ Parsed result:', { gradeLevel, lessonNumber });
  return { gradeLevel, lessonNumber };
};

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

  useEffect(() => {
    const savedRole = localStorage.getItem('userRole');
    if (savedRole) {
      setUserRole(savedRole);
    } else {
      setShowRoleSelector(true);
    }
  }, []);

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
    staleTime: 60_000
  });

  const { data: serverMessages = [], isFetching } = useQuery({
    queryKey: ['messages', currentChatId],
    queryFn: async () => {
      if (!currentChatId) return [];
      
      try {
        const msgs = await base44.entities.Message.list('timestamp', 100);
        const filtered = msgs?.filter(m => m.chat_id === currentChatId) || [];
        
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
      
      if (refetchTimeoutRef.current) {
        clearTimeout(refetchTimeoutRef.current);
      }
      refetchTimeoutRef.current = setTimeout(() => {
        console.log('🔄 Retry refetch (server behind)');
        queryClient.invalidateQueries({ queryKey: ['messages', currentChatId] });
      }, 3000);
      
      return localMessages;
    }
    
    const merged = new Map();
    
    localMessages.forEach(msg => {
      merged.set(msg.id, msg);
    });
    
    serverMessages.forEach(msg => {
      merged.set(msg.id, msg);
    });
    
    const result = Array.from(merged.values()).sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
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
      if (refetchTimeoutRef.current) {
        clearTimeout(refetchTimeoutRef.current);
      }
    };
  }, []);

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
    staleTime: 300_000
  });

  const createChatMutation = useMutation({
    mutationFn: (data) => base44.entities.ChatHistory.create(data),
    onSuccess: () => queryClient.invalidateQueries(['chatHistories'])
  });

  const updateChatMutation = useMutation({
    mutationFn: (params) => base44.entities.ChatHistory.update(params.id, params.data),
    onSuccess: () => queryClient.invalidateQueries(['chatHistories'])
  });

  const deleteChatMutation = useMutation({
    mutationFn: (id) => base44.entities.ChatHistory.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['chatHistories']);
      queryClient.invalidateQueries(['messages']);
    }
  });

  const createMessageMutation = useMutation({
    mutationFn: (data) => base44.entities.Message.create(data),
    onMutate: async (newMessage) => {
      await queryClient.cancelQueries({ queryKey: ['messages', newMessage.chat_id] });
      
      const previousMessages = queryClient.getQueryData(['messages', newMessage.chat_id]) || [];
      
      const tempMessage = {
        ...newMessage,
        id: `temp_${Date.now()}`,
      };
      
      queryClient.setQueryData(['messages', newMessage.chat_id], (old = []) => {
        const updated = [...old, tempMessage].sort((a, b) => 
          new Date(a.timestamp) - new Date(b.timestamp)
        );
        console.log(`⚡ Optimistic add: ${updated.length} messages`);
        return updated;
      });
      
      return { previousMessages, tempId: tempMessage.id };
    },
    onSuccess: (newMessage, variables, context) => {
      console.log('✅ Server confirmed:', newMessage?.id);
      
      queryClient.setQueryData(['messages', variables.chat_id], (old = []) => {
        const withoutTemp = old.filter(m => m.id !== context.tempId);
        
        if (withoutTemp.some(m => m.id === newMessage.id)) {
          console.log('⚠️ Real message already exists');
          return withoutTemp;
        }
        
        const updated = [...withoutTemp, newMessage].sort((a, b) => 
          new Date(a.timestamp) - new Date(b.timestamp)
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

  const handleNewChat = async () => {
    try {
      const newChat = await createChatMutation.mutateAsync({
        title: 'Cuộc trò chuyện mới',
        created_at: new Date().toISOString(),
        last_message_at: new Date().toISOString()
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
    if (chatId) {
      setCurrentChatId(chatId);
    }
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

  const handleSendMessage = async (content) => {
    if (!content || typeof content !== 'string' || !content.trim()) {
      return;
    }

    const trimmedContent = content.trim();
    console.log('📨 Sending:', trimmedContent);

    const dangerousPatterns = [
      /cách\s+(giết|tự\s+t[ửử]|làm\s+h[ạa]i|ch[ếế]t|t[ửử]\s+vong)/i,
      /h[ướư]ng\s+d[ẫẫ]n.*(hack|l[ừử]a\s+đảo|phá\s+ho[ạa]i|vi\s+ph[ạa]m)/i,
      /mua\s+(ma\s+túy|ch[ấấ]t\s+c[ấấ]m|vũ\s+khí)/i,
      /(bomb|b[ộộ]m|v[ũũ]\s+khí|ch[ấấ]t\s+nổ)/i,
      /phân\s+biệt\s+(chủng\s+tộc|giới\s+tính|t[ôô]n\s+giáo)/i,
    ];

    const isDangerous = dangerousPatterns.some(pattern => pattern.test(trimmedContent));

    if (isDangerous) {
      setIsLoading(true);

      let targetChatId = currentChatId;
      if (!targetChatId) {
        const newChat = await createChatMutation.mutateAsync({
          title: 'Yêu cầu không phù hợp',
          created_at: new Date().toISOString(),
          last_message_at: new Date().toISOString()
        });
        targetChatId = newChat.id;
        setCurrentChatId(newChat.id);
      }

      await createMessageMutation.mutateAsync({
        chat_id: targetChatId,
        content: trimmedContent,
        role: 'user',
        timestamp: new Date().toISOString(),
        message_type: 'text',
      });

      await createMessageMutation.mutateAsync({
        chat_id: targetChatId,
        content: '⚠️ Mình không thể hỗ trợ yêu cầu này vì lý do an toàn hoặc đạo đức.\n\nMình có thể giúp bạn hiểu nguyên tắc chung hoặc hướng tìm trợ giúp phù hợp nếu bạn cần. 🙏',
        role: 'assistant',
        timestamp: new Date().toISOString(),
        message_type: 'text',
      });

      setIsLoading(false);
      return;
    }

    const financialPatterns = [
      /có\s+\d+.*(?:tỷ|triệu|đồng).*đầu\s+tư/i,
      /nên\s+đầu\s+tư\s+vào\s+(?:cổ\s+phiếu|bất\s+động\s+sản|vàng)/i,
      /mua.*(?:cổ\s+phiếu|chứng\s+khoán).*nào/i,
      /tư vấn tài chính/i,
      /tài chính cá nhân/i,
      /quản lý tiền/i,
    ];

    const isFinancialAdvice = financialPatterns.some(pattern => pattern.test(trimmedContent));

    setIsLoading(true);

    let targetChatId = currentChatId;

    try {
      if (!targetChatId) {
        const newChat = await createChatMutation.mutateAsync({
          title: trimmedContent.slice(0, 50),
          created_at: new Date().toISOString(),
          last_message_at: new Date().toISOString()
        });

        if (!newChat?.id) {
          throw new Error('Failed to create chat');
        }

        targetChatId = newChat.id;
        setCurrentChatId(newChat.id);
      }

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
        console.log('💰 Detected financial advice request');
        const financialResponse = `📊 **Nguyên tắc chung về đầu tư:**

1. **Đa dạng hóa:** Không bỏ hết vào một kênh duy nhất
2. **Hiểu rủi ro:** Lợi nhuận cao thường đi kèm rủi ro cao
3. **Kỳ hạn phù hợp:** Ngắn hạn (tiết kiệm), trung hạn (trái phiếu), dài hạn (cổ phiếu/BĐS)
4. **Học hỏi:** Tìm hiểu kỹ trước khi quyết định
5. **Quỹ khẩn cấp:** Giữ 3-6 tháng chi phí sinh hoạt trước khi đầu tư

*⚠️ Lưu ý: Đây không phải tư vấn tài chính cá nhân hóa. Hãy tự đánh giá rủi ro hoặc tham khảo chuyên gia tài chính có chứng chỉ trước khi quyết định.*

**Nguồn tham khảo:**
- [Hướng dẫn đầu tư cơ bản - SSI](https://www.ssi.com.vn)
- [Kiến thức tài chính - SBV](https://www.sbv.gov.vn)`;

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

      const { gradeLevel, lessonNumber } = parseUserQuery(trimmedContent);
      console.log('📊 Parsed query:', { gradeLevel, lessonNumber });

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

      const isGenericPrompt = genericPrompts.some(p =>
        normalizeText(trimmedContent).includes(p)
      );

      console.log('🔍 isGenericPrompt:', isGenericPrompt);
      console.log('🔍 Normalized content:', normalizeText(trimmedContent));
      console.log('🔍 Length:', trimmedContent.length);

      const isChooseAnotherLesson = normalizeText(trimmedContent).includes('giai thich cho toi ve') &&
        !gradeLevel && !lessonNumber && trimmedContent.length < 30;

      console.log('🔍 isChooseAnotherLesson:', isChooseAnotherLesson);

      if (isChooseAnotherLesson) {
        console.log('✅ Entering isChooseAnotherLesson block');
        setCurrentLessonContext(null);
        if (targetChatId) {
          localStorage.removeItem(`lesson_context_${targetChatId}`);
        }

        const askText = userRole === 'student'
          ? 'Cậu muốn học **Bài số mấy, Lớp mấy**? Ví dụ: `Bài 1 Lớp 10` hoặc nhập tên bài học nhé!'
          : 'Thầy/Cô muốn nội dung **Bài số mấy, Lớp mấy**? Ví dụ: `Bài 1 Lớp 10` hoặc nhập tên bài học nhé!';

        console.log('📤 Creating ask message:', askText);
        console.log('📤 targetChatId:', targetChatId);

        try {
          const result = await createMessageMutation.mutateAsync({
            chat_id: targetChatId,
            content: askText,
            role: 'assistant',
            timestamp: new Date().toISOString(),
            message_type: 'text',
          });
          console.log('✅ Ask message created successfully:', result);
        } catch (err) {
          console.error('❌ Error creating ask message:', err);
          console.error('❌ Error details:', JSON.stringify(err, null, 2));
        }

        setIsLoading(false);
        return;
      }

      const effectiveGrade = gradeLevel || currentLessonContext?.grade;
      const effectiveLesson = lessonNumber || currentLessonContext?.lesson;

      console.log('📖 Current Lesson Context:', currentLessonContext);
      console.log('➡️ Effective search context:', { effectiveGrade, effectiveLesson });

      if (!effectiveLesson && !effectiveGrade && trimmedContent.length > 5 && messageType === 'text') {
        console.log('🔍 Trying title search...');

        const searchTerm = normalizeText(trimmedContent)
          .replace(/giai thich cho toi ve/g, '')
          .replace(/noi dung bai hoc/g, '')
          .trim();

        if (searchTerm.length >= 3) {
          console.log('🔍 Searching by title:', searchTerm);

          const matchingLessons = knowledgeBase
            .filter(doc => {
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
                value: `Bài ${displayLesson} Lớp ${displayGrade}`
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

      if (isGenericPrompt && !effectiveGrade && !effectiveLesson) {
        const askText = userRole === 'student'
          ? 'Cậu muốn học **Bài số mấy, Lớp mấy**? Ví dụ: `Bài 1 Lớp 10` hoặc nhập tên bài học nhé!'
          : 'Thầy/Cô muốn nội dung **Bài số mấy, Lớp mấy**? Ví dụ: `Bài 1 Lớp 10` hoặc nhập tên bài học nhé!';

        console.log('📤 Creating ask message (generic):', askText);

        try {
          await createMessageMutation.mutateAsync({
            chat_id: targetChatId,
            content: askText,
            role: 'assistant',
            timestamp: new Date().toISOString(),
            message_type: 'text',
          });
          console.log('✅ Ask message created successfully (generic)');
        } catch (err) {
          console.error('❌ Error creating ask message (generic):', err);
        }

        setIsLoading(false);
        return;
      }

      let lessonDoc = null;

      if (effectiveLesson && effectiveGrade) {
        console.log('🔎 Searching for lesson in KB:', effectiveLesson, 'grade:', effectiveGrade);
        console.log('📚 Knowledge base size:', knowledgeBase.length);

        lessonDoc = knowledgeBase.find(doc => {
          if (!doc) return false;
          if (doc.category && doc.category !== 'theory') return false;

          const docLessonNormalized = normalizeText(doc.lesson_number || '');
          const docGrade = String(doc.grade_level || '').trim();

          const exactPatterns = [
            new RegExp(`^bai\\s+${effectiveLesson}$`, 'i'),
            new RegExp(`^bai\\s*${effectiveLesson}\\s*$`, 'i'),
            new RegExp(`^${effectiveLesson}$`, 'i'),
          ];

          const matchLesson = exactPatterns.some(pattern => pattern.test(docLessonNormalized));
          const matchGrade = docGrade === effectiveGrade;

          return matchLesson && matchGrade;
        });

        console.log('📖 Lesson found from KB:', lessonDoc ? `${lessonDoc.lesson_number} - ${lessonDoc.title}` : 'NOT FOUND');

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
          lesson: effectiveLesson,
          grade: effectiveGrade,
          title: lessonDoc.title,
          lesson_number: lessonDoc.lesson_number,
          grade_level: lessonDoc.grade_level
        };
        setCurrentLessonContext(newLessonContext);
        localStorage.setItem(`lesson_context_${targetChatId}`, JSON.stringify(newLessonContext));
      }

      if (messageType === 'true_false') {
        console.log('🎯 TRUE_FALSE MESSAGE TYPE DETECTED');

        if (!lessonDoc) {
          await createMessageMutation.mutateAsync({
            chat_id: targetChatId,
            content: 'Vui lòng chọn một bài học trước. Ví dụ: "Giải thích cho tôi về Bài 1 Lớp 10"',
            role: 'assistant',
            timestamp: new Date().toISOString(),
            message_type: 'text',
          });
          setIsLoading(false);
          return;
        }

        console.log('📋 Searching for true_false questions...');
        console.log('📋 Current lesson:', lessonDoc.lesson_number, 'grade:', lessonDoc.grade_level);

        const targetLessonNormalized = normalizeText(lessonDoc.lesson_number || '');
        const targetGrade = String(lessonDoc.grade_level || '').trim();

        const allMatchingRecords = knowledgeBase.filter(doc => {
          if (!doc) return false;

          const docLessonNormalized = normalizeText(doc.lesson_number || '');
          const docGrade = String(doc.grade_level || '').trim();

          const matchLesson = docLessonNormalized === targetLessonNormalized;
          const matchGrade = docGrade === targetGrade;

          return matchLesson && matchGrade;
        });

        console.log('📚 Found matching records:', allMatchingRecords.length);
        allMatchingRecords.forEach(rec => {
          const hasQuestions = rec.true_false_questions && rec.true_false_questions.length > 0;
          console.log('  - Category:', rec.category, 'has true_false:', hasQuestions, 'questions:', rec.true_false_questions?.length || 0);
        });

        let tfQuestions = [];
        
        allMatchingRecords.forEach(doc => {
          const questions = doc.true_false_questions;
          if (Array.isArray(questions) && questions.length > 0) {
            tfQuestions = [...tfQuestions, ...questions];
            console.log('✅ Added', questions.length, 'questions from category:', doc.category);
          }
        });

        console.log('📋 Total questions merged:', tfQuestions.length);

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

        console.log('📋 Current question index:', currentIndex);
        console.log('📋 Total questions:', tfQuestions.length);

        if (currentIndex >= tfQuestions.length) {
          currentIndex = 0;
          console.log('📋 Resetting to start');
        }

        const questionsToShow = tfQuestions.slice(currentIndex, currentIndex + 3);
        const actualShown = questionsToShow.length;

        console.log('📋 Showing questions from index', currentIndex, 'to', currentIndex + actualShown - 1);

        const nextIndex = currentIndex + actualShown;
        localStorage.setItem(storageKey, String(nextIndex >= tfQuestions.length ? 0 : nextIndex));

        let tfText = `Đây là ${actualShown} câu đúng-sai từ **${lessonDoc.lesson_number}: ${lessonDoc.title}** 📝\n\n`;

        const totalShownSoFar = Math.min(nextIndex, tfQuestions.length);
        tfText += `*(Đã xem ${totalShownSoFar}/${tfQuestions.length} câu)*\n\n`;

        questionsToShow.forEach((q, idx) => {
          if (!q || !q.options || !q.answers) {
            console.warn('⚠️ Invalid question at index', idx);
            return;
          }

          if (idx > 0) tfText += '\n\n---\n\n';

          tfText += `**${q.question_number || `Câu ${currentIndex + idx + 1}`}:**\n\n`;

          if (q.material) {
            tfText += `*Tư liệu:* ${q.material}\n\n`;
          }

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

      let contentMode = 'OPEN_SEARCH';
      let llmCategory = 'open_search';

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

          const openSearchCues = ['tại sao', 'so sánh', 'đánh giá', 'phân tích', 'nguồn nào',
                                  'hướng dẫn', 'cách làm', 'latest', 'gần đây', 'ở đâu', 'tin tức', 'ai là người'];
          if (openSearchCues.some(cue => normalizeText(trimmedContent).includes(normalizeText(cue)))) {
            contentMode = 'OPEN_SEARCH';
            llmCategory = 'open_search';
          }
        } else {
          contentMode = 'OPEN_SEARCH';
          llmCategory = 'open_search';
        }
      }

      const contextForPromptDisplay = lessonDoc || currentLessonContext;
      const lessonTitleForPrompt = contextForPromptDisplay
        ? `${contextForPromptDisplay.lesson_number || contextForPromptDisplay.lesson} - ${contextForPromptDisplay.title}`
        : 'Chưa xác định';

      let systemPrompt = '';

      if (messageType === 'image') {
        // Image generation handled separately
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

⚠ Mỗi lần sinh nội dung, hãy tạo một bộ câu hỏi KHÁC HOÀN TOÀN so với lần trước (nội dung, cách hỏi, thứ tự), tránh trùng lặp.

**QUAN TRỌNG - Định dạng đầu ra bắt buộc (phải tuân thủ chính xác):**

Mỗi câu hỏi phải theo format sau:

**Câu 1.** Nội dung câu hỏi ở đây?

- **A.** Lựa chọn A
- **B.** Lựa chọn B
- **C.** Lựa chọn C
- **D.** Lựa chọn D

**Đáp án:** **A**

_Giải thích:_ Lý do tại sao đáp án A đúng (ngắn gọn, dễ nhớ).

---

**Câu 2.** ...

(Tiếp tục cho đến Câu 5)

Kết thúc bằng:

✅ Hãy học lại những ý chính nếu bạn trả lời sai quá 2 câu!`;
          } else if (messageType === 'flashcard') {
            systemPrompt = `[MODE: STATIC_CONTENT]
[ROLE: ${userRole}]
[CATEGORY: ${llmCategory}]

Chọn nguồn từ: ${lessonTitleForPrompt}

Bạn là một trợ lý học tập giúp tạo flashcards lịch sử siêu dễ hiểu cho học sinh cấp 2/cấp 3.

Nhiệm vụ của bạn:
- Tạo flashcard với format rõ ràng, dễ đọc
- Mỗi flashcard gồm 2 phần:
  (1) **Câu hỏi**: Ngắn gọn, gợi nhớ (không quá dài)
  (2) **Trả lời**: Chính xác, dễ hiểu, súc tích
- Tập trung vào: mốc thời gian, diễn biến chính, nhân vật, ý nghĩa sự kiện
- Ngôn ngữ đơn giản, phù hợp học sinh

⚠ Mỗi lần sinh nội dung, hãy tạo bộ câu hỏi KHÁC HOÀN TOÀN so với lần trước

Yêu cầu format đầu ra:
✅ Mỗi flashcard theo format:

### 📌 Flashcard [số]

**Câu hỏi:** [câu hỏi ngắn gọn]

**Trả lời:** [câu trả lời chi tiết, dễ hiểu]

---

✅ Tối thiểu 5 flashcards cho mỗi yêu cầu
✅ Nếu người dùng không chỉ định số lượng, mặc định tạo 7 flashcards`;
          } else {
            systemPrompt = `[MODE: STATIC_CONTENT]
[ROLE: ${userRole}]
[CATEGORY: ${llmCategory}]

🎯 **VAI TRÒ CỦA BẠN**

${userRole === 'student'
  ? '**Học sinh / người học** — Bạn là một trợ lý học tập thân thiện, giúp học sinh hiểu bài học dễ dàng, tự nhiên như đang nói chuyện với bạn bè.'
  : '**Giáo viên / người hướng dẫn** — Bạn là trợ lý giáo viên, hỗ trợ soạn bài, đặt câu hỏi, gợi ý phương pháp giảng dạy chuyên nghiệp.'
}

🧭 **MỤC TIÊU CHÍNH**

- Giúp người dùng học và hiểu lịch sử dễ dàng, chính xác, có cảm xúc và tính người.
- Trả lời dựa trên dữ liệu bài học được cung cấp, nhưng vẫn linh hoạt để mở rộng chủ đề khi cần.
- **Không gò bó vào khung "nguyên nhân – diễn biến – kết quả – ý nghĩa"**, trừ khi bài học thật sự yêu cầu cấu trúc đó.

⚙️ **HÀNH VI CỐT LÕI**

**Linh hoạt – thông minh:**
- Giải thích kiến thức lịch sử một cách tự nhiên, dễ hiểu, có chiều sâu.
- Có thể dẫn ví dụ thực tế, so sánh, hoặc mở rộng kiến thức để giúp người học hiểu rõ hơn.

**Tone ngôn ngữ:**
- Tự nhiên, mang tính người, nhẹ nhàng, không rập khuôn kiểu máy móc.
- Dùng ngôn ngữ ${userRole === 'student' ? 'thân thiện như bạn bè, gần gũi, dễ hiểu' : 'chuẩn mực, chuyên nghiệp, rõ ràng'}.
- Có thể chia nhỏ ý thành gạch đầu dòng, tiêu đề rõ ràng.
- Có thể dùng emoji nhỏ (🎯, 💡, 📘…) để tăng tính thân thiện, nhưng không quá nhiều.

**Quy tắc ghi nhớ:**
- Mọi câu trả lời phải giúp người học "hiểu – cảm – nhớ" chứ không chỉ "chép lại".
- Giải thích sao cho sinh động, có thể kể câu chuyện hoặc dẫn dắt logic tự nhiên.

---

${contextForPromptDisplay ? `\n📚 **Bài học hiện tại:** ${lessonTitleForPrompt}\n` : ''}

**QUAN TRỌNG:** Bạn KHÔNG được tự sinh, chỉnh sửa, hoặc tham khảo nguồn ngoài. Chỉ sử dụng thông tin CÓ SẴN TRONG "Nội dung bài học" được cung cấp bên dưới.

---

**Nội dung bài học:**
Bài: ${lessonDoc?.lesson_number || ''}
Tiêu đề: ${lessonDoc?.title || ''}
Nội dung: ${lessonDoc?.content || ''}

---

**Câu hỏi của ${userRole === 'teacher' ? 'giáo viên' : 'học sinh'}:** ${trimmedContent}`;
          }
      } else {
        systemPrompt = `[MODE: OPEN_SEARCH]
[ROLE: ${userRole}]
[CATEGORY: ${llmCategory}]

🎯 **VAI TRÒ CỦA BẠN**

${userRole === 'student'
  ? '**Học sinh / người học** — Bạn là một trợ lý học tập thân thiện, giúp học sinh tìm hiểu kiến thức một cách dễ hiểu và tự nhiên.'
  : '**Giáo viên / người hướng dẫn** — Bạn là trợ lý giáo viên, hỗ trợ tìm kiếm thông tin và gợi ý phương pháp giảng dạy.'
}

🧭 **MỤC TIÊU**

- Giúp người dùng tìm câu trả lời chính xác, đáng tin cậy từ các nguồn uy tín.
- Trả lời tự nhiên, có chiều sâu, dẫn ví dụ thực tế khi cần.
- **Linh hoạt**: Nếu người dùng hỏi về chủ đề không thuộc lịch sử (như tâm lý, xã hội, cuộc sống), vẫn phản hồi một cách nhân văn, cởi mở và trung thực.

⚙️ **GIỚI HẠN ĐẠO ĐỨC**

Từ chối hoặc né tránh nhẹ nhàng, tôn trọng đối với các yêu cầu có nội dung:
- 18+, nhạy cảm, tình dục.
- Hành vi gây hại, thù hận, xúc phạm, bạo lực, hoặc xúi giục người khác.
- Các hành động phạm pháp, cá độ, lừa đảo, hack, v.v.

**Khi từ chối:** "Xin lỗi, mình không thể hỗ trợ nội dung đó. Nhưng nếu cậu muốn hiểu khía cạnh lịch sử, xã hội, hay tâm lý của vấn đề này, mình có thể cùng trao đổi."

🧠 **VAI TRÒ TÂM LÝ – CẢM XÚC**

- Khi người dùng tâm sự hoặc có nhu cầu trò chuyện, bạn trở thành một chuyên gia tâm lý học ấm áp và tôn trọng.
- Lắng nghe, phản hồi bằng sự thấu hiểu, không phán xét, và không biến cuộc trò chuyện thành giảng đạo.
- Có thể giúp người dùng suy nghĩ tích cực hơn, nhìn nhận cảm xúc của họ, hoặc đề xuất hướng tự chăm sóc tinh thần.

---

**YÊU CẦU TRẢ LỜI:**

- Trả lời ngắn gọn, đi thẳng vào trọng tâm (1-2 câu mở đầu).
- Nếu cần liệt kê, dùng gạch đầu dòng ≤5 mục.
- **BẮT BUỘC**: Kết thúc bằng mục "**Nguồn tham khảo:**" và liệt kê 1–3 link chất lượng (tên nguồn và URL).
- Nếu vấn đề có tranh luận, nêu 2 ý chính đối lập + link kiểm chứng.
- Ưu tiên nguồn chính thống: tài liệu gốc, học thuật, báo cáo, trang tin tức uy tín.
- Nếu không chắc chắn về thông tin: nói rõ mức độ chắc chắn + đưa link kiểm chứng.
- Nếu không tìm thấy đủ bằng chứng: "Chưa có đủ nguồn đáng tin cậy để trả lời câu hỏi này." + gợi ý hướng tìm.

**Tone ngôn ngữ:** Tự nhiên, ${userRole === 'student' ? 'thân thiện, gần gũi' : 'chuyên nghiệp, rõ ràng'}, dễ hiểu.

---

**Câu hỏi của ${userRole === 'teacher' ? 'giáo viên' : 'học sinh'}:** ${trimmedContent}`;
      }

      let prompt = systemPrompt;

      if (lessonDoc && contentMode === 'STATIC_CONTENT') {
        prompt += `\n\nNội dung bài học:\nBài: ${lessonDoc.lesson_number || ''}\nTiêu đề: ${lessonDoc.title || ''}\nNội dung: ${lessonDoc.content || ''}`;
      }

      prompt += `\n\nCâu hỏi của ${userRole === 'teacher' ? 'giáo viên' : 'học sinh'}: ${trimmedContent}`;

      let assistantText = '';

      if (messageType === 'image') {
        try {
          const imgDescription = trimmedContent.replace(/tạo ảnh|minh họa|tao anh/gi, '').trim();
          const imgLessonContext = contextForPromptDisplay
            ? `${contextForPromptDisplay.lesson_number || contextForPromptDisplay.lesson} - ${contextForPromptDisplay.title}`
            : imgDescription;

          const imgPrompt = `Description provided by the ${userRole === 'teacher' ? 'teacher' : 'student'}: ${imgLessonContext}

Generate a cartoon-style historical illustration suitable for middle or high school students.

Requirements:
- The image must represent Vietnamese history based on the description.
- The visual style should be cartoon-like, friendly, colorful, engaging, and easy to understand for students.
- The tone should feel educational but not too serious or dramatic.
- Depict characters, uniforms, landscapes, or weapons in a fun but respectful way.
- Ensure the scene reflects the correct cultural and historical context.
- The illustration should help students imagine the historical moment clearly.

Do NOT include:
- Modern cars, guns, sunglasses, headphones, neon lights, futuristic or sci-fi elements.
- Horror or overly violent imagery.

Now create an educational cartoon-style historical illustration.
- Use a bright pastel color palette, simple shapes, and expressive characters.
- Light manga/comic inspiration is okay, but keep it friendly and not intense.`;

          const imgResult = await base44.integrations.Core.GenerateImage({
            prompt: imgPrompt
          });

          const imgUrl = imgResult?.url || imgResult?.data?.[0]?.url;

          if (!imgUrl) {
            throw new Error('No image URL');
          }

          assistantText = `Đây là ảnh minh họa cho **${imgLessonContext}**:\n\n![Ảnh minh họa](${imgUrl})\n\n💡 Ảnh này giúp cậu dễ hình dung hơn về sự kiện lịch sử!`;
        } catch (imgError) {
          console.error('Image generation failed:', imgError);
          assistantText = 'Xin lỗi, không thể tạo ảnh lúc này. Vui lòng thử lại. 🙏';
        }
      } else {
        try {
          console.log('🤖 Calling LLM with prompt length:', prompt.length);
          console.log('📋 Content Mode:', contentMode);

          const llmResult = await base44.integrations.Core.InvokeLLM({
            prompt: prompt,
            add_context_from_internet: contentMode === 'OPEN_SEARCH'
          });

          console.log('✅ LLM result type:', typeof llmResult);
          console.log('✅ LLM result:', llmResult);

          let body = '';
          if (typeof llmResult === 'string') {
            body = llmResult;
          } else if (llmResult?.text) {
            body = llmResult.text;
          } else if (llmResult?.content) {
            body = llmResult.content;
          } else if (llmResult?.message) {
            body = llmResult.message;
          } else if (llmResult?.response) {
            body = llmResult.response;
          } else if (llmResult?.choices?.[0]?.message?.content) {
            body = llmResult.choices[0].message.content;
          } else {
            console.warn('Unknown LLM response format:', llmResult);
            body = JSON.stringify(llmResult);
          }

          // ✅ Add lesson title for theory content
          if (body && messageType === 'text' && contentMode === 'STATIC_CONTENT') {
            if (lessonDoc) {
              let lessonNumber = lessonDoc.lesson_number || '';
              lessonNumber = lessonNumber.replace(/^Bài\s+/i, '').trim();
              if (!lessonNumber) {
                lessonNumber = String(lessonDoc.lesson_number || '');
              }
              body = `# Bài ${lessonNumber} (Lớp ${lessonDoc.grade_level}): ${lessonDoc.title}\n\n${body}`;
            } else if (currentLessonContext) {
              let lessonNumber = currentLessonContext.lesson_number || currentLessonContext.lesson || '';
              lessonNumber = lessonNumber.replace(/^Bài\s+/i, '').trim();
              if (!lessonNumber) {
                lessonNumber = String(currentLessonContext.lesson_number || currentLessonContext.lesson || '');
              }
              body = `# Bài ${lessonNumber} (Lớp ${currentLessonContext.grade_level || currentLessonContext.grade}): ${currentLessonContext.title}\n\n${body}`;
            }
          }

          // ✅ NEW: Add Google Drive link for exam prep
          const isExamPrep = normalizeText(trimmedContent).includes('on thi tot nghiep');
          if (isExamPrep && body) {
            body += `\n\n---\n\n💡 **Mách nhỏ bạn nè:** [Các đề ôn thi của mùa trước 📚](https://drive.google.com/drive/folders/14qqvmyHxovhDpv0XBUfgYwUonmUS7v2H)`;
          }

          assistantText = (body || '').trim() || 'Xin lỗi, chưa có câu trả lời. Vui lòng thử lại.';
        } catch (llmError) {
          console.error('LLM call failed:', llmError);
          assistantText = `Lỗi khi gọi LLM: ${llmError.message}`;
        }
      }

      // ✅ Create assistant message
      await createMessageMutation.mutateAsync({
        chat_id: targetChatId,
        content: assistantText,
        role: 'assistant',
        timestamp: new Date().toISOString(),
        message_type: messageType,
      });

    } catch (error) {
      console.error('Error in handleSendMessage:', error);

      if (targetChatId) {
        try {
          await createMessageMutation.mutateAsync({
            chat_id: targetChatId,
            content: `Xin lỗi, có lỗi xảy ra: ${error.message}`,
            role: 'assistant',
            timestamp: new Date().toISOString(),
            message_type: 'text',
          });
        } catch (saveError) {
          console.error('Failed to save error message:', saveError);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

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
        <div className={`sticky top-0 z-30 flex items-center justify-between px-4 py-3 border-b ${
          isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
        }`}>
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
                    ? 'bg-blue-900/30 text-blue-300 border border-blue-700'
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
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
          <div className={`text-xs text-center p-2 ${isDarkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
            &copy; {new Date().getFullYear()} Trợ lí Lịch Sử.
            <br className="sm:hidden" />
            Vui lòng kiểm tra lại thông tin quan trọng.
          </div>
        </div>
      </div>
    </div>
  );
}
