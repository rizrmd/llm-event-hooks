// Event types for the LLM Event Hooks system
// This extends the types from the main types file to avoid circular dependencies

export { Message, ConversationHistory } from '../types';

// Message-specific event types
export interface MessageEventData {
  message: Message;
  direction: 'outgoing' | 'incoming';
}

// Hook execution context specific to messages
export interface MessageHookContext {
  messageId?: string;
  hookId: string;
  executionOrder: number;
  totalHooks: number;
}

// Message validation rules
export interface MessageValidationRule {
  required: string[];
  optional?: string[];
  validator?: (message: Message) => boolean;
  errorMessage?: string;
}

// Message processing metadata
export interface MessageMetadata {
  processedAt: Date;
  source: string;
  version: string;
  correlationId?: string;
  requestId?: string;
}

// Message transformation utilities
export interface MessageTransform {
  (message: Message): Message | Promise<Message>;
}

// Message filtering utilities
export interface MessageFilter {
  (message: Message): boolean;
}

// Performance tracking for message processing
export interface MessagePerformanceMetrics {
  totalMessages: number;
  averageProcessingTime: number;
  hookExecutionTime: number;
  successfulHooks: number;
  failedHooks: number;
}

// Hook priority levels for message events
export enum MessageHookPriority {
  CRITICAL = 0,
  HIGH = 25,
  NORMAL = 50,
  LOW = 75,
  CLEANUP = 100
}

// =============================================
// STREAMING AND CHUNK EVENT TYPES
// =============================================

// Chunk interface for streaming responses
export interface Chunk {
  id: string;
  content: string;
  index: number;
  timestamp: Date;
  metadata: Record<string, any>;
  isComplete: boolean;
  sequenceId?: string;
}

// Chunk-specific event data
export interface ChunkEventData {
  chunk: Chunk;
  direction: 'outgoing' | 'incoming';
  sequenceId?: string;
  bufferId?: string;
}

// Hook execution context specific to chunks
export interface ChunkHookContext {
  chunkId: string;
  hookId: string;
  executionOrder: number;
  totalHooks: number;
  sequenceId?: string;
  bufferId?: string;
  processingLatency: number;
}

// Chunk validation rules
export interface ChunkValidationRule {
  required: string[];
  optional?: string[];
  validator?: (chunk: Chunk) => boolean;
  errorMessage?: string;
}

// Chunk processing metadata
export interface ChunkMetadata {
  processedAt: Date;
  source: string;
  version: string;
  correlationId?: string;
  requestId?: string;
  sequenceId?: string;
  processingLatency: number;
  bufferId?: string;
}

// Chunk transformation utilities
export interface ChunkTransform {
  (chunk: Chunk): Chunk | Promise<Chunk>;
}

// Chunk filtering utilities
export interface ChunkFilter {
  (chunk: Chunk): boolean;
}

// Performance tracking for chunk processing
export interface ChunkPerformanceMetrics {
  totalChunks: number;
  averageProcessingTime: number;
  hookExecutionTime: number;
  successfulHooks: number;
  failedHooks: number;
  averageChunkSize: number;
  chunksPerSecond: number;
  bufferFlushes: number;
}

// Stream buffer configuration
export interface StreamBufferConfig {
  maxSize: number;
  maxTime: number;
  strategy: 'size' | 'time' | 'hybrid';
  enableMetrics: boolean;
}

// Buffer flush event data
export interface BufferFlushEventData {
  bufferId: string;
  chunks: Chunk[];
  flushReason: 'size' | 'time' | 'hybrid' | 'manual';
  totalSize: number;
  processingTime: number;
  metadata: Record<string, any>;
}

// Buffer flush hook context
export interface BufferFlushHookContext {
  bufferId: string;
  hookId: string;
  executionOrder: number;
  totalHooks: number;
  flushReason: 'size' | 'time' | 'hybrid' | 'manual';
  chunkCount: number;
  totalSize: number;
}

// Buffer validation rules
export interface BufferValidationRule {
  required: string[];
  optional?: string[];
  validator?: (chunks: Chunk[]) => boolean;
  errorMessage?: string;
}

// Buffer transformation utilities
export interface BufferTransform {
  (chunks: Chunk[]): Chunk[] | Promise<Chunk[]>;
}

// Buffer filtering utilities
export interface BufferFilter {
  (chunks: Chunk[]): boolean;
}

// Performance tracking for buffer processing
export interface BufferPerformanceMetrics {
  totalBuffers: number;
  averageBufferSize: number;
  averageFlushTime: number;
  totalChunksProcessed: number;
  flushesByReason: Record<string, number>;
  bufferUtilization: number;
}

// Hook priority levels for chunk events
export enum ChunkHookPriority {
  CRITICAL = 0,
  HIGH = 25,
  NORMAL = 50,
  LOW = 75,
  CLEANUP = 100
}

// Hook priority levels for buffer events
export enum BufferHookPriority {
  CRITICAL = 0,
  HIGH = 25,
  NORMAL = 50,
  LOW = 75,
  CLEANUP = 100
}