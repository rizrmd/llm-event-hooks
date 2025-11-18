// Main library export for LLM Event Hooks

// Core classes
export { HookableLLM } from './core/HookableLLM';
export { HookManager } from './core/HookManager';
export { ConversationHistory } from './core/ConversationHistory';
export { HookableEventEmitter } from './core/EventEmitter';

// Event classes
export { MessageEvent, MessageHookPriority } from './events/MessageEvent';
export { ChunkEvent } from './events/ChunkEvent';
export { BufferFlushEvent } from './events/BufferEvent';

// Streaming classes
export { StreamBuffer } from './streaming/StreamBuffer';
export { BufferManager } from './streaming/BufferManager';

// Persistence adapters
export { PersistenceAdapter } from './persistence/PersistenceAdapter';
export { InMemoryPersistence } from './persistence/InMemoryPersistence';
export { JSONFilePersistence } from './persistence/JSONFilePersistence';

// Type definitions
export type {
  // Core types
  Message,
  Conversation,
  ConversationHistory as ConversationHistoryType,
  LLMResponse,
  LLMStreamResponse,
  HookableLLMConfig,

  // Hook types
  HookEvent,
  HookFunction,
  HookRegistration,
  HookExecutionResult,
  HookError,

  // Persistence types
  ConversationFilter,
  ConversationStats,
  PersistenceConfig,

  // Tool types
  Tool,
  ToolDefinition,
  ToolParameter,
  ToolCall,
  ToolResult,
  ToolEvent as ToolEventType,
  ToolLoopEvent as ToolLoopEventType,

  // Buffer types
  StreamBufferConfig,
  BufferFlushStrategy,
  ChunkEvent as ChunkEventType,
  BufferEvent as BufferEventType,

  // Streaming types
  Chunk,
  ChunkEventData,
  ChunkHookContext,
  ChunkValidationRule,
  ChunkMetadata,
  ChunkTransform,
  ChunkFilter,
  ChunkPerformanceMetrics,
  BufferFlushEventData,
  BufferFlushHookContext,
  BufferValidationRule,
  BufferMetadata,
  BufferPerformanceMetrics,
  BufferTransform,
  BufferFilter
} from './types';

// Event-specific types
export type {
  MessageEventData,
  MessageHookContext,
  MessageValidationRule,
  MessageMetadata,
  MessageTransform,
  MessageFilter,
  MessagePerformanceMetrics
} from './events/types';

// Error classes
export {
  HookableLLMError,
  HookExecutionError,
  BufferError,
  ToolExecutionError,
  PersistenceError
} from './types';

// Utilities
export { createLogger, LogLevel } from './utils/logger';
export { config, AppConfig, ConfigManager } from './config';

// Version information
export const VERSION = '1.0.0';
export const PACKAGE_NAME = 'llm-event-hooks';

// Default exports for convenience
export { InMemoryPersistence as DefaultPersistence } from './persistence/InMemoryPersistence';
export { MessageHookPriority as DefaultPriority } from './events/MessageEvent';

// Default buffer configurations
export const DefaultBufferConfigs = {
  SMALL_FAST: { maxSize: 5, maxTime: 50, strategy: 'hybrid' as const, enableMetrics: true },
  MEDIUM_BALANCED: { maxSize: 10, maxTime: 100, strategy: 'hybrid' as const, enableMetrics: true },
  LARGE_SLOW: { maxSize: 25, maxTime: 200, strategy: 'hybrid' as const, enableMetrics: true },
  SIZE_BASED: { maxSize: 15, maxTime: 1000, strategy: 'size' as const, enableMetrics: true },
  TIME_BASED: { maxSize: 100, maxTime: 75, strategy: 'time' as const, enableMetrics: true }
} as const;

// Helper factory functions
export function createHookableLLM(options: HookableLLMConfig): HookableLLM {
  return new HookableLLM(options);
}

export function createInMemoryPersistence(): InMemoryPersistence {
  return new InMemoryPersistence();
}

export function createJSONFilePersistence(filePath?: string): JSONFilePersistence {
  return new JSONFilePersistence(filePath);
}

// Streaming helper functions
export function createStreamBuffer(bufferId: string, options?: {
  config?: StreamBufferConfig;
  sequenceId?: string;
  metadata?: Record<string, any>;
}): StreamBuffer {
  return new StreamBuffer({ id: bufferId, ...options });
}

export function createBufferManager(config?: {
  defaultBufferConfig?: StreamBufferConfig;
  maxBuffers?: number;
  autoCleanup?: boolean;
  cleanupAge?: number;
  enableMetrics?: boolean;
}): BufferManager {
  return new BufferManager(config);
}

export function createChunkEvent(): ChunkEvent {
  return new ChunkEvent();
}

export function createBufferFlushEvent(): BufferFlushEvent {
  return new BufferFlushEvent();
}

// Convenience exports for common patterns
export const Events = {
  MESSAGE_BEFORE: 'message:before' as const,
  MESSAGE_AFTER: 'message:after' as const,
  CHUNK_BEFORE: 'chunk:before' as const,
  CHUNK_AFTER: 'chunk:after' as const,
  BUFFER_FLUSH: 'buffer:flush' as const,
  BUFFER_FLUSHED: 'buffer:flushed' as const,
  BUFFER_PROCESSED_FLUSH: 'buffer:processed:flush' as const,
  TOOL_BEFORE: 'tool:before' as const,
  TOOL_AFTER: 'tool:after' as const,
  TOOL_LOOP_BEFORE: 'tool:loop:before' as const,
  TOOL_LOOP_AFTER: 'tool:loop:after' as const
};

export const MessageRoles = {
  SYSTEM: 'system' as const,
  USER: 'user' as const,
  ASSISTANT: 'assistant' as const,
  TOOL: 'tool' as const
};

export const BufferStrategies = {
  SIZE: 'size' as const,
  TIME: 'time' as const,
  HYBRID: 'hybrid' as const
} as const;

export const FlushReasons = {
  SIZE: 'size' as const,
  TIME: 'time' as const,
  HYBRID: 'hybrid' as const,
  MANUAL: 'manual' as const
} as const;

export const Priorities = {
  CRITICAL: 0,
  HIGH: 25,
  NORMAL: 50,
  LOW: 75,
  CLEANUP: 100
} as const;

