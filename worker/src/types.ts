export interface Env {
  DB: D1Database;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  APP_URL?: string;
  // Connector secrets (optional; can also be set at runtime via /api/settings)
  PUMBLE_API_KEY?: string;
  PUMBLE_CHANNELS?: string;
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  ZOHO_CLIENT_ID?: string;
  ZOHO_CLIENT_SECRET?: string;
  ZOHO_REFRESH_TOKEN?: string;
  ZOHO_ACCOUNT_ID?: string;
  ZOHO_DC?: string;
  BRIEF_TTL_MINUTES?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'agent';
  agent?: string;
  content: string;
}

export interface ToolCallResult {
  agent: string;
  action: string;
  detail: string;
}
