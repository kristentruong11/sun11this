import React from 'react';
import { motion } from 'framer-motion';
import { GraduationCap, BookOpen, RefreshCw } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function RoleSwitcher({ currentRole, onSwitch, isDarkMode = false }) {
  // ✅ FIX: Validate currentRole with fallback
  const roleConfig = {
    student: {
      icon: GraduationCap,
      label: 'Học sinh',
      color: 'from-emerald-500 to-teal-600'
    },
    teacher: {
      icon: BookOpen,
      label: 'Giáo viên',
      color: 'from-indigo-500 to-purple-600'
    }
  };

  // ✅ FIX: Handle invalid role
  if (!currentRole || !roleConfig[currentRole]) {
    console.error('Invalid role:', currentRole);
    return null;
  }

  const Icon = roleConfig[currentRole].icon;

  // ✅ FIX: Validate onSwitch before calling
  const handleSwitch = (newRole) => {
    if (onSwitch && typeof onSwitch === 'function') {
      // ✅ FIX: Add confirmation for role switch (optional - commented out)
      // if (window.confirm('Bạn có chắc muốn đổi vai trò? Cuộc trò chuyện hiện tại sẽ không bị mất.')) {
      onSwitch(newRole);
      // }
    } else {
      console.error('onSwitch is not a function');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
            isDarkMode
              ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
              : 'bg-white hover:bg-gray-50 text-gray-800 shadow-sm border border-gray-200'
          }`}
          aria-label="Chuyển đổi vai trò"
        >
          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${roleConfig[currentRole].color} flex items-center justify-center`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-medium hidden sm:inline">
            {roleConfig[currentRole].label}
          </span>
          <RefreshCw className="w-3 h-3 opacity-50" />
        </motion.button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
        <DropdownMenuItem
          onClick={() => handleSwitch('student')}
          className={`cursor-pointer ${currentRole === 'student' ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''}`}
          disabled={currentRole === 'student'}
        >
          <GraduationCap className="w-4 h-4 mr-2" />
          Học sinh
          {currentRole === 'student' && <span className="ml-auto text-xs text-emerald-600">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleSwitch('teacher')}
          className={`cursor-pointer ${currentRole === 'teacher' ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}
          disabled={currentRole === 'teacher'}
        >
          <BookOpen className="w-4 h-4 mr-2" />
          Giáo viên
          {currentRole === 'teacher' && <span className="ml-auto text-xs text-indigo-600">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}