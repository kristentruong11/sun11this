
import React from 'react';
import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import QuickReplies from './QuickReplies';

export default function EmptyState({ isDarkMode, userRole, onQuickReply }) {
  console.log('EmptyState rendered with:', { 
    onQuickReply: !!onQuickReply, 
    userRole,
    onQuickReplyType: typeof onQuickReply 
  });

  const handleQuickReply = (prompt) => {
    console.log('🎯 EmptyState handleQuickReply called with:', prompt);
    console.log('🔧 onQuickReply exists:', !!onQuickReply);
    console.log('🔧 onQuickReply type:', typeof onQuickReply);
    
    if (onQuickReply && typeof onQuickReply === 'function') {
      console.log('✅ Calling parent onQuickReply');
      onQuickReply(prompt);
    } else {
      console.error('❌ onQuickReply is not a function!');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 text-center"
    >
      <motion.div
        animate={{ 
          rotate: [0, 5, 0, -5, 0],
          scale: [1, 1.05, 1]
        }}
        transition={{ 
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
          repeatDelay: 1
        }}
        className="w-16 h-16 sm:w-20 sm:h-20 mb-4 sm:mb-6 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 rounded-3xl flex items-center justify-center shadow-2xl"
      >
        <BookOpen className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
      </motion.div>
      
      <h2 className="text-2xl sm:text-3xl font-bold mb-2 sm:mb-3 bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
        Trợ lí môn Lịch Sử
      </h2>
      <p className={`mb-6 sm:mb-8 max-w-md text-sm sm:text-base ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
        Khám phá quá khứ, chạm đến tương lai!
      </p>

      <div className="w-full max-w-3xl mb-6">
        <h3 className={`text-sm sm:text-base font-semibold mb-3 sm:mb-4 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
          {userRole === 'student' ? '🎓 Tính năng cho học sinh' : '👨‍🏫 Tính năng cho giáo viên'}
        </h3>
        <QuickReplies 
          onSelect={handleQuickReply}
          userRole={userRole}
          isDarkMode={isDarkMode}
        />
      </div>

      <div className={`mt-4 sm:mt-6 p-3 sm:p-4 rounded-lg max-w-md ${isDarkMode ? 'bg-gray-700/50' : 'bg-emerald-50'}`}>
        <p className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          💡 <strong>Mẹo:</strong> {userRole === 'student' 
            ? 'Hỏi "trắc nghiệm bài X lớp Y" để luyện tập từ ngân hàng câu hỏi'
            : 'Hỏi "gợi ý phương pháp dạy bài X" để nhận kỹ thuật dạy học hiệu quả'}
        </p>
      </div>
    </motion.div>
  );
}
