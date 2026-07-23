export type AgentRole =
  | 'ATLAS' | 'SCRIBE' | 'ORACLE' | 'HERMES' | 'HUNTER' | 'MUSE'
  | 'VAULT' | 'FORGE' | 'LEDGER' | 'CIRCLE' | 'JUDGE' | 'GHOST' | 'CONDUCTOR';

export type AgentStatus = 'idle' | 'working' | 'alert';

export interface Agent {
  id: AgentRole;
  name: string;
  job: string;
  color: string;
  status: AgentStatus;
}

export type Mode = 'COMMAND' | 'FOCUS' | 'RECEIVE' | 'GRAPH' | 'DEEP' | 'PERFORMANCE';

export interface Message {
  id: string;
  sender: AgentRole | 'USER';
  content: string;
  timestamp: Date;
}

export interface Task {
  id: number;
  title: string;
  context: string;
  time: string;
  done: boolean;
  priority?: boolean;
}

export interface Signal {
  label: string;
  title: string;
  meta: string;
  score: string;
}

export interface Command {
  icon: string;
  label: string;
  hint: string;
  action: string;
}
