import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GraduationCap, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function RoleSelector({ isOpen, onSelectRole, isDarkMode = false }) {
  const [selectedRole, setSelectedRole] = useState(null);

  // ✅ FIX: Validate onSelectRole prop
  const handleConfirm = useCallback(() => {
    if (!selectedRole) return;
    
    if (onSelectRole && typeof onSelectRole === 'function') {
      onSelectRole(selectedRole);
    } else {
      console.error('onSelectRole is not a function');
    }
  }, [selectedRole, onSelectRole]);

  // ✅ FIX: Handle ESC key to close (though no close handler provided)
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && !selectedRole) {
        // User must select a role, so we don't close
        console.log('Please select a role to continue');
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
  }, [isOpen, selectedRole]);

  // ✅ FIX: Focus trap - focus first button on mount
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const firstButton = document.querySelector('[data-role-button="student"]');
        if (firstButton) {
          firstButton.focus();
        }
      }, 100);
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="role-selector-title"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 20 }}
            className={`w-full max-w-md rounded-2xl p-6 ${
              isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white'
            } shadow-2xl`}
          >
            <div className="text-center mb-6">
              <h2 
                id="role-selector-title"
                className={`text-2xl font-bold mb-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
              >
                Chào mừng bạn! 👋
              </h2>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Vui lòng chọn vai trò của bạn để bắt đầu
              </p>
            </div>

            <div className="space-y-3 mb-6">
              <motion.button
                data-role-button="student"
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedRole('student')}
                className={`w-full p-4 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                  selectedRole === 'student'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-lg'
                    : isDarkMode
                      ? 'border-gray-600 bg-gray-700 hover:border-gray-500'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
                aria-label="Chọn vai trò học sinh"
                aria-pressed={selectedRole === 'student'}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                    <GraduationCap className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <h3 className={`font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                      Học sinh
                    </h3>
                    <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Học bài, quiz, flashcards, ảnh minh họa
                    </p>
                  </div>
                  {selectedRole === 'student' && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center"
                    >
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </motion.div>
                  )}
                </div>
              </motion.button>

              <motion.button
                data-role-button="teacher"
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedRole('teacher')}
                className={`w-full p-4 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                  selectedRole === 'teacher'
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 shadow-lg'
                    : isDarkMode
                      ? 'border-gray-600 bg-gray-700 hover:border-gray-500'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
                aria-label="Chọn vai trò giáo viên"
                aria-pressed={selectedRole === 'teacher'}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <h3 className={`font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                      Giáo viên
                    </h3>
                    <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Kế hoạch bài dạy, đề kiểm tra, phương pháp giảng dạy
                    </p>
                  </div>
                  {selectedRole === 'teacher' && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center"
                    >
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </motion.div>
                  )}
                </div>
              </motion.button>
            </div>

            <Button
              onClick={handleConfirm}
              disabled={!selectedRole}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white disabled:opacity-50 disabled:cursor-not-allowed h-12 text-base font-semibold transition-all duration-200"
              aria-label={selectedRole ? 'Bắt đầu với vai trò đã chọn' : 'Vui lòng chọn vai trò'}
            >
              {selectedRole ? 'Bắt đầu ngay! 🚀' : 'Chọn vai trò để tiếp tục'}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
