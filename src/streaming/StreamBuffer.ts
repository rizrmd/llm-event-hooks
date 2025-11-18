// StreamBuffer - Manages chunked streaming data with configurable buffering strategies
import { createLogger } from '../utils/logger';
import {
  Chunk,
  StreamBufferConfig,
  BufferFlushEventData,
  BufferFlushHookContext
} from '../events/types';
import { BufferFlushEvent } from '../events/BufferEvent';

const logger = createLogger('StreamBuffer');

export interface StreamBufferOptions {
  id: string;
  config?: StreamBufferConfig;
  onFlush?: (data: BufferFlushEventData, context: BufferFlushHookContext) => Promise<Chunk[]>;
}

export class StreamBuffer {
  public readonly id: string;
  public readonly config: StreamBufferConfig;

  private chunks: Chunk[] = [];
  private createdAt: Date;
  private lastChunkTime: Date;
  private flushTimeout?: NodeJS.Timeout;
  private isActive = true;
  private bufferEvent: BufferFlushEvent;
  private onFlush?: (data: BufferFlushEventData, context: BufferFlushHookContext) => Promise<Chunk[]>;

  // Performance tracking
  private totalChunksAdded = 0;
  private totalFlushes = 0;
  private totalProcessingTime = 0;

  constructor(options: StreamBufferOptions) {
    const {
      id,
      config = BufferFlushEvent.createDefaultBufferConfig(),
      onFlush
    } = options;

    this.id = id;
    this.config = config;
    this.onFlush = onFlush;
    this.bufferEvent = new BufferFlushEvent();

    this.createdAt = new Date();
    this.lastChunkTime = new Date();

    // Set up buffer configuration in event system
    this.bufferEvent.setBufferConfig(id, config);

    logger.debug('StreamBuffer created', {
      bufferId: id,
      config: {
        maxSize: config.maxSize,
        maxTime: config.maxTime,
        strategy: config.strategy,
        enableMetrics: config.enableMetrics
      }
    });

    // Start flush timeout if time-based strategy is enabled
    if (config.strategy === 'time' || config.strategy === 'hybrid') {
      this.startFlushTimer();
    }
  }

  // Add a chunk to the buffer
  addChunk(chunk: Chunk): {
    shouldFlush: boolean;
    flushReason?: 'size' | 'time' | 'hybrid';
    bufferedChunks: number;
  } {
    if (!this.isActive) {
      logger.warn('Attempted to add chunk to inactive buffer', { bufferId: this.id });
      return { shouldFlush: false, bufferedChunks: 0 };
    }

    const startTime = Date.now();
    this.chunks.push(chunk);
    this.totalChunksAdded++;
    this.lastChunkTime = new Date();

    logger.debug('Chunk added to buffer', {
      bufferId: this.id,
      chunkId: chunk.id,
      chunkIndex: chunk.index,
      totalChunks: this.chunks.length,
      contentLength: chunk.content.length
    });

    // Check if flush should be triggered
    const flushCheck = this.shouldFlush();

    if (flushCheck.shouldFlush) {
      // Trigger flush asynchronously to avoid blocking
      setImmediate(() => {
        this.flush(flushCheck.flushReason!);
      });
    }

    const processingTime = Date.now() - startTime;
    this.totalProcessingTime += processingTime;

    return {
      shouldFlush: flushCheck.shouldFlush,
      flushReason: flushCheck.flushReason,
      bufferedChunks: this.chunks.length
    };
  }

  // Add multiple chunks at once
  addChunks(chunks: Chunk[]): {
    shouldFlush: boolean;
    flushReason?: 'size' | 'time' | 'hybrid';
    bufferedChunks: number;
  } {
    if (!this.isActive) {
      logger.warn('Attempted to add chunks to inactive buffer', { bufferId: this.id });
      return { shouldFlush: false, bufferedChunks: 0 };
    }

    const startTime = Date.now();

    for (const chunk of chunks) {
      this.chunks.push(chunk);
      this.totalChunksAdded++;
    }

    this.lastChunkTime = new Date();

    logger.debug('Multiple chunks added to buffer', {
      bufferId: this.id,
      chunkCount: chunks.length,
      totalChunks: this.chunks.length
    });

    // Check if flush should be triggered
    const flushCheck = this.shouldFlush();

    if (flushCheck.shouldFlush) {
      // Trigger flush asynchronously
      setImmediate(() => {
        this.flush(flushCheck.flushReason!);
      });
    }

    const processingTime = Date.now() - startTime;
    this.totalProcessingTime += processingTime;

    return {
      shouldFlush: flushCheck.shouldFlush,
      flushReason: flushCheck.flushReason,
      bufferedChunks: this.chunks.length
    };
  }

