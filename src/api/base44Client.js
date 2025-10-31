// src/api/base44Client.js
import { createCustomClient } from "@/lib/custom-sdk";

// Create a single app-wide client instance
const client = createCustomClient();

// Re-expose it under the old name so existing code keeps working
export const base44 = client;

// (Optional) quick self-check during dev:
if (typeof window !== "undefined") {
  console.log("[base44 shim] ready:", {
    hasEntities: !!base44?.entities,
    hasIntegrations: !!base44?.integrations?.Core,
  });
}
