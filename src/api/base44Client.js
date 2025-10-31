// src/api/base44Client.js
import { createClient } from "@supabase/supabase-js";
import { invokeLLM } from "@/lib/custom-sdk";

// — Supabase client (anon) —
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ---------- Entities (map to your existing tables) ----------
const Entities = {
  KnowledgeBase: {
    async list() {
      const { data, error } = await supabase
        .from("knowledge_base")
        .select("*")
        .order("id", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  },

  ChatHistory: {
    async list(orderBy = "-created_at") {
      const ascending = !orderBy.startsWith("-");
      const col = orderBy.replace("-", "");
      const { data, error } = await supabase
        .from("chat_history")
        .select("*")
        .order(col, { ascending })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    async create(row) {
      const { data, error } = await supabase.from("chat_history").insert(row).select().single();
      if (error) throw error;
      return data;
    },
    async update(id, patch) {
      const { data, error } = await supabase
        .from("chat_history")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    async delete(id) {
      const { error } = await supabase.from("chat_history").delete().eq("id", id);
      if (error) throw error;
      return { ok: true };
    },
  },

  // Your UI already wrote "Message -> chat_history", so map Message to the same table
  Message: {
    async list(orderBy = "timestamp", limit = 100) {
      const ascending = !orderBy.startsWith("-");
      const col = orderBy.replace("-", "");
      const q = supabase.from("chat_history").select("*").order(col, { ascending });
      const { data, error } = await (limit ? q.limit(limit) : q);
      if (error) throw error;
      return data || [];
    },
    async create(row) {
      const { data, error } = await supabase.from("chat_history").insert(row).select().single();
      if (error) throw error;
      return data;
    },
  },
};

// ---------- Integrations (ChatGPT + stubs for others) ----------
const Integrations = {
  Core: {
    // your real ChatGPT call
    InvokeLLM: (args) => invokeLLM(args),

    // keep image generation as a harmless stub for now
    GenerateImage: async ({ prompt }) => {
      console.warn("GenerateImage stub:", prompt);
      return { url: `https://picsum.photos/seed/${encodeURIComponent(prompt)}/1024/576` };
    },
  },
};

// ---------- Functions (if your code calls them; safe stub) ----------
const Functions = {
  historyAssistant: async (payload) => {
    // If your UI expects this, call InvokeLLM underneath
    const res = await Integrations.Core.InvokeLLM({
      prompt: payload?.prompt || "Giải thích ngắn gọn.",
      kbContext: payload?.kbContext || "",
    });
    return { content: res.content || "" };
  },
};

// ---------- Export a "base44" shape so existing imports keep working ----------
export const base44 = {
  entities: Entities,
  integrations: Integrations,
  functions: Functions,
  auth: {
    async getUser() {
      const { data } = await supabase.auth.getUser();
      return data?.user || null;
    },
  },
};
