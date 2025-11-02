
import React from 'react';
import { motion } from 'framer-motion';
import { Image, BookOpen, CheckSquare, FileText, Users, Lightbulb, FileCheck, BookMarked, FileCheck2, GraduationCap, ListChecks } from 'lucide-react'; // Added ListChecks

export default function QuickReplies({ onSelect, userRole, isDarkMode = false }) {
  console.log('QuickReplies rendered with:', { onSelect: !!onSelect, userRole });

  const studentActions = [
    {
      id: 'student-img',
      icon: Image,
      label: 'Tạo ảnh minh họa',
      prompt: 'Tạo ảnh minh họa',
      color: 'from-purple-500 to-pink-500'
    },
    {
      id: 'student-content',
      icon: BookOpen,
      label: 'Nội dung bài học',
      prompt: 'Giải thích cho tôi về',
      color: 'from-blue-500 to-cyan-500'
    },
    {
      id: 'student-flashcard',
      icon: FileText,
      label: 'Flashcards',
      prompt: 'Tạo 7 flashcards',
      color: 'from-yellow-500 to-orange-500'
    },
    {
      id: 'student-quiz-fc',
      icon: ListChecks,
      label: 'Tạo Quiz',
      prompt: 'Tạo quiz từ flashcards',
      color: 'from-indigo-500 to-purple-500'
    },
    {
      id: 'student-tf',
      icon: FileCheck2,
      label: 'Đúng - sai',
      prompt: 'Tạo 3 câu đúng-sai',
      color: 'from-teal-500 to-cyan-500'
    },
    {
      id: 'student-exam',
      icon: GraduationCap,
      label: 'Ôn thi tốt nghiệp THPT',
      prompt: 'Ôn thi tốt nghiệp THPT',
      color: 'from-rose-500 to-red-500'
    },
  ];

  const teacherActions = [
    {
      id: 'teacher-plan',
      icon: FileCheck,
      label: 'Kế hoạch bài dạy',
      prompt: 'Thiết kế kế hoạch bài dạy',
      color: 'from-indigo-500 to-purple-600'
    },
    {
      id: 'teacher-method',
      icon: Users,
      label: 'Gợi ý phương pháp dạy',
      prompt: 'Gợi ý phương pháp dạy học',
      color: 'from-blue-500 to-indigo-500'
    },
    {
      id: 'teacher-content',
      icon: BookMarked,
      label: 'Nội dung bài học',
      prompt: 'Phân tích nội dung bài học',
      color: 'from-teal-500 to-cyan-500'
    },
    {
      id: 'teacher-reference',
      icon: Lightbulb,
      label: 'Nguồn tham khảo',
      prompt: 'Gợi ý nguồn tham khảo',
      color: 'from-amber-500 to-orange-500'
    },
  ];

  const actions = userRole === 'student' ? studentActions : teacherActions;

  const handleClick = (e, prompt) => {
    e.preventDefault();
    e.stopPropagation();

    console.log('🎯 QuickReplies button clicked!');
    console.log('📝 Prompt:', prompt);
    console.log('🔧 onSelect exists:', !!onSelect);
    console.log('🔧 onSelect type:', typeof onSelect);

    if (onSelect && typeof onSelect === 'function') {
      console.log('✅ Calling onSelect with:', prompt);
      onSelect(prompt);
    } else {
      console.error('❌ onSelect is not a function!', onSelect);
    }
  };

  return (
    <div className="w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3"
      >
        {actions.map((action, index) => (
          <motion.button
            key={action.id}
            type="button"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              delay: Math.min(index * 0.05, 0.3),
              duration: 0.2
            }}
            onClick={(e) => handleClick(e, action.prompt)}
            className={`flex flex-col items-center gap-2 p-3 sm:p-4 rounded-xl border transition-all hover:scale-105 active:scale-95 cursor-pointer ${
              isDarkMode
                ? 'border-gray-600 bg-gray-700/50 hover:bg-gray-600'
                : 'border-gray-200 bg-white/50 hover:bg-white hover:shadow-md'
            }`}
            style={{ pointerEvents: 'auto' }}
          >
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br ${action.color} flex items-center justify-center shadow-md`}>
              <action.icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <span className={`text-xs sm:text-sm text-center font-medium leading-tight ${
              isDarkMode ? 'text-gray-200' : 'text-gray-700'
            }`}>
              {action.label}
            </span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
