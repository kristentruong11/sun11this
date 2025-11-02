import React, { useState, useCallback } from "react";
// If you already have askSmart wired, keep this import. Otherwise it's fine to remove.
import { askSmart } from "@/ai/api"; // <-- keep only if this exists in your project

/**
 * ChatInput
 * Props:
 *  - onSendMessage?: (text: string) => Promise<any> | any
 *  - isLoading?: boolean
 *  - isDarkMode?: boolean
 *  - userRole?: string
 */
export default function ChatInput({
  onSendMessage,
  isLoading = false,
  isDarkMode = false,
  userRole,
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const disabled = isLoading || pending;

  const runAskSmart = useCallback(async (text) => {
    // Optional: only if you actually use askSmart from "@/ai/api"
    try {
      const res = await askSmart(text);
      // Do something with res if needed (emit to parent, append to chat, etc.)
      // console.log("askSmart result:", res);
      return res;
    } catch (e) {
      console.error("askSmart failed:", e);
      throw e;
    }
  }, []);

  const send = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setPending(true);
    try {
      if (typeof onSendMessage === "function") {
        await onSendMessage(trimmed);
      } else {
        await runAskSmart(trimmed);
      }
      setMessage("");
    } catch (e) {
      // surfaced in console; add UI toast if you like
    } finally {
      setPending(false);
    }
  }, [message, onSendMessage, runAskSmart]);

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled) send();
    }
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 8,
        padding: 12,
        borderTop: isDarkMode ? "1px solid #223" : "1px solid #ddd",
        background: isDarkMode ? "#0f1525" : "#fff",
      }}
    >
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        rows={2}
        placeholder={userRole ? `Nhập tin nhắn (${userRole})…` : "Nhập tin nhắn…"}
        style={{
          resize: "none",
          width: "100%",
          padding: 12,
          borderRadius: 8,
          border: "1px solid #9993",
          outline: "none",
          background: isDarkMode ? "#0b1220" : "#f9fafb",
          color: isDarkMode ? "#e6f2ff" : "#111827",
          fontFamily: "system-ui, sans-serif",
        }}
      />
      <button
        onClick={send}
        disabled={disabled || !message.trim()}
        style={{
          padding: "0 16px",
          borderRadius: 8,
          border: "1px solid transparent",
          background: disabled ? "#94a3b8" : "#2563eb",
          color: "#fff",
          fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
          minWidth: 96,
        }}
        aria-label="Gửi"
      >
        {pending || isLoading ? "Đang gửi…" : "Gửi"}
      </button>
    </div>
  );
}
