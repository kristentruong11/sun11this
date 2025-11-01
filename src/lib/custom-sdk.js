// src/lib/custom-sdk.js
// Single source of truth for app integrations and DB entities.
// - All LLM calls go through Vercel /api/chat (server-side, uses OPENAI_API_KEY).
// - DB access uses supabase-client singletons.

import { getSupabase, getSupabaseAdminSafe } from "@/lib/supabase-client";

// -------- LLM (Vercel API) ----------
export async function invokeLLM({ prompt, messages, kbContext } = {}) {
  const msgs = Array.isArray(messages) && messages.length
    ? messages
    : (prompt ? [{ role: "user", content: prompt }] : []);

  // Allow local dev override (optional)
  const base =
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    typeof import.meta.env.VITE_API_BASE === "string"
      ? import.meta.env.VITE_API_BASE
      : "";

  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: msgs, kbContext: kbContext || "" }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`LLM API failed: ${res.status} ${txt}`);
  }

  const data = await res.json();
  return { content: data?.content || "" };
}

// -------- Entities base class ----------
function nowIso() { return new Date().toISOString(); }

function mapFieldName(key) {
  const aliases = {
    createdAt: "created_at", created_date: "created_at",
    updatedAt: "updated_at", updated_date: "updated_at",
    lastMessageAt: "last_message_at",
    chatId: "chat_id", chat_id: "chat_id",
    messageType: "message_type", message_type: "message_type",
    userMessage: "user_message", botReply: "bot_reply",
    kbId: "kb_id", kb_id: "kb_id", userId: "user_id", user_id: "user_id",
    title: "title", lesson: "lesson", grade: "grade", content: "content",
    role: "role", timestamp: "timestamp",
  };
  return aliases[key] || key;
}
function mapDataFields(obj = {}) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[mapFieldName(k)] = v;
  return out;
}
function mapResultFields(data) {
  const reverse = {
    created_at: "created_date", updated_at: "updated_date",
    last_message_at: "lastMessageAt",
    chat_id: "chatId", message_type: "messageType",
    user_message: "userMessage", bot_reply: "botReply",
    kb_id: "kbId", user_id: "userId",
  };
  const mapOne = (row) => {
    const o = {};
    for (const [k, v] of Object.entries(row)) o[reverse[k] || k] = v;
    return o;
  };
  return Array.isArray(data) ? data.map(mapOne) : data ? mapOne(data) : data;
}

class CustomEntity {
  constructor(tableName, useServiceRole = false) {
    this.tableName = tableName;
    this.useServiceRole = useServiceRole;
  }
  client() {
    const admin = getSupabaseAdminSafe();
    return this.useServiceRole && admin ? admin : getSupabase();
  }
  async list(orderBy = "created_at", limit = null) {
    let q = this.client().from(this.tableName).select("*");
    if (orderBy) {
      const desc = orderBy.startsWith("-");
      const col = desc ? mapFieldName(orderBy.slice(1)) : mapFieldName(orderBy);
      q = q.order(col, { ascending: !desc, nullsFirst: false });
    }
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return mapResultFields(data) || [];
  }
  async filter(conditions = {}, orderBy = "created_at", limit = null) {
    let q = this.client().from(this.tableName).select("*");
    for (const [k, v] of Object.entries(conditions || {})) {
      const col = mapFieldName(k);
      q = Array.isArray(v) ? q.in(col, v) : q.eq(col, v);
    }
    if (orderBy) {
      const desc = orderBy.startsWith("-");
      const col = desc ? mapFieldName(orderBy.slice(1)) : mapFieldName(orderBy);
      q = q.order(col, { ascending: !desc, nullsFirst: false });
    }
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return mapResultFields(data) || [];
  }
  async get(id) {
    const { data, error } = await this.client()
      .from(this.tableName).select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? mapResultFields(data) : null;
  }
  async create(record = {}) {
    const payload = mapDataFields(record);
    const { data, error } = await this.client()
      .from(this.tableName).insert(payload).select("*").single();
    if (error) throw error;
    return mapResultFields(data);
  }
  async update(id, patch = {}) {
    const payload = mapDataFields(patch);
    payload.updated_at = nowIso();
    const { data, error } = await this.client()
      .from(this.tableName).update(payload).eq("id", id).select("*").maybeSingle();
    if (error) throw error;
    return data ? mapResultFields(data) : null;
  }
  async delete(id) {
    const { error } = await this.client().from(this.tableName).delete().eq("id", id);
    if (error) throw error;
  }
}

class UserEntity extends CustomEntity {
  constructor() { super("users", true); }
  async me() {
    const sb = getSupabase();
    const { data: auth } = await sb.auth.getUser();
    if (!auth?.user) throw new Error("Not authenticated");
    const uid = auth.user.id;
    const db = this.client();
    const { data } = await db.from("users").select("*").eq("id", uid).maybeSingle();
    if (!data) {
      const newRow = {
        id: uid, email: auth.user.email,
        name: auth.user.user_metadata?.full_name || auth.user.email,
        role: auth.user.email === "dev@localhost.com" ? "admin" : "student",
        created_at: nowIso(),
      };
      const { data: created, error: ce } = await db.from("users").insert(newRow).select("*").single();
      if (ce) throw ce;
      return mapResultFields(created);
    }
    return mapResultFields(data);
  }
  async login(provider = "dev") {
    const sb = getSupabase();
    if (provider === "dev") {
      const email = "dev@localhost.com";
      const password = "dev123456";
      let { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        const { error: signUpErr } = await sb.auth.signUp({
          email, password, options: { data: { full_name: "Development User", role: "admin" } },
        });
        if (signUpErr) throw signUpErr;
        const { error: signIn2 } = await sb.auth.signInWithPassword({ email, password });
        if (signIn2) throw signIn2;
      }
      if (typeof window !== "undefined") window.location.reload();
      return;
    }
    await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
  }
  async logout() { await getSupabase().auth.signOut(); }
  async isAuthenticated() {
    const { data } = await getSupabase().auth.getUser();
    return !!data?.user;
  }
  async getCurrentUser() { try { return await this.me(); } catch { return null; } }
}

function entityNameToTableName(name) {
  const special = { Message: "chat_history", ChatHistory: "chat_history", KnowledgeBase: "knowledge_base", User: "users", Users: "users" };
  if (special[name]) return special[name];
  return name.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
}

function shouldUseServiceRole(name) {
  return ["user"].includes(name.toLowerCase());
}

function createEntitiesProxy() {
  const cache = new Map();
  return new Proxy({}, {
    get(_, n) {
      const name = String(n);
      if (cache.has(name)) return cache.get(name);
      const table = entityNameToTableName(name);
      const useSR = shouldUseServiceRole(name);
      const e = new CustomEntity(table, useSR);
      cache.set(name, e);
      console.log(`Created entity: ${name} -> ${table} (service role: ${useSR})`);
      return e;
    },
  });
}

export function createCustomClient() {
  return {
    entities: createEntitiesProxy(),
    auth: new UserEntity(),
    functions: {
      // Ensure this exists for src/api/functions.js
      historyAssistant: async ({ messages, kbContext }) => {
        const { content } = await invokeLLM({ messages, kbContext });
        return { content };
      },
      verifyHcaptcha: async () => ({ success: true }),
    },
    integrations: {
      Core: {
        InvokeLLM: (args) => invokeLLM(args),
      },
    },
  };
}

// Default instance
export const customClient = createCustomClient();
