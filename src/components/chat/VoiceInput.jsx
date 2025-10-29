import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function VoiceInput({ onTranscript, disabled, isDarkMode }) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [status, setStatus] = useState("");
  const [permissionDenied, setPermissionDenied] = useState(false);

  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const hasSpokenRef = useRef(false);
  const shouldBeRecordingRef = useRef(false);
  const isRestartingRef = useRef(false);
  const mediaStreamRef = useRef(null); // ✅ FIX: Track media stream for cleanup

  // ✅ FIX: Memoized mobile detection with proper cleanup
  useEffect(() => {
    const checkMobile = () =>
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      window.innerWidth < 768;

    setIsMobile(checkMobile());
    
    const handleResize = () => setIsMobile(checkMobile());
    window.addEventListener("resize", handleResize);
    
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // ✅ FIX: Enhanced Speech Recognition setup with better error handling
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      console.warn("Web Speech API not supported in this browser.");
      setStatus("Trình duyệt không hỗ trợ nhận diện giọng nói.");
      return;
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "vi-VN";
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setStatus(isMobile ? "Đang nghe... (nhả ra để gửi)" : "Đang nghe...");
      isRestartingRef.current = false;
    };

    rec.onresult = (event) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const part = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += part + " ";
          hasSpokenRef.current = true;
        } else {
          interimTranscript += part;
        }
      }

      const newText = (finalTranscript || interimTranscript).trim();
      if (newText) setTranscript(newText);

      // ✅ FIX: Clear previous timer before setting new one
      if (!isMobile && hasSpokenRef.current) {
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        
        silenceTimerRef.current = setTimeout(() => {
          if (shouldBeRecordingRef.current) {
            stopRecording();
          }
        }, 2000);
      }
    };

    rec.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      
      // ✅ FIX: More comprehensive error handling
      switch (event.error) {
        case "not-allowed":
        case "permission-denied":
          setStatus("⚠️ Không có quyền microphone");
          setPermissionDenied(true);
          stopRecording();
          break;
        case "no-speech":
          if (!isRestartingRef.current) {
            setStatus("Không phát hiện âm thanh.");
          }
          break;
        case "audio-capture":
          setStatus("Không tìm thấy thiết bị ghi âm.");
          stopRecording();
          break;
        case "aborted":
          // ✅ FIX: Ignore aborted errors during restart
          if (!isRestartingRef.current) {
            console.log("Recognition aborted:", event);
          }
          break;
        case "network":
          setStatus("Lỗi kết nối mạng.");
          break;
        default:
          if (!isRestartingRef.current) {
            setStatus(`Lỗi: ${event.error}`);
          }
      }
    };

    rec.onend = () => {
      // ✅ FIX: Better restart logic with error recovery
      if (shouldBeRecordingRef.current && !isRestartingRef.current) {
        isRestartingRef.current = true;
        
        // ✅ FIX: Add delay before restart to avoid rapid cycling
        setTimeout(() => {
          if (shouldBeRecordingRef.current) {
            try {
              rec.start();
            } catch (e) {
              console.error("Failed to restart recognition:", e);
              
              // ✅ FIX: Retry once more with longer delay
              setTimeout(() => {
                if (shouldBeRecordingRef.current) {
                  try { 
                    rec.start(); 
                  } catch (e2) {
                    console.error("Failed to restart recognition (retry):", e2);
                    stopRecording();
                  }
                }
              }, 500);
            }
          }
        }, 100);
      } else {
        setStatus("");
      }
    };

    recognitionRef.current = rec;

    // ✅ FIX: Comprehensive cleanup
    return () => {
      try {
        shouldBeRecordingRef.current = false;
        
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        
        if (rec) {
          rec.onstart = null;
          rec.onresult = null;
          rec.onerror = null;
          rec.onend = null;
          
          try { 
            rec.stop(); 
          } catch (e) {
            console.log("Recognition already stopped");
          }
        }
        
        // ✅ FIX: Clean up media stream
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => track.stop());
          mediaStreamRef.current = null;
        }
      } catch (error) {
        console.error("Cleanup error:", error);
      }
    };
  }, [isMobile]); // ✅ FIX: Added dependency

  // ✅ FIX: Memoized stopRecording to prevent recreation
  const stopRecording = useCallback(() => {
    shouldBeRecordingRef.current = false;

    if (recognitionRef.current) {
      try { 
        recognitionRef.current.stop(); 
      } catch (e) {
        console.log("Recognition already stopped");
      }
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    // ✅ FIX: Validate transcript before sending
    const trimmedTranscript = (transcript || '').trim();
    if (trimmedTranscript && onTranscript && typeof onTranscript === 'function') {
      onTranscript(trimmedTranscript);
    }

    // ✅ FIX: Clean up media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    setIsRecording(false);
    setStatus("");
    setTranscript("");
    hasSpokenRef.current = false;
  }, [transcript, onTranscript]); // ✅ FIX: Added dependencies

  const startRecording = async () => {
    if (disabled || permissionDenied) return;

    try {
      // ✅ FIX: Store media stream for cleanup
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      hasSpokenRef.current = false;
      shouldBeRecordingRef.current = true;
      isRestartingRef.current = false;

      const rec = recognitionRef.current;
      if (rec) {
        try {
          // Stop any existing recording first
          try { 
            rec.stop(); 
          } catch (e) {
            console.log("No active recognition to stop");
          }
          
          // ✅ FIX: Use requestAnimationFrame for better timing
          requestAnimationFrame(() => {
            try { 
              rec.start(); 
              setIsRecording(true);
              setTranscript("");
              setPermissionDenied(false);
            } catch (e) {
              console.error("Failed to start recognition:", e);
              setStatus("Không thể bắt đầu ghi âm. Vui lòng thử lại.");
              
              // ✅ FIX: Clean up on error
              shouldBeRecordingRef.current = false;
              if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach(track => track.stop());
                mediaStreamRef.current = null;
              }
            }
          });
        } catch (e) {
          console.error("Error preparing recording:", e);
          setStatus("Không thể khởi tạo ghi âm.");
          shouldBeRecordingRef.current = false;
        }
      } else {
        setStatus("Trình duyệt không hỗ trợ nhận diện giọng nói.");
        
        // ✅ FIX: Clean up stream if recognition not available
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => track.stop());
          mediaStreamRef.current = null;
        }
      }
    } catch (error) {
      console.error("Error accessing microphone:", error);
      
      // ✅ FIX: More specific error messages
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setStatus("⚠️ Không được cấp quyền microphone");
        setPermissionDenied(true);
      } else if (error.name === 'NotFoundError') {
        setStatus("⚠️ Không tìm thấy microphone");
      } else {
        setStatus("⚠️ Không thể truy cập microphone");
      }
      
      shouldBeRecordingRef.current = false;
    }
  };

  const handleClick = () => {
    if (!isMobile) {
      if (isRecording) {
        stopRecording();
      } else if (!disabled && !permissionDenied) {
        startRecording();
      }
    }
  };

  // ✅ FIX: Enhanced touch handlers with better event handling
  const handleTouchStart = (e) => {
    if (isMobile && !disabled && !isRecording && !permissionDenied) {
      e.preventDefault();
      startRecording();
    }
  };
  
  const handleTouchEnd = (e) => {
    if (isMobile && isRecording) {
      e.preventDefault();
      stopRecording();
    }
  };

  // ✅ FIX: Handle touch cancel (when user drags finger away)
  const handleTouchCancel = (e) => {
    if (isMobile && isRecording) {
      e.preventDefault();
      stopRecording();
    }
  };

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <AnimatePresence>
        {(isRecording || status) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            className={`flex items-center gap-1.5 px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-medium whitespace-nowrap ${
              permissionDenied 
                ? "bg-red-100 text-red-600"
                : isRecording 
                  ? "bg-emerald-100 text-emerald-700" 
                  : "bg-amber-100 text-amber-700"
            }`}
          >
            <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
              permissionDenied
                ? "bg-red-500"
                : isRecording 
                  ? "animate-pulse bg-emerald-500" 
                  : "bg-amber-500"
            }`} />
            {status || (isMobile ? "Nhấn giữ..." : "Đang nghe...")}
          </motion.div>
        )}
      </AnimatePresence>

      {permissionDenied && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-1 px-2 py-1 bg-red-50 rounded-lg"
        >
          <AlertCircle className="w-3 h-3 text-red-500" />
          <a 
            href="https://support.google.com/chrome/answer/2693767" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-[10px] text-red-600 underline hover:text-red-700"
          >
            Cấp quyền
          </a>
        </motion.div>
      )}

      <Button
        type="button"
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel} // ✅ FIX: Added touch cancel handler
        disabled={disabled || permissionDenied}
        title={
          permissionDenied 
            ? "Vui lòng cấp quyền microphone"
            : isMobile 
              ? "Nhấn giữ để nói" 
              : isRecording
                ? "Nhấn để dừng"
                : "Nhấn để bắt đầu, tự động dừng sau 2s im lặng"
        }
        aria-label={
          permissionDenied 
            ? "Cấp quyền microphone"
            : isMobile 
              ? "Nhấn giữ để ghi âm" 
              : isRecording
                ? "Dừng ghi âm"
                : "Bắt đầu ghi âm"
        }
        className={`h-12 w-12 sm:h-14 sm:w-14 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl flex-shrink-0 ${
          isRecording
            ? "bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 animate-pulse"
            : permissionDenied
              ? "bg-gradient-to-br from-red-400 to-red-500 opacity-50 cursor-not-allowed"
              : isDarkMode
                ? "bg-gradient-to-br from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800"
                : "bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
        }`}
      >
        {isRecording ? (
          <MicOff className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
        ) : (
          <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
        )}
      </Button>
    </div>
  );
}