  // Check if buffer should be flushed based on configuration
  private shouldFlush(): {
    shouldFlush: boolean;
    flushReason?: 'size' | 'time' | 'hybrid';
  } {
    const now = Date.now();
    const age = now - this.createdAt.getTime();
    const timeSinceLastChunk = now - this.lastChunkTime.getTime();

    // Size-based flush
    if (this.chunks.length >= this.config.maxSize) {
      return { shouldFlush: true, flushReason: 'size' };
    }

    // Time-based flush
    if (this.config.strategy === 'time' && age >= this.config.maxTime) {
      return { shouldFlush: true, flushReason: 'time' };
    }

    // Hybrid strategy - flush on size or time
    if (this.config.strategy === 'hybrid') {
      // Flush if we've been waiting too long
      if (age >= this.config.maxTime) {
        return { shouldFlush: true, flushReason: 'hybrid' };
      }

      // Flush if we have a decent number of chunks and have been waiting a while
      if (this.chunks.length >= this.config.maxSize * 0.7 && timeSinceLastChunk >= this.config.maxTime * 0.5) {
        return { shouldFlush: true, flushReason: 'hybrid' };
      }
    }

    return { shouldFlush: false };
  }

  // Manually trigger a flush
  async flush(reason: 'size' | 'time' | 'hybrid' | 'manual' = 'manual'): Promise<Chunk[]> {
    if (!this.isActive || this.chunks.length === 0) {
      logger.debug('Flush called on empty or inactive buffer', {
        bufferId: this.id,
        isActive: this.isActive,
        chunkCount: this.chunks.length
      });
      return [];
    }

    const startTime = Date.now();
    const chunksToFlush = [...this.chunks]; // Copy to avoid modification during flush
    const totalSize = chunksToFlush.reduce((sum, chunk) => sum + chunk.content.length, 0);

    logger.info('Buffer flush started', {
      bufferId: this.id,
      reason,
      chunkCount: chunksToFlush.length,
      totalSize
    });

    try {
      // Create flush event data
      const flushData: BufferFlushEventData = {
        bufferId: this.id,
        chunks: chunksToFlush,
        flushReason: reason,
        totalSize,
        processingTime: 0,
        metadata: {
          bufferAge: Date.now() - this.createdAt.getTime(),
          averageChunkSize: totalSize / chunksToFlush.length
        }
      };

      // Create flush context
      const flushContext: BufferFlushHookContext = {
        bufferId: this.id,
        hookId: `buffer-flush-${Date.now()}`,
        executionOrder: 0,
        totalHooks: 0,
        flushReason: reason,
        chunkCount: chunksToFlush.length,
        totalSize
      };

      let processedChunks: Chunk[];

      if (this.onFlush) {
        // Use custom flush handler
        processedChunks = await this.onFlush(flushData, flushContext);
      } else {
        // Use default BufferFlushEvent processing
        const result = await this.bufferEvent.processBufferFlush(
          this.id,
          chunksToFlush,
          reason,
          {
            source: 'stream-buffer',
            validationRule: 'default'
          }
        );
        processedChunks = result.chunks;
      }

      // Clear the buffer after successful flush
      this.chunks = [];
      this.totalFlushes++;

      const processingTime = Date.now() - startTime;
      this.totalProcessingTime += processingTime;

      logger.info('Buffer flush completed', {
        bufferId: this.id,
        reason,
        originalChunkCount: chunksToFlush.length,
        processedChunkCount: processedChunks.length,
        processingTime: `${processingTime}ms`
      });

      // Emit flush event
      this.bufferEvent.emit('flushed', {
        bufferId: this.id,
        reason,
        originalChunks: chunksToFlush,
        processedChunks,
        processingTime
      });

      return processedChunks;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Buffer flush failed', error as Error, {
        bufferId: this.id,
        reason,
        chunkCount: chunksToFlush.length,
        processingTime: `${processingTime}ms`
      });

