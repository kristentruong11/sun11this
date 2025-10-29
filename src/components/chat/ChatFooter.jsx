import React, { useEffect } from 'react';

export default function ChatFooter({ isDarkMode }) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // ✅ Check if footer already exists
    let footer = document.getElementById('b44-history-footer');
    
    if (!footer) {
      footer = document.createElement('div');
      footer.id = 'b44-history-footer';
      document.body.appendChild(footer);
    }
    
    footer.textContent = 'Trợ lí môn Lịch Sử có thể sai. Cần kiểm tra thông tin quan trọng!';
    
    // ✅ Add/update styles
    let styleEl = document.getElementById('b44-mobile-chat-fix');
    
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'b44-mobile-chat-fix';
      document.head.appendChild(styleEl);
    }
    
    styleEl.textContent = `
      /* Footer warning */
      #b44-history-footer {
        position: fixed;
        bottom: 0;
        left: 0;
        width: 100%;
        padding: 6px 12px;
        text-align: center;
        font-size: 12.5px;
        font-style: italic;
        border-top: 1px solid rgba(0,0,0,0.25);
        background: rgba(255,255,255,0.85);
        color: #333;
        z-index: 9999;
        pointer-events: none;
        backdrop-filter: saturate(140%) blur(4px);
      }
      
      @media (prefers-color-scheme: dark) {
        #b44-history-footer {
          background: rgba(0,0,0,0.65);
          color: #ccc;
          border-top-color: #444;
        }
      }
      
      /* Mobile layout fixes */
      html, body {
        overflow-x: hidden !important;
      }
      
      .chat-scroll-area,
      [data-chat-scroll],
      .messages,
      .chat-body,
      .overflow-y-auto {
        overflow-y: auto;
        overflow-x: hidden;
        padding-bottom: 80px !important;
        box-sizing: border-box;
      }
      
      .message-bubble,
      .markdown-content,
      .chat-message,
      .message-body,
      .prose {
        max-width: 100%;
        word-wrap: break-word;
        overflow-wrap: break-word;
        white-space: pre-wrap;
        box-sizing: border-box;
      }
      
      .markdown-content a,
      .prose a {
        display: inline-block;
        max-width: 100%;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      
      .markdown-content img,
      .markdown-content iframe,
      .prose img,
      .prose iframe {
        max-width: 100%;
        height: auto;
        border-radius: 6px;
      }
      
      @media (max-width: 640px) {
        .message-bubble,
        .chat-message {
          padding: 10px 14px;
          margin: 8px;
          border-radius: 12px;
          line-height: 1.5;
        }
        
        /* Extra padding for mobile to avoid footer overlap */
        .chat-scroll-area,
        [data-chat-scroll],
        .overflow-y-auto {
          padding-bottom: 100px !important;
        }
      }
    `;
    
    // ✅ Cleanup on unmount
    return () => {
      const footerEl = document.getElementById('b44-history-footer');
      if (footerEl) {
        footerEl.remove();
      }
    };
  }, [isDarkMode]);
  
  return null; // This component only manages DOM
}