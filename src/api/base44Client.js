// src/api/base44Client.js
import { customClient } from "@/lib/custom-sdk";

// Recreate the old Base44-shaped client so existing imports keep working
export const base44 = customClient;
// (customClient already exposes: entities, auth, functions, integrations)
