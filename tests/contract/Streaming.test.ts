// Contract tests for Streaming functionality
// These tests validate the streaming implementation meets the specified contract

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

// Import streaming components
import { HookableLLM } from '../../src/core/HookableLLM';
import { StreamBuffer } from '../../src/streaming/StreamBuffer';
import { BufferManager } from '../../src/streaming/BufferManager';
import { ChunkEvent } from '../../src/events/ChunkEvent';
import { BufferFlushEvent } from '../../src/events/BufferEvent';
import { InMemoryPersistence } from '../../src/persistence/InMemoryPersistence';
import {
  createChunkEvent,
  createBufferFlushEvent,
  createStreamBuffer,
  createBufferManager,
  DefaultBufferConfigs,
  BufferStrategies,
  FlushReasons
} from '../../src/index';

describe('Streaming Components - Contract Tests', () => {
  describe('StreamBuffer', () => {
    let buffer: StreamBuffer;

    beforeEach(() => {
      buffer = createStreamBuffer('test-buffer', {
        config: DefaultBufferConfigs.SMALL_FAST
      });
    });

    afterEach(() => {
      if (buffer) {
        buffer.destroy();
      }
    });

    it('should create StreamBuffer with valid config', () => {
      expect(() => {
        createStreamBuffer('test', {
          config: { maxSize: 10, maxTime: 100, strategy: BufferStrategies.SIZE, enableMetrics: true }
        });
      }).not.toThrow();
    });

    it('should accept all buffer strategies', () => {
      expect(() => {
        createStreamBuffer('test1', { config: { ...DefaultBufferConfigs.SIZE_BASED, strategy: BufferStrategies.SIZE } });
        createStreamBuffer('test2', { config: { ...DefaultBufferConfigs.TIME_BASED, strategy: BufferStrategies.TIME } });
        createStreamBuffer('test3', { config: { ...DefaultBufferConfigs.MEDIUM_BALANCED, strategy: BufferStrategies.HYBRID } });
      }).not.toThrow();
    });

    it('should add chunks and return proper result structure', () => {
      const chunk = ChunkEvent.createChunk('test content');
      const result = buffer.addChunk(chunk);

      expect(result).toHaveProperty('shouldFlush');
      expect(result).toHaveProperty('bufferedChunks');
      expect(typeof result.shouldFlush).toBe('boolean');
      expect(typeof result.bufferedChunks).toBe('number');
    });

    it('should add multiple chunks efficiently', () => {
      const chunks = Array.from({ length: 5 }, (_, i) =>
        ChunkEvent.createChunk(`chunk ${i}`, { index: i })
      );

      const result = buffer.addChunks(chunks);

      expect(result).toHaveProperty('shouldFlush');
      expect(result).toHaveProperty('bufferedChunks');
      expect(result.bufferedChunks).toBe(chunks.length);
    });

    it('should flush manually and return chunks', async () => {
      const chunk = ChunkEvent.createChunk('test content');
      buffer.addChunk(chunk);

      const flushedChunks = await buffer.flush(FlushReasons.MANUAL);

      expect(Array.isArray(flushedChunks)).toBe(true);
      expect(flushedChunks.length).toBeGreaterThanOrEqual(0);
    });

    it('should provide buffer state information', () => {
      const state = buffer.getState();

      expect(state).toHaveProperty('isActive');
      expect(state).toHaveProperty('chunkCount');
      expect(state).toHaveProperty('totalSize');
      expect(state).toHaveProperty('age');
      expect(state).toHaveProperty('timeSinceLastChunk');
      expect(state).toHaveProperty('utilization');

      expect(typeof state.isActive).toBe('boolean');
      expect(typeof state.chunkCount).toBe('number');
      expect(typeof state.totalSize).toBe('number');
      expect(typeof state.age).toBe('number');
      expect(typeof state.utilization).toBe('number');
    });

    it('should provide buffer statistics', () => {
      const stats = buffer.getStats();

      expect(stats).toHaveProperty('totalChunksAdded');
      expect(stats).toHaveProperty('totalFlushes');
      expect(stats).toHaveProperty('averageChunksPerFlush');
      expect(stats).toHaveProperty('averageProcessingTime');
      expect(stats).toHaveProperty('bufferUtilization');

      expect(typeof stats.totalChunksAdded).toBe('number');
      expect(typeof stats.totalFlushes).toBe('number');
    });

    it('should support pause and resume operations', () => {
      expect(() => {
        buffer.pause();
        buffer.resume();
      }).not.toThrow();

      const state = buffer.getState();
      expect(state.isActive).toBe(true);
    });

    it('should handle cleanup without errors', () => {
      expect(() => {
        buffer.destroy();
      }).not.toThrow();
    });
  });

  describe('BufferManager', () => {
    let manager: BufferManager;

    beforeEach(() => {
      manager = createBufferManager({
        maxBuffers: 10,
        autoCleanup: true,
        enableMetrics: true
      });
    });

    afterEach(() => {
      if (manager) {
        manager.destroyAll();
      }
    });

    it('should create BufferManager with valid config', () => {
      expect(() => {
        createBufferManager({
          defaultBufferConfig: DefaultBufferConfigs.MEDIUM_BALANCED,
          maxBuffers: 50,
          autoCleanup: true,
          cleanupAge: 60000,
          enableMetrics: true
        });
      }).not.toThrow();
    });

    it('should create and manage multiple buffers', () => {
      const buffer1 = manager.createBuffer('buffer1', {
        config: DefaultBufferConfigs.SMALL_FAST
      });

      const buffer2 = manager.createBuffer('buffer2', {
        config: DefaultBufferConfigs.MEDIUM_BALANCED
      });

      expect(buffer1).toBeDefined();
      expect(buffer2).toBeDefined();
      expect(buffer1.id).toBe('buffer1');
      expect(buffer2.id).toBe('buffer2');
    });

    it('should prevent duplicate buffer IDs', () => {
      manager.createBuffer('unique-buffer');

      expect(() => {
        manager.createBuffer('unique-buffer');
      }).toThrow('already exists');
    });

    it('should retrieve existing buffers', () => {
      const originalBuffer = manager.createBuffer('test-buffer');
      const retrievedBuffer = manager.getBuffer('test-buffer');

      expect(retrievedBuffer).toBe(originalBuffer);
    });

    it('should return undefined for non-existent buffers', () => {
      const buffer = manager.getBuffer('non-existent');
      expect(buffer).toBeUndefined();
    });

    it('should add chunks to existing buffers', () => {
      manager.createBuffer('test-buffer');
      const chunk = ChunkEvent.createChunk('test content');

      const result = manager.addChunk('test-buffer', chunk);

      expect(result.success).toBe(true);
      expect(result.bufferId).toBe('test-buffer');
    });

    it('should create buffer if not exists when requested', () => {
      const chunk = ChunkEvent.createChunk('test content');

      const result = manager.addChunk('new-buffer', chunk, {
        createIfNotExists: true,
        bufferConfig: DefaultBufferConfigs.SMALL_FAST
      });

      expect(result.success).toBe(true);
      expect(result.bufferId).toBe('new-buffer');
    });

    it('should fail to add chunk to non-existent buffer without auto-create', () => {
      const chunk = ChunkEvent.createChunk('test content');

      const result = manager.addChunk('non-existent', chunk, {
        createIfNotExists: false
      });

      expect(result.success).toBe(false);
    });

    it('should flush individual buffers', async () => {
      manager.createBuffer('test-buffer');
      const chunk = ChunkEvent.createChunk('test content');
      manager.addChunk('test-buffer', chunk);

      const flushedChunks = await manager.flushBuffer('test-buffer', FlushReasons.MANUAL);

      expect(Array.isArray(flushedChunks)).toBe(true);
    });

    it('should flush all buffers', async () => {
      manager.createBuffer('buffer1');
      manager.createBuffer('buffer2');

      const chunk1 = ChunkEvent.createChunk('content1');
      const chunk2 = ChunkEvent.createChunk('content2');

      manager.addChunk('buffer1', chunk1);
      manager.addChunk('buffer2', chunk2);

      const results = await manager.flushAllBuffers(FlushReasons.MANUAL);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(2);
      expect(results[0]).toHaveProperty('bufferId');
      expect(results[0]).toHaveProperty('chunks');
    });

    it('should provide manager statistics', () => {
      const stats = manager.getStats();

      expect(stats).toHaveProperty('totalBuffers');
      expect(stats).toHaveProperty('activeBuffers');
      expect(stats).toHaveProperty('totalChunksProcessed');
      expect(stats).toHaveProperty('totalFlushes');
      expect(stats).toHaveProperty('averageBufferAge');
      expect(stats).toHaveProperty('buffersByState');

      expect(typeof stats.totalBuffers).toBe('number');
      expect(typeof stats.activeBuffers).toBe('number');
      expect(typeof stats.buffersByState).toBe('object');
    });

    it('should handle buffer cleanup', () => {
      manager.createBuffer('test-buffer');
      expect(manager.getBufferIds()).toContain('test-buffer');

      const removed = manager.removeBuffer('test-buffer');

      expect(removed).toBe(true);
      expect(manager.getBufferIds()).not.toContain('test-buffer');
    });

    it('should provide memory usage information', () => {
      const memoryUsage = manager.getMemoryUsage();

      expect(memoryUsage).toHaveProperty('totalBuffers');
      expect(memoryUsage).toHaveProperty('totalChunks');
      expect(memoryUsage).toHaveProperty('totalCharacters');
      expect(memoryUsage).toHaveProperty('estimatedBytes');
      expect(memoryUsage).toHaveProperty('bufferBreakdown');

      expect(typeof memoryUsage.totalBuffers).toBe('number');
      expect(typeof memoryUsage.estimatedBytes).toBe('number');
      expect(Array.isArray(memoryUsage.bufferBreakdown)).toBe(true);
    });
  });

  describe('ChunkEvent', () => {
    let chunkEvent: ChunkEvent;

    beforeEach(() => {
      chunkEvent = createChunkEvent();
    });

    afterEach(() => {
      if (chunkEvent) {
        chunkEvent.clearChunkHooks();
        chunkEvent.resetPerformanceMetrics();
      }
    });

    it('should create ChunkEvent instance', () => {
      expect(() => {
        createChunkEvent();
      }).not.toThrow();
    });

    it('should create chunks with required properties', () => {
      const chunk = ChunkEvent.createChunk('test content', {
        index: 1,
        sequenceId: 'test-sequence',
        metadata: { test: true }
      });

      expect(chunk).toHaveProperty('id');
      expect(chunk).toHaveProperty('content');
      expect(chunk).toHaveProperty('index');
      expect(chunk).toHaveProperty('timestamp');
      expect(chunk).toHaveProperty('metadata');
      expect(chunk).toHaveProperty('isComplete');

      expect(typeof chunk.id).toBe('string');
      expect(typeof chunk.content).toBe('string');
      expect(typeof chunk.index).toBe('number');
      expect(chunk.timestamp).toBeInstanceOf(Date);
      expect(typeof chunk.isComplete).toBe('boolean');
    });

    it('should create chunks from text', () => {
      const text = 'This is a longer text that should be split into multiple chunks for testing purposes.';
      const chunks = ChunkEvent.createChunksFromText(text, {
        chunkSize: 10,
        overlap: 2,
        sequenceId: 'test-sequence'
      });

      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBeGreaterThan(1);

      chunks.forEach((chunk, index) => {
        expect(chunk.content.length).toBeGreaterThan(0);
        expect(chunk.index).toBe(index);
        expect(chunk.sequenceId).toBe('test-sequence');
      });
    });

    it('should merge chunks back into text', () => {
      const originalText = 'This is the original text that we will chunk and then merge back together.';
      const chunks = ChunkEvent.createChunksFromText(originalText, { chunkSize: 15 });
      const mergedText = ChunkEvent.mergeChunks(chunks);

      expect(mergedText).toBe(originalText);
    });

    it('should process chunks through hooks', async () => {
      const chunk = ChunkEvent.createChunk('test content');
      const beforeHook = jest.fn((data) => data);
      const afterHook = jest.fn((data) => data);

      chunkEvent.onChunkBefore(beforeHook);
      chunkEvent.onChunkAfter(afterHook);

      const result = await chunkEvent.processChunkBefore(chunk, 'outgoing');
      const afterResult = await chunkEvent.processChunkAfter(result.chunk, 'outgoing');

      expect(beforeHook).toHaveBeenCalled();
      expect(afterHook).toHaveBeenCalled();
      expect(result.chunk).toBeDefined();
      expect(afterResult.chunk).toBeDefined();
    });

    it('should provide performance metrics', () => {
      const metrics = chunkEvent.getPerformanceMetrics();

      expect(metrics).toHaveProperty('totalChunks');
      expect(metrics).toHaveProperty('averageProcessingTime');
      expect(metrics).toHaveProperty('hookExecutionTime');
      expect(metrics).toHaveProperty('successfulHooks');
      expect(metrics).toHaveProperty('failedHooks');
      expect(metrics).toHaveProperty('averageChunkSize');
      expect(metrics).toHaveProperty('chunksPerSecond');
      expect(metrics).toHaveProperty('bufferFlushes');

      expect(typeof metrics.totalChunks).toBe('number');
      expect(typeof metrics.averageProcessingTime).toBe('number');
      expect(typeof metrics.chunksPerSecond).toBe('number');
    });

    it('should validate chunk structure', () => {
      const validChunk = ChunkEvent.createChunk('valid');
      const invalidChunk = { content: 'invalid' };

      expect(ChunkEvent.validateChunkStructure(validChunk)).toBe(true);
      expect(ChunkEvent.validateChunkStructure(invalidChunk)).toBe(false);
    });

    it('should support hook registration and removal', () => {
      const hook = jest.fn();

      expect(() => {
        chunkEvent.onChunkBefore(hook);
        chunkEvent.offChunkBefore(hook);
        chunkEvent.onChunkAfter(hook);
        chunkEvent.offChunkAfter(hook);
        chunkEvent.onceChunkBefore(hook);
        chunkEvent.onceChunkAfter(hook);
      }).not.toThrow();
    });
  });

  describe('BufferFlushEvent', () => {
    let bufferEvent: BufferFlushEvent;

    beforeEach(() => {
      bufferEvent = createBufferFlushEvent();
    });

    afterEach(() => {
      if (bufferEvent) {
        bufferEvent.clearBufferHooks();
        bufferEvent.resetPerformanceMetrics();
      }
    });

    it('should create BufferFlushEvent instance', () => {
      expect(() => {
        createBufferFlushEvent();
      }).not.toThrow();
    });

    it('should validate buffer configurations', () => {
      const validConfig = { maxSize: 10, maxTime: 100, strategy: BufferStrategies.HYBRID, enableMetrics: true };
      const invalidConfig = { maxSize: -1, maxTime: 0, strategy: 'invalid' as any, enableMetrics: 'not-boolean' as any };

      const validResult = BufferFlushEvent.validateBufferConfig(validConfig);
      const invalidResult = BufferFlushEvent.validateBufferConfig(invalidConfig);

      expect(validResult.isValid).toBe(true);
      expect(validResult.errors).toHaveLength(0);

      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);
    });

    it('should create default buffer configuration', () => {
      const defaultConfig = BufferFlushEvent.createDefaultBufferConfig();

      expect(defaultConfig).toHaveProperty('maxSize');
      expect(defaultConfig).toHaveProperty('maxTime');
      expect(defaultConfig).toHaveProperty('strategy');
      expect(defaultConfig).toHaveProperty('enableMetrics');

      expect(defaultConfig.maxSize).toBeGreaterThan(0);
      expect(defaultConfig.maxTime).toBeGreaterThan(0);
      expect([BufferStrategies.SIZE, BufferStrategies.TIME, BufferStrategies.HYBRID]).toContain(defaultConfig.strategy);
      expect(typeof defaultConfig.enableMetrics).toBe('boolean');
    });

    it('should process buffer flush through hooks', async () => {
      const chunks = [
        ChunkEvent.createChunk('chunk 1', { index: 0 }),
        ChunkEvent.createChunk('chunk 2', { index: 1 })
      ];

      const hook = jest.fn((data) => data);
      bufferEvent.onBufferFlush(hook);

      const result = await bufferEvent.processBufferFlush(
        'test-buffer',
        chunks,
        FlushReasons.MANUAL,
        { source: 'test' }
      );

      expect(hook).toHaveBeenCalled();
      expect(result.chunks).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it('should provide performance metrics', () => {
      const metrics = bufferEvent.getPerformanceMetrics();

      expect(metrics).toHaveProperty('totalBuffers');
      expect(metrics).toHaveProperty('averageBufferSize');
      expect(metrics).toHaveProperty('averageFlushTime');
      expect(metrics).toHaveProperty('totalChunksProcessed');
      expect(metrics).toHaveProperty('flushesByReason');
      expect(metrics).toHaveProperty('bufferUtilization');

      expect(typeof metrics.totalBuffers).toBe('number');
      expect(typeof metrics.averageBufferSize).toBe('number');
      expect(typeof metrics.flushesByReason).toBe('object');
    });

    it('should analyze buffer efficiency', () => {
      const analysis = bufferEvent.analyzeBufferEfficiency();

      expect(analysis).toHaveProperty('overall');
      expect(analysis).toHaveProperty('recommendations');

      expect(analysis.overall).toHaveProperty('averageChunksPerFlush');
      expect(analysis.overall).toHaveProperty('averageSizePerFlush');
      expect(analysis.overall).toHaveProperty('averageTimePerFlush');
      expect(analysis.overall).toHaveProperty('flushFrequency');

      expect(Array.isArray(analysis.recommendations)).toBe(true);
    });

    it('should support hook registration and removal', () => {
      const hook = jest.fn();

      expect(() => {
        bufferEvent.onBufferFlush(hook);
        bufferEvent.offBufferFlush(hook);
        bufferEvent.onceBufferFlush(hook);
      }).not.toThrow();
    });

    it('should manage buffer configurations', () => {
      const config = { maxSize: 20, maxTime: 150, strategy: BufferStrategies.HYBRID, enableMetrics: false };

      expect(() => {
        bufferEvent.setBufferConfig('test-buffer', config);
        const retrievedConfig = bufferEvent.getBufferConfig('test-buffer');
        expect(retrievedConfig).toEqual(config);

        bufferEvent.removeBufferConfig('test-buffer');
        const removedConfig = bufferEvent.getBufferConfig('test-buffer');
        expect(removedConfig).toBeUndefined();
      }).not.toThrow();
    });
  });

  describe('HookableLLM Streaming Integration', () => {
    let llm: HookableLLM;

    beforeEach(async () => {
      llm = new HookableLLM({
        apiKey: 'test-api-key',
        model: 'gpt-4',
        persistence: new InMemoryPersistence()
      });
      await llm.initialize();
    });

    afterEach(async () => {
      if (llm) {
        await llm.cleanup();
      }
    });

    it('should support streaming hooks', () => {
      const chunkHook = jest.fn();
      const bufferHook = jest.fn();

      expect(() => {
        llm.onChunkBefore(chunkHook);
        llm.onChunkAfter(chunkHook);
        llm.onBufferFlush(bufferHook);
        llm.onceBufferFlush(bufferHook);
      }).not.toThrow();
    });

    it('should execute streaming with mock data', async () => {
      const chunkBeforeHook = jest.fn();
      const chunkAfterHook = jest.fn();
      const bufferFlushHook = jest.fn();

      llm.onChunkBefore(chunkBeforeHook);
      llm.onChunkAfter(chunkAfterHook);
      llm.onBufferFlush(bufferFlushHook);

      const result = await llm.runStream('test message', {
        bufferConfig: DefaultBufferConfigs.SMALL_FAST
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.conversationId).toBeDefined();
      expect(result.bufferId).toBeDefined();
      expect(result.totalChunks).toBeGreaterThanOrEqual(0);
      expect(result.totalCharacters).toBeGreaterThanOrEqual(0);
      expect(result.chunks).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it('should process individual chunks', async () => {
      const chunk = ChunkEvent.createChunk('test content');

      const result = await llm.processChunk(chunk, {
        direction: 'outgoing',
        source: 'test'
      });

      expect(result.chunk).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.before).toBeDefined();
      expect(result.metadata.after).toBeDefined();
    });

    it('should create and manage stream buffers', () => {
      const buffer = llm.createStreamBuffer('test-stream-buffer', {
        config: DefaultBufferConfigs.MEDIUM_BALANCED,
        sequenceId: 'test-sequence'
      });

      expect(buffer).toBeDefined();
      expect(buffer.id).toBe('test-stream-buffer');

      const retrievedBuffer = llm.getStreamBuffer('test-stream-buffer');
      expect(retrievedBuffer).toBe(buffer);
    });

    it('should add chunks to buffers', () => {
      llm.createStreamBuffer('test-buffer');
      const chunk = ChunkEvent.createChunk('test content');

      const result = llm.addChunkToBuffer('test-buffer', chunk);

      expect(result.success).toBe(true);
      expect(result.bufferId).toBe('test-buffer');
    });

    it('should flush buffers manually', async () => {
      llm.createStreamBuffer('test-buffer');
      const chunk = ChunkEvent.createChunk('test content');
      llm.addChunkToBuffer('test-buffer', chunk);

      const flushedChunks = await llm.flushBuffer('test-buffer', FlushReasons.MANUAL);

      expect(Array.isArray(flushedChunks)).toBe(true);
    });

    it('should provide streaming statistics', () => {
      const stats = llm.getStreamingStats();

      expect(stats).toHaveProperty('bufferEvents');
      expect(stats).toHaveProperty('chunks');
      expect(stats).toHaveProperty('manager');
      expect(stats).toHaveProperty('efficiency');

      expect(typeof stats.manager).toBe('object');
      expect(typeof stats.efficiency).toBe('object');
    });

    it('should handle buffer configuration options', async () => {
      const result = await llm.runStream('test message', {
        bufferConfig: {
          maxSize: 5,
          maxTime: 50,
          strategy: BufferStrategies.HYBRID,
          enableMetrics: true
        }
      });

      expect(result).toBeDefined();
      expect(result.metadata.bufferConfig).toBeDefined();
    });
  });

  describe('Streaming Performance Requirements', () => {
    it('should create buffers within performance targets', () => {
      const startTime = Date.now();

      const buffer = createStreamBuffer('perf-test', {
        config: DefaultBufferConfigs.SMALL_FAST
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(10); // Should create in <10ms

      buffer.destroy();
    });

    it('should add chunks within performance targets', () => {
      const buffer = createStreamBuffer('perf-test');
      const chunk = ChunkEvent.createChunk('performance test content');

      const startTime = Date.now();
      const result = buffer.addChunk(chunk);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5); // Should add chunk in <5ms
      expect(typeof result.shouldFlush).toBe('boolean');

      buffer.destroy();
    });

    it('should handle concurrent chunk processing', async () => {
      const chunkEvent = createChunkEvent();
      const hook = jest.fn((data) => data);
      chunkEvent.onChunkBefore(hook);

      const startTime = Date.now();

      const chunks = Array.from({ length: 50 }, (_, i) =>
        ChunkEvent.createChunk(`chunk ${i}`, { index: i })
      );

      // Process chunks concurrently
      await Promise.all(
        chunks.map(chunk => chunkEvent.processChunkBefore(chunk, 'outgoing'))
      );

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Should process 50 chunks in <100ms

      expect(hook).toHaveBeenCalledTimes(50);
    });

    it('should maintain buffer manager performance under load', () => {
      const manager = createBufferManager({ maxBuffers: 100 });

      const startTime = Date.now();

      // Create many buffers
      for (let i = 0; i < 50; i++) {
        manager.createBuffer(`buffer-${i}`, {
          config: DefaultBufferConfigs.SMALL_FAST
        });
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(50); // Should create 50 buffers in <50ms

      expect(manager.getBufferIds().length).toBe(50);

      manager.destroyAll();
    });
  });

  describe('Type Safety and Validation', () => {
    it('should enforce chunk interface requirements', () => {
      const validChunk = ChunkEvent.createChunk('valid content');

      expect(ChunkEvent.validateChunkStructure(validChunk)).toBe(true);

      const invalidChunks = [
        null,
        undefined,
        {},
        { content: 'missing id' },
        { id: 'test', content: 123 }, // wrong type
        { id: 'test', content: 'valid', index: 'not-number' }
      ];

      invalidChunks.forEach(chunk => {
        expect(ChunkEvent.validateChunkStructure(chunk)).toBe(false);
      });
    });

    it('should validate buffer configuration types', () => {
      const validConfigs = [
        { maxSize: 10, maxTime: 100, strategy: BufferStrategies.SIZE, enableMetrics: true },
        { maxSize: 1, maxTime: 1, strategy: BufferStrategies.TIME, enableMetrics: false },
        { maxSize: 100, maxTime: 5000, strategy: BufferStrategies.HYBRID, enableMetrics: true }
      ];

      validConfigs.forEach(config => {
        const result = BufferFlushEvent.validateBufferConfig(config);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it('should reject invalid buffer configurations', () => {
      const invalidConfigs = [
        { maxSize: -1, maxTime: 100, strategy: BufferStrategies.SIZE, enableMetrics: true },
        { maxSize: 10, maxTime: 0, strategy: BufferStrategies.TIME, enableMetrics: true },
        { maxSize: 10, maxTime: 100, strategy: 'invalid' as any, enableMetrics: true },
        { maxSize: 10, maxTime: 100, strategy: BufferStrategies.HYBRID, enableMetrics: 'not-boolean' as any }
      ];

      invalidConfigs.forEach(config => {
        const result = BufferFlushEvent.validateBufferConfig(config);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });
  });
});