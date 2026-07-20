export interface Env {
  DB: D1Database;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  APP_URL?: string;
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
