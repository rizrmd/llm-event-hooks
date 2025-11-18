// Chunk event implementation for streaming LLM responses
import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger';
import {
  Chunk,
  ChunkEventData,
  ChunkHookContext,
  ChunkMetadata,
  ChunkValidationRule,
  ChunkPerformanceMetrics,
  ChunkTransform,
  ChunkFilter,
  HookFunction
} from '../events/types';
import { HookableEventEmitter } from '../core/EventEmitter';

const logger = createLogger('ChunkEvent');

export class ChunkEvent extends HookableEventEmitter {
  private performanceMetrics: ChunkPerformanceMetrics = {
    totalChunks: 0,
    averageProcessingTime: 0,
    hookExecutionTime: 0,
    successfulHooks: 0,
    failedHooks: 0,
    averageChunkSize: 0,
    chunksPerSecond: 0,
    bufferFlushes: 0
  };

  private validationRules: Map<string, ChunkValidationRule> = new Map();
  private chunkStartTime = new Map<string, number>();
  private chunksInLastSecond = 0;
  private lastSecondTimestamp = Date.now();

  constructor() {
    super();
    this.setupDefaultValidation();
    this.setupPerformanceMonitoring();
  }

  private setupDefaultValidation(): void {
    // Default validation for chunks
    this.addValidationRule('default', {
      required: ['id', 'content', 'index', 'timestamp'],
      optional: ['metadata', 'isComplete', 'sequenceId']
    });
  }

  private setupPerformanceMonitoring(): void {
    // Update chunks per second every second
    setInterval(() => {
      const now = Date.now();
      const elapsed = now - this.lastSecondTimestamp;

      if (elapsed >= 1000) {
        this.performanceMetrics.chunksPerSecond = (this.chunksInLastSecond * 1000) / elapsed;
        this.chunksInLastSecond = 0;
        this.lastSecondTimestamp = now;
      }
    }, 100);
  }

  // Add validation rules for chunks
  addValidationRule(name: string, rule: ChunkValidationRule): void {
    this.validationRules.set(name, rule);
    logger.debug('Chunk validation rule added', { name, required: rule.required });
  }

  // Remove validation rule
  removeValidationRule(name: string): void {
    this.validationRules.delete(name);
    logger.debug('Chunk validation rule removed', { name });
  }

  // Validate chunk against rules
  private validateChunk(chunk: Chunk, ruleName: string = 'default'): boolean {
    const rule = this.validationRules.get(ruleName);
    if (!rule) {
      logger.warn('Chunk validation rule not found', { ruleName });
      return true;
    }

    // Check required fields
    for (const field of rule.required) {
      if (!(field in chunk)) {
        logger.error('Chunk validation failed - missing required field', null, {
          field,
          ruleName,
          chunkId: chunk.id
        });
        if (rule.errorMessage) {
          throw new Error(`${rule.errorMessage}: Missing required field '${field}'`);
        }
        return false;
      }
    }

    // Apply custom validator if provided
    if (rule.validator) {
      const isValid = rule.validator(chunk);
      if (!isValid) {
        logger.error('Chunk validation failed - custom validator', null, {
          ruleName,
          chunkId: chunk.id
        });
        if (rule.errorMessage) {
          throw new Error(`${rule.errorMessage}: Custom validation failed`);
        }
        return false;
      }
    }

    return true;
  }

  // Create metadata for chunk processing
  private createChunkMetadata(
    source: string,
    requestId?: string,
    sequenceId?: string,
    bufferId?: string
  ): ChunkMetadata {
    const now = Date.now();
    return {
      processedAt: new Date(),
      source,
      version: '1.0.0',
      requestId,
      sequenceId,
      processingLatency: 0,
      bufferId
    };
  }

  // Create hook context for chunk processing
  private createHookContext(
    chunkId: string,
    totalHooks: number,
    executionOrder: number,
    sequenceId?: string,
    bufferId?: string
  ): ChunkHookContext {
    const startTime = this.chunkStartTime.get(chunkId) || Date.now();
    const processingLatency = Date.now() - startTime;

    return {
      chunkId,
      hookId: `chunk-hook-${Date.now()}`,
      executionOrder,
      totalHooks,
      sequenceId,
      bufferId,
      processingLatency
    };
  }

