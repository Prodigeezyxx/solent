export type AgentRole =
  | 'ATLAS' | 'SCRIBE' | 'ORACLE' | 'HERMES' | 'HUNTER' | 'MUSE'
  | 'VAULT' | 'FORGE' | 'LEDGER' | 'CIRCLE' | 'JUDGE' | 'GHOST' | 'CONDUCTOR';

export interface Agent {
  id: AgentRole;
  name: string;
  job: string;
  color: string;
  status: 'idle' | 'working' | 'alert';
}

export type Mode = 'FOCUS' | 'COMMAND' | 'RECEIVE' | 'DEEP' | 'PERFORMANCE';

export interface Message {
  id: string;
  sender: AgentRole | 'USER';
  content: string;
  timestamp: Date;
}
