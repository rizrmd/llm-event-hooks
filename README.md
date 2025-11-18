# 🚀 LLM Event Hooks

A powerful TypeScript library for adding event hooks and streaming capabilities to OpenAI LLM interactions. Built for production with performance monitoring, error isolation, and comprehensive streaming support.

## ✨ Features

- 🎯 **Message Hooks**: Intercept and modify messages before/after LLM processing
- 🌊 **Stream Chunk Hooks**: Process streaming responses in real-time with configurable buffering
- 🔧 **Buffer Management**: Smart buffering strategies (size, time, hybrid) with automatic cleanup
- ⚡ **High Performance**: <10ms chunk processing with concurrent execution support
- 🛡️ **Error Isolation**: Failed hooks don't crash your application
- 📊 **Performance Monitoring**: Built-in metrics and analytics
- 🔌 **OpenAI Integration**: Real OpenAI Agents SDK integration with streaming support

## 🚀 Quick Start

```bash
npm install llm-event-hooks
```

### Basic Usage

```typescript
import { HookableLLM, InMemoryPersistence } from 'llm-event-hooks';

// Create instance
const llm = new HookableLLM({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4',
  persistence: new InMemoryPersistence()
});

// Initialize when ready
await llm.initialize();

// Simple message processing
const response = await llm.run('What is 2 + 2?');
console.log(response.content); // "2"

// Streaming with hooks
llm.onChunkBefore(async (data, context) => {
  console.log(`Chunk: "${data.chunk.content}"`);
  return data;
});

const streamResponse = await llm.runStream('Tell me a story');
console.log(streamResponse.content);
```

