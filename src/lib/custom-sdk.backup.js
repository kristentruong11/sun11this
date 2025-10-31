// /src/lib/custom-sdk.js
// Single source of truth for DB access. No direct createClient here.
// We reuse the singletons from supabase-client.js to avoid multiple GoTrue clients.
import { getSupabase, getSupabaseAdminSafe } from "./supabase-client.js";

// Cache the supabase clients (admin is null in browser)
const supabase = getSupabase();
const supabaseAdmin = getSupabaseAdminSafe();
// Top-level helper (NOT inside any object/return)

export async function invokeLLM({ prompt, messages, kbContext } = {}) {
  // normalize messages[]
  const msgs = Array.isArray(messages) && messages.length
    ? messages
    : (prompt ? [{ role: "user", content: prompt }] : []);

  // Avoid optional chaining on import.meta for older build pipelines
  const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;
  const base = isDev && typeof import.meta.env.VITE_API_BASE === "string"
    ? import.meta.env.VITE_API_BASE
    : "";

  const url = `${base}/api/chat`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: msgs, kbContext: kbContext || "" }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`LLM API failed: ${res.status} ${txt}`);
  }

  const data = await res.json();
  return { content: data.content || "" };
}




/* -------------------------------- Utilities -------------------------------- */

function nowIso() {
  return new Date().toISOString();
}

/** App → DB column mapping (one function only, no duplicates) */
function mapFieldName(key) {
  const aliases = {
    // Timestamps (common)
    createdAt: "created_at",
    created_date: "created_at",
    updatedAt: "updated_at",
    updated_date: "updated_at",
    lastMessageAt: "last_message_at",

    // Chat payload your UI sends
    chatId: "chat_id",
    chat_id: "chat_id",
    content: "content",
    role: "role",
    timestamp: "timestamp", // keep quoted in SQL where needed
    message_type: "message_type",
    messageType: "message_type",

    // Legacy message fields
    userMessage: "user_message",
    user_message: "user_message",
    botReply: "bot_reply",
    bot_reply: "bot_reply",

    // Lesson context
    title: "title",
    lesson: "lesson",
    grade: "grade",
    kbId: "kb_id",
    kb_id: "kb_id",
    userId: "user_id",
    user_id: "user_id",
  };
  return aliases[key] || key;
}

function mapDataFields(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[mapFieldName(k)] = v;
  }
  return out;
}

function mapResultFields(data) {
  if (!data) return data;

  const reverse = {
    created_at: "created_date",
    updated_at: "updated_date",
    last_message_at: "lastMessageAt",

    chat_id: "chatId",
    message_type: "messageType",
    user_message: "userMessage",
    bot_reply: "botReply",
    kb_id: "kbId",
    user_id: "userId",
  };

  const mapOne = (row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      out[reverse[k] || k] = v;
    }
    return out;
  };

  return Array.isArray(data) ? data.map(mapOne) : mapOne(data);
}

/* ------------------------------- Base Entity ------------------------------- */

class CustomEntity {
  /**
   * @param {string} tableName - DB table
   * @param {boolean} useServiceRole - Prefer admin client when available
   */
  constructor(tableName, useServiceRole = false) {
    this.tableName = tableName;
    this.useServiceRole = useServiceRole;
  }

  /** Pick the client per call: admin if allowed & available, else anon */
  client() {
    if (this.useServiceRole && supabaseAdmin) return supabaseAdmin;
    return supabase;
  }

  /** SELECT * with ordering & limit */
  async list(orderBy = "created_at", limit = null) {
    let query = this.client().from(this.tableName).select("*");

    if (orderBy) {
      const desc = orderBy.startsWith("-");
      const col = desc ? mapFieldName(orderBy.slice(1)) : mapFieldName(orderBy);
      query = query.order(col, { ascending: !desc, nullsFirst: false });
    }
    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw error;
    return mapResultFields(data) || [];
  }

  /** SELECT with conditions (eq / in) + ordering + limit */
  async filter(conditions = {}, orderBy = "created_at", limit = null) {
    let query = this.client().from(this.tableName).select("*");

    for (const [k, v] of Object.entries(conditions || {})) {
      const col = mapFieldName(k);
      if (Array.isArray(v)) query = query.in(col, v);
      else query = query.eq(col, v);
    }

    if (orderBy) {
      const desc = orderBy.startsWith("-");
      const col = desc ? mapFieldName(orderBy.slice(1)) : mapFieldName(orderBy);
      query = query.order(col, { ascending: !desc, nullsFirst: false });
    }
    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) {
      console.error(`Filter error for ${this.tableName}:`, error);
      throw error;
    }
    return mapResultFields(data) || [];
  }

  /** SELECT one by id */
  async get(id) {
    const { data, error } = await this.client()
      .from(this.tableName)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapResultFields(data) : null;
  }

  /** INSERT one */
  async create(record = {}) {
    const payload = mapDataFields(record);
    // Debug: see actual payload
    console.log("📦 INSERT payload →", this.tableName, payload);

    const { data, error } = await this.client()
      .from(this.tableName)
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      console.error("❌ INSERT error →", error);
      throw error;
    }
    return mapResultFields(data);
  }

  /** UPDATE by id (adds updated_at automatically) */
  async update(id, patch = {}) {
    const payload = mapDataFields(patch);
    payload.updated_at = nowIso();

    const { data, error } = await this.client()
      .from(this.tableName)
      .update(payload)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("❌ UPDATE error →", error);
      throw error;
    }
    return data ? mapResultFields(data) : null;
  }

  /** DELETE by id */
  async delete(id) {
    const { error } = await this.client().from(this.tableName).delete().eq("id", id);
    if (error) throw error;
  }
}