      // Even if flush fails, we should clear the buffer to prevent data buildup
      this.chunks = [];
      throw error;
    }
  }

  // Start flush timer for time-based strategies
  private startFlushTimer(): void {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
    }

    this.flushTimeout = setTimeout(() => {
      if (this.isActive && this.chunks.length > 0) {
        this.flush('time');
      }
    }, this.config.maxTime);
  }

  // Restart flush timer
  private restartFlushTimer(): void {
    if (this.config.strategy === 'time' || this.config.strategy === 'hybrid') {
      this.startFlushTimer();
    }
  }

  // Get current buffer state
  getState(): {
    isActive: boolean;
    chunkCount: number;
    totalSize: number;
    age: number;
    timeSinceLastChunk: number;
    utilization: number;
  } {
    const now = Date.now();
    const totalSize = this.chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);

    return {
      isActive: this.isActive,
      chunkCount: this.chunks.length,
      totalSize,
      age: now - this.createdAt.getTime(),
      timeSinceLastChunk: now - this.lastChunkTime.getTime(),
      utilization: this.chunks.length / this.config.maxSize
    };
  }

  // Get buffer statistics
  getStats(): {
    totalChunksAdded: number;
    totalFlushes: number;
    averageChunksPerFlush: number;
    averageProcessingTime: number;
    bufferUtilization: number;
  } {
    return {
      totalChunksAdded: this.totalChunksAdded,
      totalFlushes: this.totalFlushes,
      averageChunksPerFlush: this.totalFlushes > 0
        ? this.totalChunksAdded / this.totalFlushes
        : 0,
      averageProcessingTime: this.totalFlushes > 0
        ? this.totalProcessingTime / this.totalFlushes
        : 0,
      bufferUtilization: this.chunks.length / this.config.maxSize
    };
  }

  // Update buffer configuration
  updateConfig(newConfig: Partial<StreamBufferConfig>): void {
    // Validate new configuration
    const validation = BufferFlushEvent.validateBufferConfig({ ...this.config, ...newConfig });
    if (!validation.isValid) {
      throw new Error(`Invalid buffer configuration: ${validation.errors.join(', ')}`);
    }

    const oldConfig = { ...this.config };
    Object.assign(this.config, newConfig);

    logger.info('Buffer configuration updated', {
      bufferId: this.id,
      oldConfig,
      newConfig: this.config
    });

    // Update configuration in event system
    this.bufferEvent.setBufferConfig(this.id, this.config);

    // Restart timer if time-based strategy changed
    if ((oldConfig.strategy !== this.config.strategy) ||
        (oldConfig.maxTime !== this.config.maxTime)) {
      if (this.config.strategy === 'time' || this.config.strategy === 'hybrid') {
        this.restartFlushTimer();
      } else if (this.flushTimeout) {
        clearTimeout(this.flushTimeout);
        this.flushTimeout = undefined;
      }
    }
  }

  // Clear buffer without flushing
  clear(): Chunk[] {
    const clearedChunks = [...this.chunks];
    this.chunks = [];

    logger.debug('Buffer cleared', {
      bufferId: this.id,
      clearedChunkCount: clearedChunks.length
    });

    return clearedChunks;
  }

  // Pause the buffer (stop accepting new chunks and timers)
  pause(): void {
    this.isActive = false;

    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = undefined;
    }

    logger.debug('Buffer paused', { bufferId: this.id });
  }

  // Resume the buffer
  resume(): void {
    if (!this.isActive) {
      this.isActive = true;

      // Restart timer if needed
      if (this.config.strategy === 'time' || this.config.strategy === 'hybrid') {
        this.startFlushTimer();
      }

      logger.debug('Buffer resumed', { bufferId: this.id });
    }
  }

  // Destroy the buffer (cleanup resources)
  destroy(): Chunk[] {
    this.pause();

    const remainingChunks = this.clear();

    logger.info('Buffer destroyed', {
      bufferId: this.id,
      remainingChunkCount: remainingChunks.length
    });

    return remainingChunks;
  }

  // Get buffer age in milliseconds
  getAge(): number {
    return Date.now() - this.createdAt.getTime();
  }

  // Check if buffer is empty
  isEmpty(): boolean {
    return this.chunks.length === 0;
  }

  // Check if buffer is full (at capacity)
  isFull(): boolean {
    return this.chunks.length >= this.config.maxSize;
  }

  // Get estimated memory usage
  getMemoryUsage(): {
    chunks: number;
    totalCharacters: number;
    estimatedBytes: number;
  } {
    const totalCharacters = this.chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);

    return {
      chunks: this.chunks.length,
      totalCharacters,
      estimatedBytes: totalCharacters * 2 // Rough estimate (2 bytes per character)
    };
  }

  // Force flush and return all chunks (alias for flush)
  async drain(): Promise<Chunk[]> {
    return this.flush('manual');
  }

  // Peek at current chunks without removing them
  peek(): Chunk[] {
    return [...this.chunks];
  }

  // Get chunk at specific index
  getChunkAt(index: number): Chunk | undefined {
    return this.chunks[index];
  }

  // Remove chunk at specific index
  removeChunkAt(index: number): Chunk | undefined {
    const removed = this.chunks.splice(index, 1)[0];

    if (removed) {
      logger.debug('Chunk removed', {
        bufferId: this.id,
        chunkId: removed.id,
        index
      });
    }

    return removed;
  }

  // Get buffer performance metrics from event system
  getPerformanceMetrics() {
    return this.bufferEvent.getPerformanceMetrics();
  }
}