## 📋 Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
- [Message Hooks](#message-hooks)
- [Streaming Hooks](#streaming-hooks)
- [Buffer Management](#buffer-management)
- [Performance](#performance)
- [Examples](#examples)
- [Advanced Usage](#advanced-usage)

## 📦 Installation

```bash
# Using npm
npm install llm-event-hooks

# Using yarn
yarn add llm-event-hooks

# Using pnpm
pnpm add llm-event-hooks
```

## 🧠 Core Concepts

### Hooks
Hooks are functions that can intercept and modify data at different points in the LLM processing pipeline:

- **Message Hooks**: Run before/after complete message processing
- **Chunk Hooks**: Run on individual streaming chunks
- **Buffer Hooks**: Run when buffers are flushed

### Priorities
Hooks execute in priority order (lower numbers = higher priority):

```typescript
import { Priorities } from 'llm-event-hooks';

// Critical hooks execute first
llm.onChunkBefore(securityHook, Priorities.CRITICAL); // 0

// High priority hooks
llm.onChunkBefore(validationHook, Priorities.HIGH);   // 25

// Normal priority (default)
llm.onChunkBefore(analyticsHook, Priorities.NORMAL); // 50

// Low priority hooks
llm.onChunkBefore(loggingHook, Priorities.LOW);      // 75
```

### Buffering Strategies
Choose how streaming chunks are accumulated:

- **`size`**: Flush when buffer reaches maximum size
- **`time`**: Flush after specified time duration
- **`hybrid`**: Smart combination (recommended)

## 🔧 API Reference

### HookableLLM Class

The main class for interacting with OpenAI LLM with hooks.

```typescript
import { HookableLLM, InMemoryPersistence } from 'llm-event-hooks';

const llm = new HookableLLM({
  apiKey: 'your-openai-api-key',
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 1000,
  persistence: new InMemoryPersistence()
});

await llm.initialize();
```

#### Configuration Options

```typescript
interface HookableLLMConfig {
  apiKey: string;           // OpenAI API key
  model?: string;          // OpenAI model (default: 'gpt-4')
  temperature?: number;    // 0-2 (default: 0.7)
  maxTokens?: number;      // Maximum tokens (default: 1000)
  persistence?: PersistenceAdapter; // Conversation storage
  enableLogging?: boolean; // Enable debug logging
  hookTimeout?: number;    // Hook execution timeout (default: 30000)
  maxConcurrentHooks?: number; // Max concurrent hooks
}
```

#### Main Methods

```typescript
// Process a single message
const response = await llm.run(prompt: string, options?: {
  conversationId?: string;
  systemMessage?: string;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, any>;
});

// Process with streaming
const streamResponse = await llm.runStream(prompt: string, options?: {
  conversationId?: string;
  systemMessage?: string;
  bufferConfig?: StreamBufferConfig;
  metadata?: Record<string, any>;
});

// Process individual chunks
const result = await llm.processChunk(chunk: Chunk, options?: {
  direction?: 'outgoing' | 'incoming';
  bufferId?: string;
  source?: string;
});

// Get performance statistics
const stats = llm.getStreamingStats();

// Cleanup resources
await llm.cleanup();
```

## 📨 Message Hooks

Intercept and modify complete messages before/after LLM processing.

### Registering Message Hooks

```typescript
// Before message processing
llm.onMessageBefore(async (data, context) => {
  // data.message: The message being processed
  // data.direction: 'outgoing' | 'incoming'
  // context: Hook execution context

  // Modify message content
  if (data.message.role === 'user') {
    data.message.content = data.message.content.trim();
  }

  // Add metadata
  data.message.metadata.processedAt = new Date().toISOString();

  return data; // Must return modified data
}, Priorities.HIGH);

// After message processing
llm.onMessageAfter(async (data, context) => {
  // data.message: The processed message
  // data.llmResponse: LLM response (for incoming messages)

  // Log processing
  console.log(`Processed ${data.message.role} message`);

  return data;
});

// One-time hooks
llm.onceMessageBefore(async (data, context) => {
  console.log('This runs only once');
  return data;
});
```

### Removing Message Hooks

```typescript
const myHook = async (data, context) => data;

llm.onMessageBefore(myHook);
// ... later ...
llm.offMessageBefore(myHook);
```

## 🌊 Streaming Hooks

Process streaming responses in real-time with chunk-level control.

### Registering Streaming Hooks

```typescript
// Before chunk processing
llm.onChunkBefore(async (data, context) => {
  // data.chunk: The streaming chunk
  // data.direction: 'outgoing' | 'incoming'

  console.log(`Chunk ${data.chunk.index}: "${data.chunk.content}"`);

  // Filter content
  if (data.chunk.content.includes('spam')) {
    data.chunk.content = '[FILTERED]';
  }

  // Add metadata
  data.chunk.metadata.processedAt = Date.now();

  return data;
}, Priorities.CRITICAL);

// After chunk processing
llm.onChunkAfter(async (data, context) => {
  // Transform content
  if (data.chunk.content.includes('AI')) {
    data.chunk.content = data.chunk.content.replace('AI', '🤖');
  }

  // Track metrics
  const processingTime = Date.now() - data.chunk.metadata.processedAt;
  if (processingTime > 10) {
    console.warn(`Slow chunk processing: ${processingTime}ms`);
  }

  return data;
});
```

### Streaming with Custom Buffers

```typescript
import { DefaultBufferConfigs } from 'llm-event-hooks';

// Use predefined buffer configurations
await llm.runStream('Tell me a story', {
  bufferConfig: DefaultBufferConfigs.SMALL_FAST  // 5 chunks, 50ms timeout
});

// Custom buffer configuration
await llm.runStream('Explain quantum computing', {
  bufferConfig: {
    maxSize: 15,              // Flush after 15 chunks
    maxTime: 200,              // Or after 200ms
    strategy: 'hybrid',       // Smart combination
    enableMetrics: true       // Track performance
  }
});
```

## 🔄 Buffer Management

### Buffer Strategies

```typescript
// Size-based: Flush when buffer reaches capacity
const sizeBased = {
  maxSize: 10,
  maxTime: 1000,  // Large timeout (time not primary factor)
  strategy: 'size' as const,
  enableMetrics: true
};

// Time-based: Flush after specified duration
const timeBased = {
  maxSize: 100,    // Large capacity (size not primary factor)
  maxTime: 100,    // Flush after 100ms
  strategy: 'time' as const,
  enableMetrics: true
};

// Hybrid: Intelligent combination (recommended)
const hybrid = {
  maxSize: 8,
  maxTime: 75,
  strategy: 'hybrid' as const,
  enableMetrics: true
};
```

### Buffer Events

```typescript
// Monitor buffer flushes
llm.onBufferFlush(async (data, context) => {
  console.log(`Buffer flushed: ${data.chunks.length} chunks`);
  console.log(`Flush reason: ${data.flushReason}`);
  console.log(`Total size: ${data.totalSize} characters`);

  // Analyze efficiency
  const avgChunkSize = data.totalSize / data.chunks.length;
  if (avgChunkSize < 5) {
    console.log('Consider larger chunks for better efficiency');
  }

  return data;
});
```

### Manual Buffer Control

```typescript
// Create custom buffer
const bufferId = 'my-custom-buffer';
llm.createStreamBuffer(bufferId, {
  config: DefaultBufferConfigs.MEDIUM_BALANCED,
  sequenceId: 'conversation-123',
  metadata: { source: 'custom-buffer' }
});

// Add chunks manually
const chunk = createChunkEvent().createChunk('Custom content', {
  index: 0,
  sequenceId: 'conversation-123'
});

llm.addChunkToBuffer(bufferId, chunk);

// Manually flush buffer
const chunks = await llm.flushBuffer(bufferId, 'manual');

// Get buffer information
const buffer = llm.getStreamBuffer(bufferId);
const state = buffer.getState();
const stats = buffer.getStats();
```

## 📊 Performance

### Built-in Metrics

```typescript
// Get streaming statistics
const stats = llm.getStreamingStats();

console.log('Chunk Processing:', {
  totalChunks: stats.chunks.totalChunks,
  averageTime: `${stats.chunks.averageProcessingTime.toFixed(2)}ms`,
  chunksPerSecond: stats.chunks.chunksPerSecond,
  failedHooks: stats.chunks.failedHooks
});

console.log('Buffer Management:', {
  totalBuffers: stats.manager.totalBuffers,
  activeBuffers: stats.manager.activeBuffers,
  averageBufferAge: stats.manager.averageBufferAge
});

console.log('Efficiency Analysis:', stats.efficiency.recommendations);
```

### Performance Monitoring

```typescript
// Set up performance monitoring
let totalProcessingTime = 0;
let chunkCount = 0;

llm.onChunkBefore(async (data, context) => {
  data.chunk.metadata.startTime = performance.now();
  return data;
});

llm.onChunkAfter(async (data, context) => {
  const processingTime = performance.now() - data.chunk.metadata.startTime;
  totalProcessingTime += processingTime;
  chunkCount++;

  // Alert on slow chunks
  if (processingTime > 10) {
    console.warn(`Slow chunk: ${processingTime.toFixed(2)}ms`);
  }

  return data;
});

// Periodic reporting
setInterval(() => {
  if (chunkCount > 0) {
    const avgTime = totalProcessingTime / chunkCount;
    console.log(`Performance: ${avgTime.toFixed(2)}ms avg, ${chunkCount} chunks`);
  }
}, 10000);
```

## 🎨 Examples

### Complete Chat Application

```typescript
import { HookableLLM, DefaultBufferConfigs, Priorities } from 'llm-event-hooks';

class ChatApplication {
  private llm: HookableLLM;
  private conversationId?: string;

  constructor(apiKey: string) {
    this.llm = new HookableLLM({ apiKey });
    this.setupHooks();
  }

  private setupHooks() {
    // Security filtering
    this.llm.onChunkBefore(async (data, context) => {
      if (data.chunk.content.includes('password')) {
        data.chunk.content = '[REDACTED]';
      }
      return data;
    }, Priorities.CRITICAL);

    // Content moderation
    this.llm.onChunkAfter(async (data, context) => {
      data.chunk.content = data.chunk.content.replace(/damn/gi, 'darn');
      return data;
    }, Priorities.HIGH);

    // Analytics
    this.llm.onChunkBefore(async (data, context) => {
      // Send to analytics service
      analytics.track('chunk_received', {
        length: data.chunk.content.length,
        conversationId: this.conversationId
      });
      return data;
    }, Priorities.LOW);

    // Error monitoring
    this.llm.on('hook:error', (error) => {
      errorReporting.captureException(error.error);
    });
  }

  async sendMessage(message: string): Promise<string> {
    const response = await this.llm.run(message, {
      conversationId: this.conversationId,
      systemMessage: 'You are a helpful assistant.'
    });

    this.conversationId = response.conversationId;
    return response.content;
  }

  async sendMessageStreaming(message: string): Promise<void> {
    const streamResponse = await this.llm.runStream(message, {
      conversationId: this.conversationId,
      bufferConfig: DefaultBufferConfigs.MEDIUM_BALANCED,
      systemMessage: 'You are a helpful assistant.'
    });

    this.conversationId = response.conversationId;
    console.log(response.content);
  }

  async cleanup() {
    await this.llm.cleanup();
  }
}

// Usage
const app = new ChatApplication(process.env.OPENAI_API_KEY);
await app.sendMessage('Hello, how are you?');
await app.sendMessageStreaming('Tell me a joke');
```

### Real-time Translation Service

```typescript
class TranslationService {
  private llm: HookableLLM;

  constructor(apiKey: string) {
    this.llm = new HookableLLM({ apiKey });
    this.setupTranslationHooks();
  }

  private setupTranslationHooks() {
    // Language detection
    this.llm.onChunkBefore(async (data, context) => {
      data.chunk.metadata.detectedLanguage = this.detectLanguage(data.chunk.content);
      return data;
    });

    // Translation formatting
    this.llm.onChunkAfter(async (data, context) => {
      const translated = data.chunk.content;
      data.chunk.content = `[${data.chunk.metadata.detectedLanguage}] ${translated}`;
      return data;
    });
  }

  private detectLanguage(text: string): string {
    // Simple language detection logic
    if (text.includes('¡') || text.includes('ñ')) return 'ES';
    if (text.includes('à') || text.includes('é')) return 'FR';
    if (text.includes('ß') || text.includes('ü')) return 'DE';
    return 'EN';
  }

  async translateStreaming(text: string, targetLanguage: string): Promise<string> {
    const response = await this.llm.runStream(
      `Translate to ${targetLanguage}: ${text}`,
      {
        bufferConfig: {
          maxSize: 5,
          maxTime: 50,
          strategy: 'hybrid',
          enableMetrics: true
        }
      }
    );

    return response.content;
  }
}
```

## 🔧 Advanced Usage

### Custom Persistence

```typescript
import { PersistenceAdapter, Conversation, Message } from 'llm-event-hooks';

class DatabasePersistence implements PersistenceAdapter {
  async saveConversation(conversation: Conversation): Promise<void> {
    await db.conversations.save(conversation);
  }

  async loadConversation(id: string): Promise<Conversation | null> {
    return await db.conversations.findById(id);
  }

  async deleteConversation(id: string): Promise<void> {
    await db.conversations.delete(id);
  }

  async listConversations(filter?: any): Promise<Conversation[]> {
    return await db.conversations.find(filter);
  }
}

const llm = new HookableLLM({
  apiKey: 'your-key',
  persistence: new DatabasePersistence()
});
```

### Error Handling & Recovery

```typescript
llm.onChunkBefore(async (data, context) => {
  try {
    // Process chunk
    data.chunk.processed = await expensiveOperation(data.chunk.content);
    return data;
  } catch (error) {
    // Handle error gracefully
    console.error('Chunk processing failed:', error);
    data.chunk.error = error.message;
    data.chunk.content = '[PROCESSING_ERROR]';
    return data;
  }
});

// Global error handling
llm.on('hook:error', (error) => {
  // Log to monitoring service
  monitoring.logError('Hook execution failed', {
    hookId: error.hookId,
    event: error.event,
    error: error.error.message,
    executionTime: error.executionTime
  });

  // Attempt recovery
  if (error.event === 'chunk:before') {
    // Continue processing even if hook fails
    console.log('Continuing chunk processing despite hook error');
  }
});
```

### Hook Composition

```typescript
// Create reusable hook functions
const createSecurityHook = (blockedWords: string[]) => {
  return async (data, context) => {
    for (const word of blockedWords) {
      data.chunk.content = data.chunk.content.replace(
        new RegExp(word, 'gi'),
        '[BLOCKED]'
      );
    }
    return data;
  };
};

const createAnalyticsHook = (service: AnalyticsService) => {
  return async (data, context) => {
    service.track('chunk_processed', {
      length: data.chunk.content.length,
      timestamp: Date.now()
    });
    return data;
  };
};

// Compose hooks
const securityHook = createSecurityHook(['spam', 'abuse']);
const analyticsHook = createAnalyticsHook(analyticsService);

llm.onChunkBefore(securityHook, Priorities.CRITICAL);
llm.onChunkAfter(analyticsHook, Priorities.LOW);
```

## 🏎️ Performance Optimization

### For High Throughput

```typescript
const llm = new HookableLLM({
  apiKey: 'your-key',
  maxConcurrentHooks: 20,      // High concurrency
  hookTimeout: 5000            // Fast timeout
});

// Use minimal hooks
llm.onChunkBefore(essentialHook, Priorities.CRITICAL);

// Use fast buffering
await llm.runStream(prompt, {
  bufferConfig: {
    maxSize: 3,      // Small buffers
    maxTime: 25,     // Quick flushes
    strategy: 'hybrid'
  }
});
```

### For Maximum Reliability

```typescript
const llm = new HookableLLM({
  apiKey: 'your-key',
  maxConcurrentHooks: 5,       // Limited concurrency
  hookTimeout: 60000           // Generous timeout
});

// Comprehensive error handling
llm.onChunkBefore(validationHook, Priorities.CRITICAL);
llm.onChunkAfter(retryHook, Priorities.HIGH);
llm.on('hook:error', errorHandler);

// Conservative buffering
await llm.runStream(prompt, {
  bufferConfig: {
    maxSize: 20,     // Larger buffers
    maxTime: 200,    // Longer timeout
    strategy: 'hybrid'
  }
});
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:contract    # API contract tests
npm run test:integration # Integration tests
npm run test:unit        # Unit tests

# Performance benchmarks
bun run scripts/performance-test.ts
```

## 📝 TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import {
  HookableLLM,
  Chunk,
  StreamBufferConfig,
  Message,
  LLMResponse,
  LLMStreamResponse,
  Priorities,
  DefaultBufferConfigs,
  Events
} from 'llm-event-hooks';
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Performance Report](./PERFORMANCE.md)
- [API Examples](./examples/)
- [Type Definitions](./src/types.ts)

---

**Built with ❤️ for the developer community**