/* --------------------------------- Auth/User -------------------------------- */

class UserEntity extends CustomEntity {
  constructor() {
    // Use service role when available (server), anon in browser
    super("users", true);
  }

  /** Get current auth user (from anon client) and sync to users table */
  async me() {
    // Use anon client for auth state
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth?.user) throw new Error("Not authenticated");

    const uid = auth.user.id;
    // Read via admin if available, else anon (RLS must permit)
    const db = this.client();

    const { data, error } = await db.from("users").select("*").eq("id", uid).maybeSingle();
    if (error) throw error;

    if (!data) {
      // Create a row for the auth user
      const newRow = {
        id: uid,
        email: auth.user.email,
        name: auth.user.user_metadata?.full_name || auth.user.email,
        role: auth.user.email === "dev@localhost.com" ? "admin" : "student",
        created_at: nowIso(),
      };
      const { data: created, error: createErr } = await db
        .from("users")
        .insert(newRow)
        .select("*")
        .single();
      if (createErr) throw createErr;
      return mapResultFields(created);
    }

    // Ensure dev user is admin (quality of life)
    if (auth.user.email === "dev@localhost.com" && data.role !== "admin") {
      const { data: updated, error: upErr } = await db
        .from("users")
        .update({ role: "admin", updated_at: nowIso() })
        .eq("id", uid)
        .select("*")
        .single();
      if (!upErr) return mapResultFields(updated);
    }

    return mapResultFields(data);
  }

  async login(provider = "dev") {
    if (provider === "dev") {
      const email = "dev@localhost.com";
      const password = "dev123456";

      // Try sign-in first
      let { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // Create & sign in
        const { error: signUpErr } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: "Development User", role: "admin" } },
        });
        if (signUpErr) throw signUpErr;

        const { error: signInErr2 } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInErr2) throw signInErr2;
      }
      // Refresh app state (optional)
      if (typeof window !== "undefined") window.location.reload();
      return;
    }

    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    if (oauthErr) throw oauthErr;
  }

  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  async isAuthenticated() {
    const { data, error } = await supabase.auth.getUser();
    if (error) return false;
    return !!data?.user;
  }

  async getCurrentUser() {
    try {
      return await this.me();
    } catch {
      return null;
    }
  }
}

/* ------------------------------ Entity Registry ----------------------------- */

function entityNameToTableName(entityName) {
  // Explicit mappings for your app
  const special = {
    Message: "chat_history",        // Base44 export → your chat table
    ChatHistory: "chat_history",
    KnowledgeBase: "knowledge_base",
    User: "users",
    Users: "users",
  };
  if (special[entityName]) return special[entityName];

  // Fallback: PascalCase → snake_case
  return entityName.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
}

function shouldUseServiceRole(entityName) {
  // Keep service role minimal — mostly admin-ish entities
  return ["user"].includes(entityName.toLowerCase());
}

function createEntitiesProxy() {
  const cache = new Map();
  return new Proxy(
    {},
    {
      get(_, name) {
        if (typeof name !== "string") return undefined;
        if (cache.has(name)) return cache.get(name);

        const table = entityNameToTableName(name);
        const useSR = shouldUseServiceRole(name);
        const entity = new CustomEntity(table, useSR);
        cache.set(name, entity);
        console.log(`Created entity: ${name} -> ${table} (service role: ${useSR})`);
        return entity;
      },
      has() {
        return true;
      },
      ownKeys() {
        return Array.from(cache.keys());
      },
    }
  );
}

/* ------------------------------ Public Factory ------------------------------ */

export function createCustomClient() {
  return {
    entities: createEntitiesProxy(),
    auth: new UserEntity(),

    // Stubs you can wire later
    functions: {
      verifyHcaptcha: async () => ({ success: true }),
    },
    integrations: {
      Core: {
        // AFTER (real)
// --- TOP-LEVEL, not inside any object ---
export async function invokeLLM({ prompt, messages, kbContext } = {}) {
  const msgs = Array.isArray(messages) && messages.length
    ? messages
    : (prompt ? [{ role: "user", content: prompt }] : []);

  const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;
  const base = isDev && typeof import.meta.env.VITE_API_BASE === "string"
    ? import.meta.env.VITE_API_BASE
    : "";

  const url = `${base}/api/chat`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: msgs, kbContext: kbContext || "" }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`LLM API failed: ${res.status} ${txt}`);
  }

  const data = await res.json();
  return { content: data.content || "" };
}


// keep Base44 shape if the rest of your app expects it
export const Integrations = {
  // ... somewhere LOWER in the file, inside your returned/assigned object:
Core: {
  // ✅ property referencing the top-level function (NO export here)
  InvokeLLM: (args) => invokeLLM(args),

  // keep your other props as properties:
  SendEmail: async ({ to, subject, body, from_name = "Peace Adventures" }) => {
    console.warn("SendEmail mock:", { to, subject, from_name, len: body?.length });
    return { status: "sent", message_id: `mock_${Date.now()}` };
  },
  UploadFile: async ({ file }) => {
    console.warn("UploadFile mock:", file?.name, file?.size, file?.type);
    return { file_url: `https://mock-storage.local/${Date.now()}_${file?.name || "file"}` };
  },
  GenerateImage: async ({ prompt }) => {
    console.warn("GenerateImage mock:", prompt);
    return { url: `https://mock-ai-images.local/${Date.now()}.png` };
  },
  ExtractDataFromUploadedFile: async ({ file_url, json_schema }) => {
    console.warn("ExtractDataFromUploadedFile mock:", { file_url, json_schema });
    return { status: "success", output: json_schema?.type === "array" ? [] : {} };
  },
},



// Default singleton-style export (optional)
export const customClient = createCustomClient();
