
import React, { useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, MoreVertical, Trash2, Moon, Sun, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format, isValid, parseISO } from "date-fns"; // ✅ FIX: Added date validation

export default function ChatSidebar({ 
  chatHistories, 
  currentChatId, 
  onNewChat, 
  onSelectChat, 
  onDeleteChat,
  isDarkMode,
  onToggleDarkMode,
  isOpen,
  onToggle
}) {
  // ✅ FIX: Memoized handlers to prevent unnecessary re-renders
  const handleNewChatClick = useCallback(() => {
    if (onNewChat && typeof onNewChat === 'function') {
      onNewChat();
    }
    
    // ✅ FIX: Check window size safely
    if (typeof window !== 'undefined' && window.innerWidth < 1024 && onToggle) {
      onToggle();
    }
  }, [onNewChat, onToggle]);

  const handleChatSelect = useCallback((chatId) => {
    if (onSelectChat && typeof onSelectChat === 'function') {
      onSelectChat(chatId);
    }
    
    // ✅ FIX: Check window size safely
    if (typeof window !== 'undefined' && window.innerWidth < 1024 && onToggle) {
      onToggle();
    }
  }, [onSelectChat, onToggle]);

  const handleDeleteClick = useCallback((e, chatId) => {
    e.stopPropagation();
    
    if (onDeleteChat && typeof onDeleteChat === 'function') {
      onDeleteChat(chatId);
    }
  }, [onDeleteChat]);

  // ✅ FIX: Safe date formatting with validation
  const formatChatDate = useCallback((dateString) => {
    if (!dateString) return '';
    
    try {
      const date = typeof dateString === 'string' 
        ? parseISO(dateString)
        : new Date(dateString);
      
      if (!isValid(date)) {
        console.warn('Invalid date:', dateString);
        return '';
      }
      
      return format(date, 'dd/MM/yyyy');
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  }, []);

  // ✅ FIX: Safe backdrop click handler
  const handleBackdropClick = useCallback(() => {
    if (onToggle && typeof onToggle === 'function') {
      onToggle();
    }
  }, [onToggle]);

  // ✅ FIX: Validate chatHistories is an array
  const validChatHistories = Array.isArray(chatHistories) ? chatHistories : [];

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
            onClick={handleBackdropClick}
            aria-label="Đóng sidebar"
          />
        )}
      </AnimatePresence>

      {/* Sidebar - Always visible on desktop, sliding on mobile */}
      <div
        className={`fixed lg:relative top-0 left-0 h-full w-[280px] border-r flex flex-col z-50 transition-all duration-300 ${
          isDarkMode
            ? 'border-gray-700 bg-gray-800/95'
            : 'border-gray-200 bg-white/95'
        } backdrop-blur-sm ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Close button for mobile only */}
        <button
          onClick={handleBackdropClick}
          className={`lg:hidden absolute top-4 right-4 p-2 rounded-lg transition-colors ${
            isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
          }`}
          aria-label="Đóng sidebar"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-4">
          <Button
            onClick={handleNewChatClick}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md transition-all duration-200"
            aria-label="Tạo cuộc trò chuyện mới"
          >
            <Plus className="w-4 h-4 mr-2" />
            Cuộc trò chuyện mới
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-transparent">
          <div className="space-y-1">
            {validChatHistories.length === 0 ? (
              <div className={`text-center py-8 px-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Chưa có cuộc trò chuyện nào</p>
              </div>
            ) : (
              validChatHistories.map((chat, index) => {
                // ✅ FIX: Validate chat object
                if (!chat || !chat.id) return null;
                
                return (
                  <motion.div
                    key={chat.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ 
                      delay: Math.min(index * 0.05, 0.5), // ✅ FIX: Cap delay
                      duration: 0.2 
                    }}
                    className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all ${
                      currentChatId === chat.id
                        ? isDarkMode
                          ? 'bg-emerald-900/50 border border-emerald-700'
                          : 'bg-emerald-100 border border-emerald-300'
                        : isDarkMode
                          ? 'hover:bg-gray-700'
                          : 'hover:bg-gray-100'
                    }`}
                    onClick={() => handleChatSelect(chat.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate transition-colors duration-300 ${
                        isDarkMode ? 'text-gray-200' : 'text-gray-800'
                      }`}>
                        {chat.title || 'Cuộc trò chuyện'} {/* ✅ FIX: Fallback title */}
                      </p>
                      <p className={`text-xs transition-colors duration-300 ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        {formatChatDate(chat.created_at) || 'Không có ngày'} {/* ✅ FIX: Fallback date */}
                      </p>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <button 
                          className={`opacity-0 group-hover:opacity-100 p-1 rounded transition-all ${
                            isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-200'
                          }`}
                          aria-label="Menu tuỳ chọn"
                        >
                          <MoreVertical className={`w-4 h-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent 
                        align="end" 
                        className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}
                      >
                        <DropdownMenuItem
                          onClick={(e) => handleDeleteClick(e, chat.id)}
                          className="text-red-600 focus:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Xóa chat
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>

        <div className={`p-3 border-t space-y-2 transition-colors duration-300 ${
          isDarkMode ? 'border-gray-700' : 'border-gray-200'
        }`}>
          {/* Credit Box */}
          <div className={`px-3 py-2.5 rounded-lg transition-all duration-300 ${
            isDarkMode
              ? 'bg-gradient-to-br from-emerald-900/30 to-teal-900/30 border border-emerald-700/50'
              : 'bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200/50'
          }`}>
            <p className={`text-xs leading-relaxed transition-colors duration-300 ${
              isDarkMode ? 'text-emerald-200' : 'text-emerald-800'
            }`}>
              <span className="font-semibold">Ý tưởng và phát triển:</span>
              <br />
              Trương Thị Thu Trang - GV THPT Sơn Trà
            </p>
          </div>

          <button
            onClick={() => {
              if (onToggleDarkMode && typeof onToggleDarkMode === 'function') {
                onToggleDarkMode();
              }
            }}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg transition-all duration-300 ${
              isDarkMode
                ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
            aria-label={isDarkMode ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
          >
            <div className="flex items-center gap-2">
              {isDarkMode ? (
                <Sun className="w-4 h-4 text-yellow-400" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-500" />
              )}
              <span className="text-sm font-medium">
                {isDarkMode ? 'Chế độ sáng' : 'Chế độ tối'}
              </span>
            </div>
            
            <div className={`relative w-11 h-6 rounded-full transition-colors duration-300 ${
              isDarkMode ? 'bg-emerald-600' : 'bg-gray-300'
            }`}>
              <motion.div
                className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md"
                animate={{
                  x: isDarkMode ? 20 : 0
                }}
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 30
                }}
              />
            </div>
          </button>
        </div>
      </div>
    </>
  );
}
