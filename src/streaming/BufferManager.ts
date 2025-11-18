// BufferManager - Orchestrates multiple StreamBuffer instances for different data streams
import { createLogger } from '../utils/logger';
import { Chunk, StreamBufferConfig } from '../events/types';
import { BufferFlushEvent } from '../events/BufferEvent';
import { StreamBuffer, StreamBufferOptions } from './StreamBuffer';

const logger = createLogger('BufferManager');

export interface BufferManagerConfig {
  defaultBufferConfig?: StreamBufferConfig;
  maxBuffers?: number;
  autoCleanup?: boolean;
  cleanupAge?: number; // in milliseconds
  enableMetrics?: boolean;
}

export interface BufferInfo {
  id: string;
  buffer: StreamBuffer;
  createdAt: Date;
  lastActivity: Date;
  sequenceId?: string;
  metadata: Record<string, any>;
}

export interface BufferManagerStats {
  totalBuffers: number;
  activeBuffers: number;
  totalChunksProcessed: number;
  totalFlushes: number;
  averageBufferAge: number;
  buffersByState: Record<string, number>;
}

export class BufferManager {
  private buffers = new Map<string, BufferInfo>();
  private bufferEvent: BufferFlushEvent;
  private config: BufferManagerConfig;

  // Performance tracking
  private totalChunksProcessed = 0;
  private totalFlushes = 0;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: BufferManagerConfig = {}) {
    this.config = {
      defaultBufferConfig: BufferFlushEvent.createDefaultBufferConfig(),
      maxBuffers: 100,
      autoCleanup: true,
      cleanupAge: 5 * 60 * 1000, // 5 minutes
      enableMetrics: true,
      ...config
    };

    this.bufferEvent = new BufferFlushEvent();

    logger.debug('BufferManager initialized', {
      maxBuffers: this.config.maxBuffers,
      autoCleanup: this.config.autoCleanup,
      cleanupAge: this.config.cleanupAge
    });

    // Start cleanup interval if auto-cleanup is enabled
    if (this.config.autoCleanup) {
      this.startCleanupInterval();
    }
  }

  // Create a new buffer
  createBuffer(
    bufferId: string,
    options: {
      config?: StreamBufferConfig;
      sequenceId?: string;
      metadata?: Record<string, any>;
      onFlush?: (data: any, context: any) => Promise<Chunk[]>;
    } = {}
  ): StreamBuffer {
    if (this.buffers.has(bufferId)) {
      throw new Error(`Buffer with id "${bufferId}" already exists`);
    }

    // Check buffer limit
    if (this.buffers.size >= this.config.maxBuffers!) {
      logger.warn('Maximum buffer limit reached', {
        currentCount: this.buffers.size,
        maxBuffers: this.config.maxBuffers
      });

      // Force cleanup to make room
      this.cleanup();

      if (this.buffers.size >= this.config.maxBuffers!) {
        throw new Error(`Cannot create buffer "${bufferId}" - maximum buffer limit (${this.config.maxBuffers}) reached`);
      }
    }

    const bufferConfig = options.config || this.config.defaultBufferConfig!;
    const bufferOptions: StreamBufferOptions = {
      id: bufferId,
      config: bufferConfig,
      onFlush: options.onFlush
    };

    const buffer = new StreamBuffer(bufferOptions);
    const now = new Date();

    const bufferInfo: BufferInfo = {
      id: bufferId,
      buffer,
      createdAt: now,
      lastActivity: now,
      sequenceId: options.sequenceId,
      metadata: options.metadata || {}
    };

    this.buffers.set(bufferId, bufferInfo);

    // Set up buffer event listeners
    this.setupBufferEventListeners(bufferId, buffer);

    logger.info('Buffer created', {
      bufferId,
      config: bufferConfig,
      sequenceId: options.sequenceId,
      totalBuffers: this.buffers.size
    });

    return buffer;
  }

  // Get existing buffer
  getBuffer(bufferId: string): StreamBuffer | undefined {
    const bufferInfo = this.buffers.get(bufferId);
    if (bufferInfo) {
      // Update last activity time
      bufferInfo.lastActivity = new Date();
      return bufferInfo.buffer;
    }
    return undefined;
  }

  // Get buffer info
  getBufferInfo(bufferId: string): BufferInfo | undefined {
    return this.buffers.get(bufferId);
  }

  // Add chunk to specific buffer
  addChunk(
    bufferId: string,
    chunk: Chunk,
    options: {
      createIfNotExists?: boolean;
      bufferConfig?: StreamBufferConfig;
    } = {}
  ): { success: boolean; shouldFlush?: boolean; flushReason?: string; bufferId?: string } {
    let buffer = this.getBuffer(bufferId);

    if (!buffer && options.createIfNotExists) {
      try {
        buffer = this.createBuffer(bufferId, {
          config: options.bufferConfig
        });
        logger.debug('Auto-created buffer', { bufferId });
      } catch (error) {
        logger.error('Failed to auto-create buffer', error as Error, { bufferId });
        return { success: false };
      }
    }

    if (!buffer) {
      logger.warn('Buffer not found', { bufferId });
      return { success: false };
    }

    const result = buffer.addChunk(chunk);

    // Update total chunks processed
    this.totalChunksProcessed++;

    return {
      success: true,
      shouldFlush: result.shouldFlush,
      flushReason: result.flushReason,
      bufferId
    };
  }

  // Add chunks to specific buffer
  addChunks(
    bufferId: string,
    chunks: Chunk[],
    options: {
      createIfNotExists?: boolean;
      bufferConfig?: StreamBufferConfig;
    } = {}
  ): { success: boolean; shouldFlush?: boolean; flushReason?: string; bufferId?: string } {
    let buffer = this.getBuffer(bufferId);

    if (!buffer && options.createIfNotExists) {
      try {
        buffer = this.createBuffer(bufferId, {
          config: options.bufferConfig
        });
      } catch (error) {
        logger.error('Failed to auto-create buffer', error as Error, { bufferId });
        return { success: false };
      }
    }

    if (!buffer) {
      logger.warn('Buffer not found', { bufferId });
      return { success: false };
    }

    const result = buffer.addChunks(chunks);

    // Update total chunks processed
    this.totalChunksProcessed += chunks.length;

    return {
      success: true,
      shouldFlush: result.shouldFlush,
      flushReason: result.flushReason,
      bufferId
    };
  }

  // Flush specific buffer
  async flushBuffer(bufferId: string, reason: 'size' | 'time' | 'hybrid' | 'manual' = 'manual'): Promise<Chunk[]> {
    const buffer = this.getBuffer(bufferId);
    if (!buffer) {
      throw new Error(`Buffer "${bufferId}" not found`);
    }

    const chunks = await buffer.flush(reason);
    this.totalFlushes++;

    logger.debug('Buffer flushed', {
      bufferId,
      reason,
      chunkCount: chunks.length
    });

    return chunks;
  }

  // Flush all buffers
  async flushAllBuffers(reason: 'size' | 'time' | 'hybrid' | 'manual' = 'manual'): Promise<{
    bufferId: string;
    chunks: Chunk[];
    error?: Error;
  }[]> {
    const results: Array<{
      bufferId: string;
      chunks: Chunk[];
      error?: Error;
    }> = [];

    for (const [bufferId, bufferInfo] of this.buffers.entries()) {
      try {
        const chunks = await bufferInfo.buffer.flush(reason);
        this.totalFlushes++;
        results.push({ bufferId, chunks });
      } catch (error) {
        logger.error('Buffer flush failed', error as Error, { bufferId });
        results.push({ bufferId, chunks: [], error: error as Error });
      }
    }

    logger.info('All buffers flushed', {
      reason,
      totalBuffers: results.length,
      successCount: results.filter(r => !r.error).length
    });

    return results;
  }

  // Remove buffer
  removeBuffer(bufferId: string): boolean {
    const bufferInfo = this.buffers.get(bufferId);
    if (!bufferInfo) {
      return false;
    }

    // Destroy buffer
    bufferInfo.buffer.destroy();
    this.buffers.delete(bufferId);

    logger.info('Buffer removed', {
      bufferId,
      remainingBuffers: this.buffers.size
    });

    return true;
  }

  // Set up event listeners for a buffer
  private setupBufferEventListeners(bufferId: string, buffer: StreamBuffer): void {
    // Forward buffer events to BufferManager
    buffer.on('flushed', (data) => {
      this.bufferEvent.emit('buffer:flushed', {
        bufferId,
        ...data
      });

      // Update total flushes
      this.totalFlushes++;
    });
  }

  // Start cleanup interval
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Check every minute
  }

  // Cleanup old or inactive buffers
  cleanup(): {
    removedBuffers: string[];
    remainingBuffers: number;
  } {
    const now = Date.now();
    const removedBuffers: string[] = [];
    const cleanupAge = this.config.cleanupAge!;

    for (const [bufferId, bufferInfo] of this.buffers.entries()) {
      const age = now - bufferInfo.createdAt.getTime();
      const inactiveTime = now - bufferInfo.lastActivity.getTime();

      // Remove buffers that are too old or have been inactive too long
      if (age > cleanupAge || inactiveTime > cleanupAge / 2) {
        try {
          bufferInfo.buffer.destroy();
          this.buffers.delete(bufferId);
          removedBuffers.push(bufferId);

          logger.debug('Buffer cleaned up', {
            bufferId,
            age,
            inactiveTime,
            reason: age > cleanupAge ? 'old' : 'inactive'
          });
        } catch (error) {
          logger.error('Failed to cleanup buffer', error as Error, { bufferId });
        }
      }
    }

    if (removedBuffers.length > 0) {
      logger.info('Buffer cleanup completed', {
        removedCount: removedBuffers.length,
        remainingBuffers: this.buffers.size,
        removedBuffers
      });
    }

    return {
      removedBuffers,
      remainingBuffers: this.buffers.size
    };
  }

  // Get all buffer IDs
  getBufferIds(): string[] {
    return Array.from(this.buffers.keys());
  }

  // Get all buffer info
  getAllBufferInfo(): Record<string, BufferInfo> {
    const info: Record<string, BufferInfo> = {};
    for (const [bufferId, bufferInfo] of this.buffers.entries()) {
      info[bufferId] = { ...bufferInfo };
    }
    return info;
  }

  // Get buffer statistics
  getStats(): BufferManagerStats {
    const now = Date.now();
    const buffers = Array.from(this.buffers.values());

    const totalAge = buffers.reduce((sum, info) => sum + (now - info.createdAt.getTime()), 0);
    const averageAge = buffers.length > 0 ? totalAge / buffers.length : 0;

    // Count buffers by state
    const buffersByState: Record<string, number> = {
      active: 0,
      inactive: 0,
      full: 0,
      empty: 0
    };

    for (const bufferInfo of buffers) {
      const state = bufferInfo.buffer.getState();

      if (state.isActive) {
        buffersByState.active++;
      } else {
        buffersByState.inactive++;
      }

      if (state.isFull) {
        buffersByState.full++;
      }

      if (state.isEmpty) {
        buffersByState.empty++;
      }
    }

    return {
      totalBuffers: buffers.length,
      activeBuffers: buffersByState.active,
      totalChunksProcessed: this.totalChunksProcessed,
      totalFlushes: this.totalFlushes,
      averageBufferAge: averageAge,
      buffersByState
    };
  }

  // Get detailed performance metrics
  getPerformanceMetrics() {
    const managerStats = this.getStats();
    const eventStats = this.bufferEvent.getPerformanceMetrics();

    return {
      manager: managerStats,
      buffers: eventStats,
      efficiency: this.bufferEvent.analyzeBufferEfficiency()
    };
  }

  // Update configuration
  updateConfig(newConfig: Partial<BufferManagerConfig>): void {
    const oldConfig = { ...this.config };
    Object.assign(this.config, newConfig);

    logger.info('BufferManager configuration updated', {
      oldConfig,
      newConfig: this.config
    });

    // Update cleanup interval if needed
    if (oldConfig.autoCleanup !== this.config.autoCleanup) {
      if (this.config.autoCleanup) {
        this.startCleanupInterval();
      } else if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = undefined;
      }
    }
  }

  // Pause all buffers
  pauseAll(): void {
    for (const [bufferId, bufferInfo] of this.buffers.entries()) {
      bufferInfo.buffer.pause();
    }

    logger.info('All buffers paused', {
      totalBuffers: this.buffers.size
    });
  }

  // Resume all buffers
  resumeAll(): void {
    for (const [bufferId, bufferInfo] of this.buffers.entries()) {
      bufferInfo.buffer.resume();
    }

    logger.info('All buffers resumed', {
      totalBuffers: this.buffers.size
    });
  }

  // Destroy all buffers
  destroyAll(): Chunk[][] {
    const allChunks: Chunk[][] = [];

    for (const [bufferId, bufferInfo] of this.buffers.entries()) {
      try {
        const remainingChunks = bufferInfo.buffer.destroy();
        allChunks.push(remainingChunks);
      } catch (error) {
        logger.error('Failed to destroy buffer', error as Error, { bufferId });
        allChunks.push([]);
      }
    }

    this.buffers.clear();

    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    logger.info('All buffers destroyed', {
      totalBuffers: allChunks.length,
      totalRemainingChunks: allChunks.reduce((sum, chunks) => sum + chunks.length, 0)
    });

    return allChunks;
  }

  // Find buffers by metadata
  findBuffersByMetadata(key: string, value: any): string[] {
    const matchingBuffers: string[] = [];

    for (const [bufferId, bufferInfo] of this.buffers.entries()) {
      if (bufferInfo.metadata[key] === value) {
        matchingBuffers.push(bufferId);
      }
    }

    return matchingBuffers;
  }

  // Find buffers by sequence ID
  findBuffersBySequenceId(sequenceId: string): string[] {
    const matchingBuffers: string[] = [];

    for (const [bufferId, bufferInfo] of this.buffers.entries()) {
      if (bufferInfo.sequenceId === sequenceId) {
        matchingBuffers.push(bufferId);
      }
    }

    return matchingBuffers;
  }

  // Get memory usage across all buffers
  getMemoryUsage(): {
    totalBuffers: number;
    totalChunks: number;
    totalCharacters: number;
    estimatedBytes: number;
    bufferBreakdown: Array<{
      bufferId: string;
      chunks: number;
      characters: number;
      bytes: number;
    }>;
  } {
    let totalChunks = 0;
    let totalCharacters = 0;
    const bufferBreakdown: Array<{
      bufferId: string;
      chunks: number;
      characters: number;
      bytes: number;
    }> = [];

    for (const [bufferId, bufferInfo] of this.buffers.entries()) {
      const usage = bufferInfo.buffer.getMemoryUsage();

      totalChunks += usage.chunks;
      totalCharacters += usage.totalCharacters;

      bufferBreakdown.push({
        bufferId,
        chunks: usage.chunks,
        characters: usage.totalCharacters,
        bytes: usage.estimatedBytes
      });
    }

    return {
      totalBuffers: this.buffers.size,
      totalChunks,
      totalCharacters,
      estimatedBytes: totalCharacters * 2, // Rough estimate
      bufferBreakdown
    };
  }

  // Export configuration for backup
  exportConfiguration(): {
    managerConfig: BufferManagerConfig;
    bufferConfigs: Record<string, StreamBufferConfig>;
    bufferCount: number;
  } {
    const bufferConfigs: Record<string, StreamBufferConfig> = {};

    for (const [bufferId, bufferInfo] of this.buffers.entries()) {
      bufferConfigs[bufferId] = bufferInfo.buffer.config;
    }

    return {
      managerConfig: this.config,
      bufferConfigs,
      bufferCount: this.buffers.size
    };
  }
}