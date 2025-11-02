import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, GraduationCap } from "lucide-react";
import { motion } from "framer-motion";
import QuickActions from "./QuickActions";
import VoiceInput from "./VoiceInput";

export default function ChatInput({ onSendMessage, isLoading, isDarkMode, userRole }) {
  const [message, setMessage] = useState("");
  const [showQuickActions, setShowQuickActions] = useState(false);
  const textareaRef = useRef(null);

  // ✅ FIX: Auto-resize textarea with cleanup and bounds checking
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 200); // ✅ FIX: Max height cap
      textarea.style.height = newHeight + 'px';
    }
  }, [message]); // ✅ FIX: Added proper dependency

  // ✅ FIX: More comprehensive lesson prompt detection
  const isAskLessonPrompt = (prompt) => {
    if (!prompt || typeof prompt !== 'string') return false; // ✅ FIX: Added validation
    
    const normalized = prompt.toLowerCase().trim();
    
    const patterns = [
      /^gi[aả]i th[íi]ch cho t[ôo]i v[eề]/i,
      /^giai thich cho toi ve/i,
      /n[ộo]i dung b[àa]i h[oọ]c/i,
      /noi dung bai hoc/i,
      /^gi[aả]i th[íi]ch/i,
      /^h[oọ]c b[àa]i/i
    ];
    
    return patterns.some(pattern => pattern.test(normalized));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // ✅ FIX: Enhanced validation
    if (!message || typeof message !== 'string') return;
    
    const trimmed = message.trim();
    if (!trimmed || isLoading) return;
    
    // ✅ FIX: Validate onSendMessage exists
    if (onSendMessage && typeof onSendMessage === 'function') {
      onSendMessage(trimmed);
      setMessage("");
    } else {
      console.error('onSendMessage is not a function');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // ✅ FIX: Added validation and error handling
  const handleVoiceTranscript = (transcript) => {
    // ✅ FIX: Validate transcript
    if (!transcript || typeof transcript !== 'string') {
      console.warn('Invalid voice transcript:', transcript);
      return;
    }
    
    const txt = transcript.trim();
    if (!txt) return;
    
    // ✅ FIX: Validate onSendMessage exists before calling
    if (onSendMessage && typeof onSendMessage === 'function') {
      onSendMessage(txt);
      setMessage("");
    } else {
      console.error('onSendMessage is not a function');
    }
  };

  // ✅ FIX: Enhanced with proper cleanup
  const handleQuickAction = (prompt) => {
    // ✅ FIX: Validate prompt
    if (!prompt || typeof prompt !== 'string') {
      console.warn('Invalid quick action prompt:', prompt);
      return;
    }
    
    // If it's a lesson prompt, send immediately
    if (isAskLessonPrompt(prompt)) {
      if (onSendMessage && typeof onSendMessage === 'function') {
        onSendMessage(prompt);
        setShowQuickActions(false);
        setMessage("");
      }
      return;
    }
    
    // For other actions: populate the input
    setMessage(prompt);
    setShowQuickActions(false);
    
    // ✅ FIX: Use requestAnimationFrame for better timing
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        // ✅ FIX: Set cursor to end of text
        textareaRef.current.selectionStart = textareaRef.current.value.length;
        textareaRef.current.selectionEnd = textareaRef.current.value.length;
      }
    });
  };

  return (
    <>
      <QuickActions
        isOpen={showQuickActions}
        onClose={() => setShowQuickActions(false)}
        onSelect={handleQuickAction}
        userRole={userRole}
        isDarkMode={isDarkMode}
      />

      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        onSubmit={handleSubmit}
        className={`border-t p-3 sm:p-4 transition-colors duration-300 ${
          isDarkMode
            ? "border-gray-700 bg-gray-800/80"
            : "border-gray-200 bg-white/80"
        } backdrop-blur-xl`}
      >
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nhập tin nhắn..."
              disabled={isLoading}
              className={`min-h-[48px] max-h-[200px] resize-none rounded-2xl focus:ring-emerald-200 text-sm px-4 py-3 transition-colors duration-300 ${
                isDarkMode
                  ? "border-gray-600 bg-gray-700 text-gray-100 placeholder:text-gray-400 focus:border-emerald-500"
                  : "border-gray-200 focus:border-emerald-300"
              }`}
              rows={1}
              aria-label="Nhập tin nhắn"
            />

            <div className="flex gap-2 items-end">
              <Button
                type="button"
                onClick={() => setShowQuickActions(true)}
                variant="ghost"
                className={`h-12 w-12 rounded-full flex-shrink-0 transition-colors ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                }`}
                disabled={isLoading}
                title="Gợi ý nhanh"
                aria-label="Mở gợi ý nhanh"
              >
                <GraduationCap className="w-5 h-5" />
              </Button>

              <VoiceInput
                onTranscript={handleVoiceTranscript}
                disabled={isLoading}
                isDarkMode={isDarkMode}
              />

              <Button
                type="submit"
                disabled={!message.trim() || isLoading}
                className="h-12 w-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                title={isLoading ? "Đang gửi..." : "Gửi tin nhắn"}
                aria-label={isLoading ? "Đang gửi..." : "Gửi tin nhắn"}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </motion.form>
    </>
  );
}