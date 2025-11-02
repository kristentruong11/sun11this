// src/api/base44Client.js (shim)
import { createClient } from "@supabase/supabase-js";
import { invokeLLM } from "@/lib/custom-sdk";

export const base44 = {
  entities: { /* your Supabase wrappers */ },
  integrations: {
    Core: {
      InvokeLLM: (args) => invokeLLM(args),
      GenerateImage: async ({ prompt }) => ({ url: `https://picsum.photos/seed/${encodeURIComponent(prompt)}/1024/576` }),
    },
  },
  functions: {
    historyAssistant: async ({ prompt, kbContext }) =>
      invokeLLM({ prompt, kbContext }),
  },
};
