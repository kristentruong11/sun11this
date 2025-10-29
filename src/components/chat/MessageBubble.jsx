
import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Bot, User } from "lucide-react";
import { format, isValid, parseISO } from "date-fns";
import ReactMarkdown from 'react-markdown';

function parseSuggestionsFromContent(text) {
  if (!text || typeof text !== 'string') return [];
  
  const lines = text.split('\n');
  const items = [];
  
  const re = /^\s*(\d+)\.\s*\*\*Bài\s+([0-9]+)\s*\(Lớp\s+([0-9?]+)\)\*\*\s*[—–-]\s*(.*)$/i;
  
  for (const ln of lines) {
    const m = ln.match(re);
    if (m) {
      const idx = Number(m[1]);
      const lesson = m[2];
      const grade = m[3];
      const title = m[4]?.trim() || '';
      
      if (idx && lesson && grade) {
        items.push({
          idx,
          lesson,
          grade,
          title,
          value: `Bài ${lesson} Lớp ${grade}`
        });
      }
    }
  }
  return items;
}

function detectLessonExplanation(text) {
  if (!text || typeof text !== 'string' || text.length < 50) return null;

  // Check if this is a quiz/test content - don't show bubbles for these
  const quizPatterns = [
    /Câu\s+\d+[\.:]?\s*[\n\r]/i,
    /Đáp án\s*[:：]\s*[A-D]/i,
    /\*\*Đáp án\*\*/i,
    /Chọn đáp án đúng/i,
    /Giải thích:/i
  ];
  
  const isQuiz = quizPatterns.some(pattern => pattern.test(text));
  const hasMultipleOptions = (text.match(/[abcd]\.\s+/gi) || []).length >= 4;
  
  if (isQuiz || hasMultipleOptions) return null;

  // First priority: Look for title patterns at the start
  const titlePatterns = [
    /^#\s+Bài\s+(\d+)\s*\(Lớp\s+(\d+)\)[:\s]*(.+?)(?:\n|$)/im,
    /\*\*Bài\s+(\d+)\s*\(Lớp\s+(\d+)\)\*\*[:\s]*(.+?)(?:\n|$)/im,
    /Bài\s+(\d+)\s*\(Lớp\s+(\d+)\)[:\s]*(.+?)(?:\n|$)/im
  ];
  
  for (const pattern of titlePatterns) {
    const match = text.match(pattern);
    if (match) {
      console.log('✅ Found lesson in content:', match[1], match[2], match[3]);
      return {
        lesson: match[1],
        grade: match[2],
        title: match[3].trim()
      };
    }
  }

  // Second priority: Check for explanation structure keywords
  const structureKeywords = [
    /Nguyên nhân/i,
    /Diễn biến/i,
    /Kết quả/i,
    /Ý nghĩa/i,
    /Bối cảnh/i,
    /Nội dung chính/i,
    /lịch sử/i
  ];
  
  const matchCount = structureKeywords.filter(regex => regex.test(text)).length;
  
  // If it has at least 2 structure keywords and mentions lesson, it's likely an explanation
  if (matchCount >= 2) {
    // Try to extract lesson info from anywhere in the text
    const anyLessonPattern = /(?:bài|Bài)\s+(\d+).*?(?:lớp|Lớp)\s+(\d+)/i;
    const match = text.match(anyLessonPattern);
    if (match) {
      console.log('✅ Found lesson from structure:', match[1], match[2]);
      return {
        lesson: match[1],
        grade: match[2],
        title: 'Bài học'
      };
    }
  }
  
  return null;
}

function cleanContent(text) {
  if (!text || typeof text !== 'string') return '';
  
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .trim();
}

function truncateTitle(title, maxLength = 50) { // Changed maxLength from 35 to 50
  if (!title || typeof title !== 'string') return '';
  return title.length > maxLength ? title.slice(0, maxLength) + '...' : title;
}

