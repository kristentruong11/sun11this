import React from 'react';
import { motion } from 'framer-motion';
import { Bot, User } from 'lucide-react';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';

export default function ChatMessage({ message, index, isDarkMode }) {
  const isUser = message.role === 'user';
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className={`flex gap-3 mb-6 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
        isUser 
          ? 'bg-gradient-to-br from-emerald-500 to-teal-600' 
          : 'bg-gradient-to-br from-indigo-500 to-purple-600'
      }`}>
        {isUser ? (
          <User className="w-5 h-5 text-white" />
        ) : (
          <Bot className="w-5 h-5 text-white" />
        )}
      </div>
      
      <div className={`flex flex-col max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`rounded-2xl px-5 py-3 backdrop-blur-sm ${
          isUser
            ? 'bg-gradient-to-br from-emerald-500/90 to-teal-600/90 text-white'
            : isDarkMode
              ? 'bg-gray-700/80 text-gray-100 shadow-lg border border-gray-600'
              : 'bg-white/80 text-gray-800 shadow-lg border border-gray-100'
        }`}>
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        </div>
        <span className={`text-xs mt-1 px-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          {format(new Date(message.timestamp), 'HH:mm')}
          {message.emotion && (
            <span className="ml-2">· Cảm xúc: {message.emotion}</span>
          )}
        </span>
      </div>
    </motion.div>
  );
}