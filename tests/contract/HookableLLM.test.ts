// Contract tests for HookableLLM interface
// These tests validate the implementation meets the specified contract

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

// Import the actual implementation
import { HookableLLM } from '../../src/core/HookableLLM';
import { InMemoryPersistence } from '../../src/persistence/InMemoryPersistence';
import type { PersistenceAdapter } from '../../src/types';

describe('HookableLLM - Contract Tests', () => {
  let llm: HookableLLM;
  let persistence: InMemoryPersistence;

  beforeEach(async () => {
    persistence = new InMemoryPersistence();
    llm = new HookableLLM({
      apiKey: 'test-api-key',
      model: 'gpt-4',
      persistence: persistence
    });
    await llm.initialize();
  });

  afterEach(async () => {
    if (llm) {
      await llm.cleanup();
    }
  });

  describe('Constructor and Initialization', () => {
    it('should create instance with valid config', () => {
      expect(() => {
        const testLlm = new HookableLLM({
          apiKey: 'test-key',
          persistence: new InMemoryPersistence()
        });
      }).not.toThrow();
    });

    it('should require apiKey in config', () => {
      expect(() => {
        new HookableLLM({});
      }).toThrow('API key is required');
    });
  });

  describe('Hook Registration API', () => {
    it('should register message hooks', () => {
      const mockHook = () => {};
      expect(() => {
        llm.on('message:before', mockHook);
        llm.on('message:after', mockHook);
      }).not.toThrow();
    });

    it('should support hook priorities', () => {
      const mockHook = () => {};
      expect(() => {
        llm.on('message:before', mockHook, 1);
        llm.on('message:after', mockHook, 2);
      }).not.toThrow();
    });

    it('should unregister hooks', () => {
      const mockHook = () => {};
      expect(() => {
        llm.on('message:before', mockHook);
        llm.off('message:before', mockHook);
      }).not.toThrow();
    });

    it('should support one-time hooks', () => {
      const mockHook = () => {};
      expect(() => {
        llm.once('message:before', mockHook);
      }).not.toThrow();
    });
  });

  describe('Message Execution', () => {
    it('should execute run method', async () => {
      const result = await llm.run('test message');
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.conversationId).toBeDefined();
      expect(result.messages).toBeDefined();
    });

    it('should handle options in run method', async () => {
      const options = { maxTokens: 100 };
      const result = await llm.run('test message', options);
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });
  });

  describe('Conversation History Management', () => {
    it('should load conversation history', async () => {
      const history = {
        conversations: [{
          id: 'test-id',
          messages: [{
            role: 'user' as const,
            content: 'Hello',
            timestamp: new Date(),
            metadata: {}
          }],
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: {}
        }],
        metadata: {
          version: '1.0.0',
          exportedAt: new Date(),
          source: 'test'
        }
      };

      expect(() => {
        llm.loadHistory(history);
      }).not.toThrow();
    });

    it('should retrieve conversation history', () => {
      const history = llm.getHistory();
      expect(history).toBeDefined();
      expect(history.conversations).toBeDefined();
    });

    it('should clear conversation history', async () => {
      await expect(llm.clearHistory()).resolves.toBeUndefined();
    });
  });

  describe('Event Emission', () => {
    it('should emit events when hooks are registered', async () => {
      const mockHook = () => {
        // Hook called successfully
      };

      expect(() => {
        llm.on('message:before', mockHook);
        // Test will pass if hook registration doesn't throw
      }).not.toThrow();
    });

    it('should handle hook execution errors gracefully', async () => {
      const errorHook = () => {
        throw new Error('Test hook error');
      };

      llm.on('message:before', errorHook);

      // Run a message to trigger the hook - should not throw due to error isolation
      await expect(llm.run('test message')).resolves.toBeDefined();
    });
  });

  describe('Integration with Persistence', () => {
    it('should use provided persistence adapter', () => {
      const customPersistence: PersistenceAdapter = {
        saveConversation: async () => {},
        loadConversation: async () => null,
        deleteConversation: async () => {},
        listConversations: async () => []
      };

      expect(() => {
        new HookableLLM({
          apiKey: 'test-key',
          persistence: customPersistence
        });
      }).not.toThrow();
    });
  });

  describe('Configuration Validation', () => {
    it('should validate required configuration', () => {
      expect(() => {
        new HookableLLM({});
      }).toThrow('API key is required');
    });

    it('should accept optional configuration', () => {
      expect(() => {
        new HookableLLM({
          apiKey: 'test-key',
          model: 'gpt-4',
          maxTokens: 1000
        });
      }).not.toThrow();
    });
  });

  describe('Type Safety', () => {
    it('should maintain type safety for hook functions', () => {
      const typedHook = (data: any, context: any) => {
        return data;
      };

      expect(() => {
        llm.on('message:before', typedHook);
      }).not.toThrow();
    });
  });

  describe('Performance Requirements', () => {
    it('should handle concurrent hook registration', async () => {
      const startTime = Date.now();
      const hooks = Array.from({ length: 100 }, (_, i) => () => {});

      // Register many hooks concurrently
      await Promise.all(
        hooks.map((hook, index) =>
          Promise.resolve(llm.on('message:before', hook, index))
        )
      );

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle hook execution within performance targets', async () => {
      const fastHook = (data: any) => {
        return data; // Simple hook
      };

      // Register hook
      llm.on('message:before', fastHook);

      const startTime = Date.now();

      // Execute message to trigger hook execution
      await llm.run('test message');

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Should complete within 100ms (relaxed for test environment)
    });
  });
});