const MarkdownStyled = React.memo(({ children, isDarkMode }) => {
  const markdownComponents = useMemo(() => ({
    h1: (props) => {
      const className = `text-center font-extrabold mb-3 sm:mb-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'} text-xl sm:text-2xl`;
      return <h1 className={className} {...props} />;
    },
    h2: (props) => {
      const className = `mt-5 mb-3 text-lg sm:text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`;
      return <h2 className={className} {...props} />;
    },
    h3: (props) => {
      const className = `mt-4 mb-2 text-base sm:text-lg font-semibold tracking-tight ${isDarkMode ? 'text-emerald-300' : 'text-emerald-700'}`;
      return <h3 className={className} {...props} />;
    },
    p: (props) => {
      const className = `${isDarkMode ? 'text-gray-100/90' : 'text-gray-800'} leading-relaxed mb-2`;
      return <p className={className} {...props} />;
    },
    ul: (props) => {
      const className = `list-disc list-inside mb-3 space-y-1`;
      return <ul className={className} {...props} />;
    },
    ol: (props) => {
      const className = `list-decimal list-inside mb-3 space-y-1`;
      return <ol className={className} {...props} />;
    },
    li: (props) => {
      const className = `${isDarkMode ? 'text-gray-100/90' : 'text-gray-800'} leading-relaxed mb-1.5`;
      return <li className={className} {...props} />;
    },
    strong: (props) => {
      const className = `font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`;
      return <strong className={className} {...props} />;
    },
    em: (props) => {
      const className = `italic ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`;
      return <em className={className} {...props} />;
    },
    code: (props) => {
      const className = `${isDarkMode ? 'bg-gray-700 text-emerald-300' : 'bg-gray-100 text-emerald-700'} px-1.5 py-0.5 rounded text-sm font-mono`;
      return <code className={className} {...props} />;
    },
    pre: (props) => {
      const className = `${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'} p-3 rounded-lg overflow-x-auto mb-3`;
      return <pre className={className} {...props} />;
    },
    hr: (props) => {
      const className = `my-4 ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`;
      return <hr className={className} {...props} />;
    },
    a: (props) => {
      const className = `text-emerald-600 hover:text-emerald-700 underline`;
      return <a className={className} target="_blank" rel="noopener noreferrer" {...props} />;
    },
    img: (props) => {
      const className = `max-w-full h-auto rounded-lg my-3`;
      return <img className={className} {...props} alt={props.alt || 'Image'} />;
    },
  }), [isDarkMode]);

  if (!children) return null;

  return (
    <ReactMarkdown components={markdownComponents}>
      {children}
    </ReactMarkdown>
  );
});

MarkdownStyled.displayName = 'MarkdownStyled';

