// Buffer flush event implementation for streaming LLM responses
import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger';
import {
  Chunk,
  BufferFlushEventData,
  BufferFlushHookContext,
  BufferValidationRule,
  BufferMetadata,
  BufferPerformanceMetrics,
  BufferTransform,
  BufferFilter,
  HookFunction,
  StreamBufferConfig
} from '../events/types';
import { HookableEventEmitter } from '../core/EventEmitter';

const logger = createLogger('BufferEvent');

export class BufferFlushEvent extends HookableEventEmitter {
  private performanceMetrics: BufferPerformanceMetrics = {
    totalBuffers: 0,
    averageBufferSize: 0,
    averageFlushTime: 0,
    totalChunksProcessed: 0,
    flushesByReason: {},
    bufferUtilization: 0
  };

  private validationRules: Map<string, BufferValidationRule> = new Map();
  private bufferConfigs = new Map<string, StreamBufferConfig>();

  constructor() {
    super();
    this.setupDefaultValidation();
  }

  private setupDefaultValidation(): void {
    // Default validation for buffer flushes
    this.addValidationRule('default', {
      required: ['bufferId', 'chunks', 'flushReason'],
      optional: ['totalSize', 'processingTime', 'metadata']
    });
  }

  // Add validation rules for buffer flushes
  addValidationRule(name: string, rule: BufferValidationRule): void {
    this.validationRules.set(name, rule);
    logger.debug('Buffer validation rule added', { name, required: rule.required });
  }

  // Remove validation rule
  removeValidationRule(name: string): void {
    this.validationRules.delete(name);
    logger.debug('Buffer validation rule removed', { name });
  }

  // Validate buffer flush data against rules
  private validateBufferFlush(
    data: BufferFlushEventData,
    ruleName: string = 'default'
  ): boolean {
    const rule = this.validationRules.get(ruleName);
    if (!rule) {
      logger.warn('Buffer validation rule not found', { ruleName });
      return true;
    }

    // Check required fields
    for (const field of rule.required) {
      if (!(field in data)) {
        logger.error('Buffer validation failed - missing required field', null, {
          field,
          ruleName,
          bufferId: data.bufferId
        });
        if (rule.errorMessage) {
          throw new Error(`${rule.errorMessage}: Missing required field '${field}'`);
        }
        return false;
      }
    }

    // Validate chunks array
    if (!Array.isArray(data.chunks)) {
      logger.error('Buffer validation failed - chunks must be an array');
      return false;
    }

    // Apply custom validator if provided
    if (rule.validator) {
      const isValid = rule.validator(data.chunks);
      if (!isValid) {
        logger.error('Buffer validation failed - custom validator', null, {
          ruleName,
          bufferId: data.bufferId,
          chunkCount: data.chunks.length
        });
        if (rule.errorMessage) {
          throw new Error(`${rule.errorMessage}: Custom validation failed`);
        }
        return false;
      }
    }

    return true;
  }

  // Create metadata for buffer processing
  private createBufferMetadata(
    source: string,
    requestId?: string,
    bufferId?: string
  ): BufferMetadata {
    return {
      processedAt: new Date(),
      source,
      version: '1.0.0',
      requestId,
      bufferId,
      processingLatency: 0
    };
  }

  // Create hook context for buffer processing
  private createHookContext(
    bufferId: string,
    totalHooks: number,
    executionOrder: number,
    flushReason: 'size' | 'time' | 'hybrid' | 'manual',
    chunkCount: number,
    totalSize: number
  ): BufferFlushHookContext {
    return {
      bufferId,
      hookId: `buffer-hook-${Date.now()}`,
      executionOrder,
      totalHooks,
      flushReason,
      chunkCount,
      totalSize
    };
  }

