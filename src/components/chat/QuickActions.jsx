
import React, { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image, BookOpen, CheckSquare, FileText, Users, Lightbulb, FileCheck, BookMarked, ListChecks, FileCheck2, GraduationCap } from 'lucide-react';

export default function QuickActions({ isOpen, onClose, onSelect, userRole, isDarkMode = false }) {
  const studentActions = [
    { icon: Image, label: 'Tạo ảnh minh họa', prompt: 'Tạo ảnh minh họa' },
    { icon: BookOpen, label: 'Nội dung bài học', prompt: 'Giải thích cho tôi về' },
    { icon: FileText, label: 'Flashcards', prompt: 'Tạo 7 flashcards' },
    { icon: ListChecks, label: 'Tạo Quiz', prompt: 'Tạo quiz từ flashcards' },
    { icon: FileCheck2, label: 'Đúng - sai', prompt: 'Tạo 3 câu đúng-sai' },
    { icon: GraduationCap, label: 'Ôn thi tốt nghiệp THPT', prompt: 'Ôn thi tốt nghiệp THPT' },
  ];

  const teacherActions = [
    { icon: FileCheck, label: 'Kế hoạch bài dạy', prompt: 'Thiết kế kế hoạch bài dạy' },
    { icon: Users, label: 'Gợi ý phương pháp dạy', prompt: 'Gợi ý các kỹ thuật, phương pháp dạy học' },
    { icon: BookMarked, label: 'Nội dung bài học', prompt: 'Phân tích nội dung bài học' },
    { icon: FileText, label: 'Thiết kế bài tập', prompt: 'Thiết kế bài tập' },
    { icon: Lightbulb, label: 'Nguồn tham khảo', prompt: 'Gợi ý nguồn tham khảo' },
    { icon: BookOpen, label: 'Tóm tắt bài', prompt: 'Tóm tắt nội dung' },
  ];

  // ✅ FIX: Validate userRole
  const actions = (userRole === 'student' || userRole === 'teacher') 
    ? (userRole === 'student' ? studentActions : teacherActions)
    : [];

  // ✅ FIX: Handle ESC key to close
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        if (onClose && typeof onClose === 'function') {
          onClose();
        }
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
      // ✅ FIX: Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      window.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // ✅ FIX: Handle backdrop click properly
  const handleBackdropClick = useCallback((e) => {
    // Only close if clicking the backdrop itself, not its children
    if (e.target === e.currentTarget && onClose && typeof onClose === 'function') {
      onClose();
    }
  }, [onClose]);

  const handleKeyDown = useCallback((e, prompt) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (onSelect && typeof onSelect === 'function') {
        onSelect(prompt);
      }
    }
  }, [onSelect]);

  // ✅ FIX: Handle action select with validation
  const handleSelect = useCallback((prompt) => {
    if (onSelect && typeof onSelect === 'function') {
      onSelect(prompt);
    } else {
      console.error('onSelect is not a function');
    }
  }, [onSelect]);

  // ✅ FIX: Handle close with validation
  const handleClose = useCallback(() => {
    if (onClose && typeof onClose === 'function') {
      onClose();
    }
  }, [onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={handleBackdropClick}
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-actions-title"
        >
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl p-6 max-h-[80vh] overflow-y-auto scroll-smooth ${
              isDarkMode ? 'bg-gray-800' : 'bg-white'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 
                id="quick-actions-title"
                className={`text-lg font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
              >
                {userRole === 'student' ? '🎓 Học sinh' : userRole === 'teacher' ? '👨‍🏫 Giáo viên' : 'Gợi ý nhanh'}
              </h3>
              <button
                onClick={handleClose}
                className={`p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                  isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                }`}
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {actions.length === 0 ? (
              <p className={`text-center py-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Không có gợi ý nào
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {actions.map((action, index) => (
                  <motion.button
                    key={`action-${userRole}-${index}`} // ✅ FIX: More unique key
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ 
                      delay: Math.min(index * 0.05, 0.3),
                      duration: 0.2 
                    }}
                    onClick={() => handleSelect(action.prompt)}
                    onKeyDown={(e) => handleKeyDown(e, action.prompt)}
                    tabIndex={0}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all focus:ring-2 focus:ring-emerald-500 focus:outline-none hover:scale-105 active:scale-95 ${
                      isDarkMode
                        ? 'border-gray-600 bg-gray-700 hover:border-emerald-500 hover:bg-gray-600'
                        : 'border-gray-200 bg-white hover:border-emerald-500 hover:bg-emerald-50'
                    }`}
                    aria-label={action.label}
                  >
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
                      <action.icon className="w-5 h-5 text-white" />
                    </div>
                    <span className={`text-xs text-center font-medium leading-tight ${
                      isDarkMode ? 'text-gray-200' : 'text-gray-700'
                    }`}>
                      {action.label}
                    </span>
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
