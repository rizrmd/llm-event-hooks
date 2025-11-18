// Core Type Definitions for LLM Event Hooks
// Based on data-model.md and API contracts

// Hook System Types
export type HookEvent =
  | 'message:before'
  | 'message:after'
  | 'chunk:before'
  | 'chunk:after'
  | 'buffer:flush'
  | 'tool:before'
  | 'tool:after'
  | 'tool:loop:before'
  | 'tool:loop:after'
  | 'error'
  | 'session:start'
  | 'session:end';

export interface HookFunction<T = any> {
  (data: T, context: EventContext): Promise<T | void> | T | void;
  priority?: number;
}

export interface HookRegistration {
  event: HookEvent;
  hook: HookFunction;
  priority: number;
  id: string;
}

// Message and Conversation Types
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface ConversationHistory {
  id: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface MessageEvent {
  message: Message;
  direction: 'outgoing' | 'incoming';
  context: EventContext;
}

// Streaming and Buffering Types
export interface ChunkEvent {
  chunk: string;
  sequence: number;
  timestamp: Date;
  buffer: BufferState;
  context: EventContext;
}

export interface BufferConfig {
  maxSize?: number;
  maxTime?: number;
  strategy?: 'size' | 'time' | 'hybrid';
}

export interface BufferState {
  size: number;
  chunks: string[];
  createdAt: Date;
  lastFlush?: Date;
  strategy: BufferConfig['strategy'];
}

export interface BufferFlushEvent {
  chunks: string[];
  flushReason: 'size' | 'time' | 'manual' | 'completion';
  duration: number;
  context: EventContext;
}

// Tool System Types
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  handler: ToolHandler;
}

export interface ToolHandler {
  (params: Record<string, any>, context: EventContext): Promise<ToolResult>;
}

export interface ToolEvent {
  tool: string;
  parameters: Record<string, any>;
  result?: ToolResult;
  error?: Error;
  executionTime?: number;
  context: EventContext;
}

export interface ToolLoopEvent {
  tools: Tool[];
  decision: ToolDecision;
  context: EventContext;
}

export interface ToolDecision {
  selectedTool?: string;
  parameters?: Record<string, any>;
  reasoning?: string;
  confidence?: number;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTime: number;
}

// Event Context
export interface EventContext {
  // Immutable context
  conversationId: string;
  messageId?: string;
  sessionId: string;
  timestamp: Date;
  eventType: HookEvent;
  metadata: Record<string, any>;

  // Modifiable context (for hooks)
  systemContext: Record<string, any>;
  availableTools: Tool[];
  conversationState: Record<string, any>;
  userContext?: Record<string, any>;
}

// Core Execution Types
export interface HookableLLMConfig {
  apiKey: string;
  model?: string;
  persistence?: PersistenceAdapter;
  bufferConfig?: BufferConfig;
  maxConcurrency?: number;
}

export interface RunOptions {
  stream?: boolean;
  tools?: Tool[];
  systemContext?: Record<string, any>;
  maxTokens?: number;
  temperature?: number;
  conversationId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface RunResult {
  message: Message;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
  executionTime: number;
  conversationId: string;
  sessionId: string;
}

export interface ChunkResult {
  content: string;
  isComplete: boolean;
  sequence: number;
  metadata?: Record<string, any>;
}

export interface ToolCall {
  id: string;
  tool: string;
  parameters: Record<string, any>;
  result?: ToolResult;
}

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

// Persistence Types
export interface PersistenceAdapter {
  saveConversation(history: ConversationHistory): Promise<void>;
  loadConversation(id: string): Promise<ConversationHistory | null>;
  deleteConversation(id: string): Promise<void>;
  listConversations(): Promise<string[]>;
}

export interface SessionData {
  id: string;
  conversationId: string;
  userId?: string;
  systemContext?: Record<string, any>;
  createdAt: Date;
  lastActivity: Date;
}

// Error Types
export class HookableLLMError extends Error {
  constructor(message: string, public code: string, public context?: any);
  override name = 'HookableLLMError';
}

export class HookExecutionError extends HookableLLMError {
  constructor(message: string, public hookEvent: HookEvent, public hookId: string) {
    super(message, 'HOOK_EXECUTION_ERROR');
    this.name = 'HookExecutionError';
  }
}

export class BufferError extends HookableLLMError {
  constructor(message: string, public bufferState: BufferState) {
    super(message, 'BUFFER_ERROR');
    this.name = 'BufferError';
  }
}

export class ToolExecutionError extends HookableLLMError {
  constructor(message: string, public toolName: string, public parameters: Record<string, any>) {
    super(message, 'TOOL_EXECUTION_ERROR');
    this.name = 'ToolExecutionError';
  }
}

export class PersistenceError extends HookableLLMError {
  constructor(message: string, public operation: string) {
    super(message, 'PERSISTENCE_ERROR');
    this.name = 'PersistenceError';
  }
}

// Utility Types
export type ErrorMessageHookData = {
  error: Error;
  eventType?: HookEvent;
  context?: EventContext;
  recoverable: boolean;
  suggestion?: string;
};

export type PerfomanceMetrics = {
  messageCount: number;
  totalExecutionTime: number;
  chunkCount: number;
  toolExecutions: number;
  bufferFlushes: number;
  averageLatency: number;
};