  // Process buffer flush through hooks
  async processBufferFlush(
    bufferId: string,
    chunks: Chunk[],
    flushReason: 'size' | 'time' | 'hybrid' | 'manual',
    options: {
      source?: string;
      requestId?: string;
      validationRule?: string;
      config?: StreamBufferConfig;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<{ chunks: Chunk[]; metadata: BufferMetadata }> {
    const startTime = Date.now();
    const {
      source = 'unknown',
      requestId,
      validationRule = 'default',
      config,
      metadata = {}
    } = options;

    try {
      // Store buffer config if provided
      if (config) {
        this.bufferConfigs.set(bufferId, config);
      }

      // Calculate total size
      const totalSize = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);

      // Create event data
      const eventData: BufferFlushEventData = {
        bufferId,
        chunks,
        flushReason,
        totalSize,
        processingTime: 0, // Will be updated after hooks
        metadata
      };

      // Validate buffer flush data
      this.validateBufferFlush(eventData, validationRule);

      // Create metadata
      const flushMetadata = this.createBufferMetadata(source, requestId, bufferId);

      // Get hook info for context
      const hookInfo = this.getHookInfo('buffer:flush');
      const context = this.createHookContext(
        bufferId,
        hookInfo.length,
        0,
        flushReason,
        chunks.length,
        totalSize
      );

      logger.debug('Processing buffer flush', {
        bufferId,
        flushReason,
        chunkCount: chunks.length,
        totalSize,
        hookCount: hookInfo.length
      });

      // Execute buffer flush hooks
      const processedData = await this.executeHooks('buffer:flush', eventData, context);

      // Update processing time in event data
      processedData.processingTime = Date.now() - startTime;

      // Update performance metrics
      this.updatePerformanceMetrics(startTime, hookInfo.length, chunks.length, totalSize, flushReason);

      logger.debug('Buffer flush processed', {
        bufferId,
        flushReason,
        processingTime: `${processedData.processingTime}ms`,
        chunkCount: processedData.chunks.length,
        chunksModified: processedData.chunks !== chunks
      });

      // Emit the processed buffer event
      this.emit('buffer:processed:flush', {
        originalChunks: chunks,
        processedChunks: processedData.chunks,
        metadata: flushMetadata,
        bufferId,
        flushReason,
        processingTime: processedData.processingTime
      });

      return {
        chunks: processedData.chunks,
        metadata: flushMetadata
      };

    } catch (error) {
      logger.error('Buffer flush processing failed', error as Error, {
        bufferId,
        flushReason,
        processingTime: `${Date.now() - startTime}ms`
      });
      throw error;
    }
  }

  // Update performance metrics
  private updatePerformanceMetrics(
    startTime: number,
    hookCount: number,
    chunkCount: number,
    totalSize: number,
    flushReason: 'size' | 'time' | 'hybrid' | 'manual'
  ): void {
    const processingTime = Date.now() - startTime;
    this.performanceMetrics.totalBuffers++;
    this.performanceMetrics.totalChunksProcessed += chunkCount;

    // Calculate average buffer size
    this.performanceMetrics.averageBufferSize =
      ((this.performanceMetrics.averageBufferSize * (this.performanceMetrics.totalBuffers - 1)) + chunkCount) /
      this.performanceMetrics.totalBuffers;

    // Calculate average flush time
    this.performanceMetrics.averageFlushTime =
      ((this.performanceMetrics.averageFlushTime * (this.performanceMetrics.totalBuffers - 1)) + processingTime) /
      this.performanceMetrics.totalBuffers;

    // Update flushes by reason
    const reasonKey = flushReason;
    this.performanceMetrics.flushesByReason[reasonKey] = (this.performanceMetrics.flushesByReason[reasonKey] || 0) + 1;

    // Calculate buffer utilization (based on stored configs)
    this.calculateBufferUtilization();
  }

  // Calculate buffer utilization across all buffers
  private calculateBufferUtilization(): void {
    if (this.bufferConfigs.size === 0) {
      this.performanceMetrics.bufferUtilization = 0;
      return;
    }

    let totalUtilization = 0;
    let configCount = 0;

    for (const [bufferId, config] of this.bufferConfigs.entries()) {
      // This is a simplified calculation - in a real implementation,
      // we'd need to track current buffer sizes
      const utilization = Math.min(1, (this.performanceMetrics.averageBufferSize / config.maxSize));
      totalUtilization += utilization;
      configCount++;
    }

    this.performanceMetrics.bufferUtilization = totalUtilization / configCount;
  }

  // Get current performance metrics
  getPerformanceMetrics(): BufferPerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  // Reset performance metrics
  resetPerformanceMetrics(): void {
    this.performanceMetrics = {
      totalBuffers: 0,
      averageBufferSize: 0,
      averageFlushTime: 0,
      totalChunksProcessed: 0,
      flushesByReason: {},
      bufferUtilization: 0
    };
    logger.info('Buffer performance metrics reset');
  }

  // Register buffer-specific hooks
  onBufferFlush(hook: HookFunction, priority?: number): this {
    return this.on('buffer:flush', hook, priority);
  }

  onceBufferFlush(hook: HookFunction, priority?: number): this {
    return this.once('buffer:flush', hook, priority);
  }

  // Remove buffer-specific hooks
  offBufferFlush(hook: HookFunction): this {
    return this.off('buffer:flush', hook);
  }

  // Get hook registration info
  getBufferHookInfo(): Array<{ id: string; priority: number }> {
    return this.getHookInfo('buffer:flush');
  }

  // Clear all buffer hooks
  clearBufferHooks(): void {
    this.removeAllListeners('buffer:flush');
    logger.info('All buffer hooks cleared');
  }

  // Get buffer configuration
  getBufferConfig(bufferId: string): StreamBufferConfig | undefined {
    return this.bufferConfigs.get(bufferId);
  }

  // Set buffer configuration
  setBufferConfig(bufferId: string, config: StreamBufferConfig): void {
    this.bufferConfigs.set(bufferId, config);
    logger.debug('Buffer configuration set', { bufferId, config });
  }

  // Remove buffer configuration
  removeBufferConfig(bufferId: string): void {
    this.bufferConfigs.delete(bufferId);
    logger.debug('Buffer configuration removed', { bufferId });
  }

  // Get all buffer configurations
  getAllBufferConfigs(): Record<string, StreamBufferConfig> {
    const configs: Record<string, StreamBufferConfig> = {};
    for (const [bufferId, config] of this.bufferConfigs.entries()) {
      configs[bufferId] = config;
    }
    return configs;
  }

  // Validate buffer configuration
  static validateBufferConfig(config: StreamBufferConfig): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!config.maxSize || config.maxSize <= 0) {
      errors.push('maxSize must be greater than 0');
    }