  // Create a new chunk
  static createChunk(
    content: string,
    options: {
      index?: number;
      sequenceId?: string;
      metadata?: Record<string, any>;
      isComplete?: boolean;
    } = {}
  ): Chunk {
    return {
      id: `chunk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content,
      index: options.index || 0,
      timestamp: new Date(),
      metadata: options.metadata || {},
      isComplete: options.isComplete || false,
      sequenceId: options.sequenceId
    };
  }

  // Process chunk before hooks (outgoing chunks)
  async processChunkBefore(
    chunk: Chunk,
    direction: 'outgoing' | 'incoming',
    options: {
      source?: string;
      requestId?: string;
      sequenceId?: string;
      bufferId?: string;
      validationRule?: string;
    } = {}
  ): Promise<{ chunk: Chunk; metadata: ChunkMetadata }> {
    const startTime = Date.now();
    const {
      source = 'unknown',
      requestId,
      sequenceId,
      bufferId,
      validationRule = 'default'
    } = options;

    // Track chunk processing start time
    this.chunkStartTime.set(chunk.id, startTime);
    this.chunksInLastSecond++;

    try {
      // Validate chunk
      this.validateChunk(chunk, validationRule);

      // Create metadata
      const metadata = this.createChunkMetadata(source, requestId, sequenceId, bufferId);

      // Create event data
      const eventData: ChunkEventData = {
        chunk,
        direction,
        sequenceId,
        bufferId
      };

      // Get hook info for context
      const hookInfo = this.getHookInfo('chunk:before');
      const context = this.createHookContext(
        chunk.id,
        hookInfo.length,
        0,
        sequenceId,
        bufferId
      );

      logger.debug('Processing chunk before hooks', {
        direction,
        chunkId: chunk.id,
        sequenceId,
        hookCount: hookInfo.length,
        contentLength: chunk.content.length
      });

      // Execute before hooks
      const processedData = await this.executeHooks('chunk:before', eventData, context);

      // Update performance metrics
      this.updatePerformanceMetrics(startTime, hookInfo.length, 0, chunk);

      logger.debug('Chunk before hooks processed', {
        direction,
        chunkId: chunk.id,
        processingTime: `${Date.now() - startTime}ms`,
        wasModified: processedData.chunk !== chunk
      });

      // Emit the processed chunk event
      this.emit('chunk:processed:before', {
        originalChunk: chunk,
        processedChunk: processedData.chunk,
        metadata,
        direction
      });

      return {
        chunk: processedData.chunk,
        metadata
      };

    } catch (error) {
      this.performanceMetrics.failedHooks++;
      logger.error('Chunk before processing failed', error as Error, {
        direction,
        chunkId: chunk.id,
        processingTime: `${Date.now() - startTime}ms`
      });
      throw error;
    }
  }

  // Process chunk after hooks (incoming chunks)
  async processChunkAfter(
    chunk: Chunk,
    direction: 'outgoing' | 'incoming',
    options: {
      source?: string;
      requestId?: string;
      sequenceId?: string;
      bufferId?: string;
    } = {}
  ): Promise<{ chunk: Chunk; metadata: ChunkMetadata }> {
    const startTime = Date.now();
    const {
      source = 'unknown',
      requestId,
      sequenceId,
      bufferId
    } = options;

    try {
      // Create metadata
      const metadata = this.createChunkMetadata(source, requestId, sequenceId, bufferId);

      // Create event data
      const eventData: ChunkEventData = {
        chunk,
        direction,
        sequenceId,
        bufferId
      };

      // Get hook info for context
      const hookInfo = this.getHookInfo('chunk:after');
      const context = this.createHookContext(
        chunk.id,
        hookInfo.length,
        0,
        sequenceId,
        bufferId
      );

      logger.debug('Processing chunk after hooks', {
        direction,
        chunkId: chunk.id,
        sequenceId,
        hookCount: hookInfo.length
      });

      // Execute after hooks
      const processedData = await this.executeHooks('chunk:after', eventData, context);

      // Update performance metrics
      this.updatePerformanceMetrics(startTime, hookInfo.length, 0, chunk);

      logger.debug('Chunk after hooks processed', {
        direction,
        chunkId: chunk.id,
        processingTime: `${Date.now() - startTime}ms`,
        wasModified: processedData.chunk !== chunk
      });

      // Emit the processed chunk event
      this.emit('chunk:processed:after', {
        originalChunk: chunk,
        processedChunk: processedData.chunk,
        metadata,
        direction
      });

      return {
        chunk: processedData.chunk,
        metadata
      };

    } catch (error) {
      this.performanceMetrics.failedHooks++;
      logger.error('Chunk after processing failed', error as Error, {
        direction,
        chunkId: chunk.id,
        processingTime: `${Date.now() - startTime}ms`
      });
      throw error;
    }
  }

  // Update performance metrics
  private updatePerformanceMetrics(
    startTime: number,
    hookCount: number,
    failedCount: number,
    chunk: Chunk
  ): void {
    const processingTime = Date.now() - startTime;
    this.performanceMetrics.totalChunks++;
    this.performanceMetrics.hookExecutionTime += processingTime;
    this.performanceMetrics.successfulHooks += hookCount;
    this.performanceMetrics.failedHooks += failedCount;

    // Calculate average processing time
    this.performanceMetrics.averageProcessingTime =
      this.performanceMetrics.hookExecutionTime / this.performanceMetrics.totalChunks;

    // Calculate average chunk size
    const totalSize = (this.performanceMetrics.averageChunkSize * (this.performanceMetrics.totalChunks - 1)) + chunk.content.length;
    this.performanceMetrics.averageChunkSize = totalSize / this.performanceMetrics.totalChunks;
  }

  // Get current performance metrics
  getPerformanceMetrics(): ChunkPerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  // Reset performance metrics
  resetPerformanceMetrics(): void {
    this.performanceMetrics = {
      totalChunks: 0,
      averageProcessingTime: 0,
      hookExecutionTime: 0,
      successfulHooks: 0,
      failedHooks: 0,
      averageChunkSize: 0,
      chunksPerSecond: 0,
      bufferFlushes: 0
    };
    this.chunksInLastSecond = 0;
    this.lastSecondTimestamp = Date.now();
    logger.info('Chunk performance metrics reset');
  }

  // Register chunk-specific hooks
  onChunkBefore(hook: HookFunction, priority?: number): this {
    return this.on('chunk:before', hook, priority);
  }

  onChunkAfter(hook: HookFunction, priority?: number): this {
    return this.on('chunk:after', hook, priority);
  }

  onceChunkBefore(hook: HookFunction, priority?: number): this {
    return this.once('chunk:before', hook, priority);
  }

  onceChunkAfter(hook: HookFunction, priority?: number): this {
    return this.once('chunk:after', hook, priority);
  }

  // Remove chunk-specific hooks
  offChunkBefore(hook: HookFunction): this {
    return this.off('chunk:before', hook);
  }

  offChunkAfter(hook: HookFunction): this {
    return this.off('chunk:after', hook);
  }

  // Get hook registration info
  getChunkHookInfo(): {
    before: Array<{ id: string; priority: number }>;
    after: Array<{ id: string; priority: number }>;
  } {
    return {
      before: this.getHookInfo('chunk:before'),
      after: this.getHookInfo('chunk:after')
    };
  }

  // Clear all chunk hooks
  clearChunkHooks(): void {
    this.removeAllListeners('chunk:before');
    this.removeAllListeners('chunk:after');
    logger.info('All chunk hooks cleared');
  }

  // Validate chunk structure
  static validateChunkStructure(chunk: any): chunk is Chunk {
    if (!chunk || typeof chunk !== 'object') {
      return false;
    }

    // Check required fields
    if (!chunk.id || typeof chunk.id !== 'string') {
      return false;
    }

    if (!chunk.content || typeof chunk.content !== 'string') {
      return false;
    }

    if (typeof chunk.index !== 'number') {
      return false;
    }

    if (!chunk.timestamp || !(chunk.timestamp instanceof Date)) {
      return false;
    }

    return true;
  }

  // Create multiple chunks from text with optional size limits
  static createChunksFromText(
    text: string,
    options: {
      chunkSize?: number;
      overlap?: number;
      sequenceId?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Chunk[] {
    const {
      chunkSize = 100,
      overlap = 0,
      sequenceId,
      metadata = {}
    } = options;

    const chunks: Chunk[] = [];
    let index = 0;

    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      const content = text.substring(i, Math.min(i + chunkSize, text.length));
      const isComplete = i + chunkSize >= text.length;

      const chunk: Chunk = {
        id: `chunk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        content,
        index: index++,
        timestamp: new Date(),
        metadata: { ...metadata, originalIndex: i, isComplete },
        isComplete,
        sequenceId
      };

      chunks.push(chunk);

      if (isComplete) break;
    }

    return chunks;
  }

  // Merge chunks back into complete text
  static mergeChunks(chunks: Chunk[]): string {
    // Sort chunks by index to ensure correct order
    const sortedChunks = chunks.sort((a, b) => a.index - b.index);

    return sortedChunks
      .map(chunk => chunk.content)
      .join('');
  }

  // Increment buffer flush counter (called by BufferManager)
  incrementBufferFlushes(): void {
    this.performanceMetrics.bufferFlushes++;
  }
}