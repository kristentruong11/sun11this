import { createClient } from '@base44/sdk';
// import { getAccessToken } from '@base44/sdk/utils/auth-utils';

// Create a client with authentication required
export const base44 = createClient({
  appId: "6901c4a16bf034491b253b78", 
  requiresAuth: true // Ensure authentication is required for all operations
});