    if (!config.maxTime || config.maxTime <= 0) {
      errors.push('maxTime must be greater than 0');
    }

    if (!['size', 'time', 'hybrid'].includes(config.strategy)) {
      errors.push('strategy must be "size", "time", or "hybrid"');
    }

    if (typeof config.enableMetrics !== 'boolean') {
      errors.push('enableMetrics must be a boolean');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Create default buffer configuration
  static createDefaultBufferConfig(overrides: Partial<StreamBufferConfig> = {}): StreamBufferConfig {
    return {
      maxSize: 10,
      maxTime: 100,
      strategy: 'hybrid',
      enableMetrics: true,
      ...overrides
    };
  }

  // Analyze buffer efficiency
  analyzeBufferEfficiency(): {
    overall: {
      averageChunksPerFlush: number;
      averageSizePerFlush: number;
      averageTimePerFlush: number;
      flushFrequency: Record<string, number>;
    };
    recommendations: string[];
  } {
    const overall = {
      averageChunksPerFlush: this.performanceMetrics.totalBuffers > 0
        ? this.performanceMetrics.totalChunksProcessed / this.performanceMetrics.totalBuffers
        : 0,
      averageSizePerFlush: this.performanceMetrics.averageBufferSize,
      averageTimePerFlush: this.performanceMetrics.averageFlushTime,
      flushFrequency: this.performanceMetrics.flushesByReason
    };

    const recommendations: string[] = [];

    // Analyze flush frequency
    const totalFlushes = Object.values(overall.flushFrequency).reduce((sum, count) => sum + count, 0);
    if (totalFlushes > 0) {
      const sizeFlushes = overall.flushFrequency.size || 0;
      const timeFlushes = overall.flushFrequency.time || 0;

      if (sizeFlushes > totalFlushes * 0.7) {
        recommendations.push('Consider increasing buffer size to reduce size-based flushes');
      }

      if (timeFlushes > totalFlushes * 0.7) {
        recommendations.push('Consider increasing buffer timeout to reduce time-based flushes');
      }
    }

    // Analyze buffer size
    if (overall.averageChunksPerFlush < 2) {
      recommendations.push('Buffer appears underutilized - consider larger chunks or longer timeout');
    }

    if (overall.averageChunksPerFlush > 50) {
      recommendations.push('Large buffer sizes may cause latency - consider smaller buffers');
    }

    // Analyze processing time
    if (overall.averageTimePerFlush > 50) {
      recommendations.push('Slow buffer processing detected - optimize hook performance');
    }

    return { overall, recommendations };
  }
}