export default function MessageBubble({ message, isDarkMode, onQuickSelect, lessonContext, userRole }) { 
  // CRITICAL: All hooks MUST be called before any early returns
  const isUser = message?.role === "user";

  const cleanedContent = useMemo(() => 
    cleanContent(message?.content), 
    [message?.content]
  );

  const suggestions = useMemo(() => 
    !isUser ? parseSuggestionsFromContent(cleanedContent) : [], 
    [isUser, cleanedContent]
  );

  const lessonInfo = useMemo(() => {
    if (isUser) return null;
    
    // ✅ NEW: Prioritize passed lessonContext
    if (lessonContext) {
      console.log('✅ Using passed lesson context:', lessonContext);
      return lessonContext;
    }
    
    const info = detectLessonExplanation(cleanedContent);
    console.log('🔍 Detected lesson info:', info);
    return info;
  }, [isUser, cleanedContent, lessonContext]); 

  const taskBubbles = useMemo(() => {
    const fullTitle = lessonInfo?.title || "bài học này";
    const truncatedTitle = truncateTitle(fullTitle);
    
    // ✅ Different bubbles for student vs teacher
    if (userRole === 'teacher') {
      // Teacher-specific actions
      if (lessonInfo) {
        return [
          {
            key: 'plan',
            label: `Kế hoạch bài dạy về "${truncatedTitle}"`,
            prompt: () => `Thiết kế kế hoạch bài dạy về Bài ${lessonInfo.lesson} Lớp ${lessonInfo.grade}`
          },
          {
            key: 'method',
            label: `Phương pháp dạy "${truncatedTitle}"`,
            prompt: () => `Gợi ý phương pháp dạy học về Bài ${lessonInfo.lesson} Lớp ${lessonInfo.grade}`
          },
          {
            key: 'exercise',
            label: `Thiết kế bài tập về "${truncatedTitle}"`,
            prompt: () => `Thiết kế bài tập về Bài ${lessonInfo.lesson} Lớp ${lessonInfo.grade}`
          },
          {
            key: 'reference',
            label: `Nguồn tham khảo về "${truncatedTitle}"`,
            prompt: () => `Gợi ý nguồn tham khảo về Bài ${lessonInfo.lesson} Lớp ${lessonInfo.grade}`
          },
          {
            key: 'change',
            label: 'Chọn bài học khác',
            prompt: () => 'Giải thích cho tôi về '
          },
        ];
      } else {
        return [
          {
            key: 'plan',
            label: 'Kế hoạch bài dạy',
            prompt: () => 'Thiết kế kế hoạch bài dạy'
          },
          {
            key: 'method',
            label: 'Gợi ý phương pháp dạy',
            prompt: () => 'Gợi ý phương pháp dạy học'
          },
          {
            key: 'exercise',
            label: 'Thiết kế bài tập',
            prompt: () => 'Thiết kế bài tập'
          },
          {
            key: 'reference',
            label: 'Nguồn tham khảo',
            prompt: () => 'Gợi ý nguồn tham khảo'
          },
          {
            key: 'explain',
            label: 'Phân tích nội dung bài học',
            prompt: () => 'Phân tích nội dung bài học'
          },
        ];
      }
    }
    
    // Student actions (default)
    if (lessonInfo) {
      return [
        {
          key: 'fc7',
          label: `Tạo 7 flashcards về "${truncatedTitle}"`,
          prompt: () => `Tạo 7 flashcards về Bài ${lessonInfo.lesson} Lớp ${lessonInfo.grade}`
        },
        {
          key: 'quiz',
          label: `Tạo Quiz về "${truncatedTitle}"`, 
          prompt: () => `Tạo quiz từ flashcards về Bài ${lessonInfo.lesson} Lớp ${lessonInfo.grade}`
        },
        {
          key: 'img',
          label: `Tạo ảnh minh họa về "${truncatedTitle}"`,
          prompt: () => `Tạo ảnh minh họa về Bài ${lessonInfo.lesson} Lớp ${lessonInfo.grade}`
        },
        {
          key: 'tf3',
          label: `Tạo 3 câu đúng-sai về "${fullTitle}"`, 
          prompt: () => `Tạo 3 câu đúng-sai về Bài ${lessonInfo.lesson} Lớp ${lessonInfo.grade}`
        },
        {
          key: 'change',
          label: 'Chọn bài học khác',
          prompt: () => 'Giải thích cho tôi về '
        },
      ];
    } else {
      // Generic prompts khi không biết lesson cụ thể
      return [
        {
          key: 'fc7',
          label: 'Tạo 7 flashcards',
          prompt: () => 'Tạo 7 flashcards'
        },
        {
          key: 'quiz',
          label: 'Tạo Quiz', 
          prompt: () => 'Tạo quiz từ flashcards'
        },
        {
          key: 'img',
          label: 'Tạo ảnh minh họa',
          prompt: () => 'Tạo ảnh minh họa'
        },
        {
          key: 'tf3',
          label: 'Tạo 3 câu đúng-sai', 
          prompt: () => 'Tạo 3 câu đúng-sai'
        },
        {
          key: 'explain',
          label: 'Giải thích bài học',
          prompt: () => 'Giải thích cho tôi về '
        },
      ];
    }
  }, [lessonInfo, userRole]); 

  const isTaskResponse = useMemo(() => {
    if (isUser || !message?.message_type) return false;
    const taskTypes = ['quiz', 'flashcard', 'true_false', 'image'];
    return taskTypes.includes(message.message_type);
  }, [isUser, message?.message_type]);

  const getContextLessonInfo = useMemo(() => {
    if (lessonInfo) return lessonInfo;
    
    if (!cleanedContent) return null;
    
    // Try to extract lesson info from content even if detectLessonExplanation didn't find it
    const patterns = [
      /Bài\s+(\d+)\s*\(Lớp\s+(\d+)\)[:\s]*(.+?)(?:\n|$)/im,
      /\*\*Bài\s+(\d+)\s*\(Lớp\s+(\d+)\)\*\*/im,
      /#\s+Bài\s+(\d+)\s*\(Lớp\s+(\d+)\)/im,
      /(?:bài|Bài)\s+(\d+).*?(?:lớp|Lớp)\s+(\d+)/i
    ];
    
    for (const pattern of patterns) {
      const match = cleanedContent.match(pattern);
      if (match) {
        return {
          lesson: match[1],
          grade: match[2],
          title: match[3]?.trim() || 'Bài học'
        };
      }
    }
    
    return null;
  }, [lessonInfo, cleanedContent]);

  const formattedTime = useMemo(() => {
    try {
      if (!message?.timestamp) return '';
      
      const date = typeof message.timestamp === 'string' 
        ? parseISO(message.timestamp)
        : new Date(message.timestamp);
      
      if (!isValid(date)) {
        return '';
      }
      
      return format(date, "HH:mm");
    } catch (error) {
      console.error('Error formatting timestamp:', error);
      return '';
    }
  }, [message?.timestamp]);

  const shouldShowTaskBubbles = useMemo(() => {
    const show = !isUser && taskBubbles.length > 0;
    console.log('🎯 Should show task bubbles?', show, { isUser, taskBubbles: taskBubbles.length, lessonInfo });
    return show;
  }, [isUser, taskBubbles.length, lessonInfo]);

  // NOW we can do early return checks AFTER all hooks
  if (!message || typeof message !== 'object') {
    console.error('Invalid message prop:', message);
    return null;
  }

  const handleSelectLesson = async (lessonValue) => {
    if (!onQuickSelect || typeof onQuickSelect !== 'function') {
      console.warn('onQuickSelect is not a function');
      return;
    }

    if (!lessonValue || typeof lessonValue !== 'string') {
      console.warn('Invalid lessonValue:', lessonValue);
      return;
    }

    const match = lessonValue.match(/Bài\s+(\d+)\s+Lớp\s+(\d+)/i);
    if (!match) {
      onQuickSelect(lessonValue);
      return;
    }
    
    const lessonNum = match[1];
    const gradeLevel = match[2];
    const prompt = `Giải thích cho tôi về Bài ${lessonNum} Lớp ${gradeLevel}`;
    onQuickSelect(prompt);
  };

  const handleTaskSelect = (task) => {
    if (!onQuickSelect || typeof onQuickSelect !== 'function') {
      console.warn('onQuickSelect is not a function');
      return;
    }

    if (!task || typeof task.prompt !== 'function') {
      console.warn('Invalid task:', task);
      return;
    }

    try {
      const prompt = task.prompt();
      if (prompt && typeof prompt === 'string') {
        onQuickSelect(prompt);
      }
    } catch (error) {
      console.error('Error generating task prompt:', error);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`flex gap-2 sm:gap-3 mb-4 sm:mb-6 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      <div
        className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center ${
          isUser 
            ? "bg-gradient-to-br from-indigo-500 to-purple-600" 
            : "bg-gradient-to-br from-emerald-400 to-teal-500"
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
        ) : (
          <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
        )}
      </div>

      <div className={`flex flex-col max-w-[85%] sm:max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`px-3 sm:px-5 py-2 sm:py-3 rounded-2xl shadow-sm transition-colors duration-300 ${
            isUser
              ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-tr-sm"
              : isDarkMode
                ? "bg-gray-800/95 text-gray-100 rounded-tl-sm border border-gray-700"
                : "bg-white/95 text-gray-800 rounded-tl-sm border border-gray-100"
          }`}
        >
          <div className="text-sm sm:text-[15px] leading-relaxed break-words prose prose-sm max-w-none">
            <MarkdownStyled isDarkMode={isDarkMode}>
              {cleanedContent}
            </MarkdownStyled>

            {suggestions && suggestions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {suggestions.map((sug) => (
                  <button
                    key={`sug-${sug.idx}-${sug.lesson}-${sug.grade}`}
                    onClick={() => handleSelectLesson(sug.value)}
                    className={`px-3 py-1.5 rounded-full text-xs sm:text-sm border shadow-sm transition-all hover:scale-105 active:scale-95 ${
                      isDarkMode
                        ? 'bg-gray-700 hover:bg-gray-600 border-gray-600 text-gray-100'
                        : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-800'
                    }`}
                    title={`Chọn ${sug.value}`}
                    aria-label={`Chọn ${sug.value}`}
                  >
                    {`#${sug.idx} — Bài ${sug.lesson} (Lớp ${sug.grade})`}
                  </button>
                ))}
              </div>
            )}

            {shouldShowTaskBubbles && (
              <div className="mt-4 pt-4 border-t border-gray-300 dark:border-gray-600">
                <p className={`text-sm font-semibold mb-3 ${isDarkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
                  🎯 Bạn muốn làm gì tiếp theo?
                </p>
                <div className="flex flex-wrap gap-2">
                  {taskBubbles.map((task) => (
                    <button
                      key={task.key}
                      onClick={() => handleTaskSelect(task)}
                      className={`px-3 py-2 rounded-lg text-xs sm:text-sm border shadow-sm transition-all hover:scale-105 active:scale-95 ${
                        isDarkMode
                          ? 'bg-indigo-900/30 hover:bg-indigo-900/50 border-indigo-700 text-indigo-200'
                          : 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-800'
                      }`}
                      aria-label={task.label}
                    >
                      {task.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        
        {formattedTime && (
          <span className={`text-[10px] sm:text-xs mt-1 sm:mt-1.5 px-2 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-500' : 'text-gray-400'
          }`}>
            {formattedTime}
            {message.emotion && (
              <span className="ml-2">· {message.emotion}</span>
            )}
          </span>
        )}
      </div>
    </motion.div>
  );
}
