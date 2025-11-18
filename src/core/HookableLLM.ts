// HookableLLM - Main LLM class with comprehensive event hooking system
import { createLogger } from '../utils/logger';
import { config } from '../config';
import {
  Message,
  Conversation,
  PersistenceAdapter,
  HookableLLMConfig,
  LLMResponse,
  ConversationHistory as ConversationHistoryType,
  Chunk,
  StreamBufferConfig,
  LLMStreamResponse
} from '../types';
import { HookManager } from './HookManager';
import { ConversationHistory } from './ConversationHistory';
import { MessageEvent, MessageHookPriority } from '../events/MessageEvent';
import { ChunkEvent } from '../events/ChunkEvent';
import { BufferFlushEvent } from '../events/BufferEvent';
import { BufferManager } from '../streaming/BufferManager';
import { InMemoryPersistence } from '../persistence/InMemoryPersistence';
import { OpenAI } from '@openai/agents';

const logger = createLogger('HookableLLM');

export class HookableLLM {
  private config: HookableLLMConfig;
  private hookManager: HookManager;
  private conversationHistory: ConversationHistory;
  private messageEvent: MessageEvent;
  private chunkEvent: ChunkEvent;
  private bufferEvent: BufferFlushEvent;
  private bufferManager: BufferManager;
  private openaiClient: OpenAI;
  private currentConversationId?: string;
  private isInitialized = false;

  constructor(options: HookableLLMConfig) {
    logger.info('Initializing HookableLLM', {
      hasApiKey: !!options.apiKey,
      model: options.model || config.get('defaultModel'),
      persistenceType: options.persistence?.constructor.name || 'default'
    });

    // Validate required configuration
    this.validateConfig(options);

    // Store configuration
    this.config = {
      apiKey: options.apiKey,
      model: options.model || config.get('defaultModel')!,
      temperature: options.temperature ?? config.get('defaultTemperature')!,
      maxTokens: options.maxTokens ?? config.get('defaultMaxTokens')!,
      persistence: options.persistence || new InMemoryPersistence(),
      enableLogging: options.enableLogging ?? true,
      hookTimeout: options.hookTimeout ?? config.get('hookExecutionTimeout')!,
      maxConcurrentHooks: options.maxConcurrentHooks ?? config.get('maxConcurrentHooks')!
    };

    // Initialize OpenAI client
    this.openaiClient = new OpenAI({
      apiKey: this.config.apiKey,
      dangerouslyAllowBrowser: false // Force server-side usage
    });

    // Initialize core components
    this.hookManager = new HookManager();
    this.conversationHistory = new ConversationHistory(
      this.config.persistence!,
      {
        autoSave: true,
        maxConversations: 1000,
        maxMessagesPerConversation: 1000
      }
    );
    this.messageEvent = new MessageEvent();
    this.chunkEvent = new ChunkEvent();
    this.bufferEvent = new BufferFlushEvent();
    this.bufferManager = new BufferManager();

    // Setup event forwarding
    this.setupEventForwarding();

    // Setup error handling
    this.setupErrorHandling();

    logger.info('HookableLLM components initialized');
  }

  private validateConfig(options: HookableLLMConfig): void {
    if (!options.apiKey) {
      throw new Error('API key is required');
    }

    if (options.model && typeof options.model !== 'string') {
      throw new Error('Model must be a string');
    }

    if (options.temperature !== undefined && (options.temperature < 0 || options.temperature > 2)) {
      throw new Error('Temperature must be between 0 and 2');
    }

    if (options.maxTokens !== undefined && options.maxTokens <= 0) {
      throw new Error('Max tokens must be greater than 0');
    }

    if (options.hookTimeout !== undefined && options.hookTimeout <= 0) {
      throw new Error('Hook timeout must be greater than 0');
    }

    if (options.maxConcurrentHooks !== undefined && options.maxConcurrentHooks <= 0) {
      throw new Error('Max concurrent hooks must be greater than 0');
    }
  }

  private setupEventForwarding(): void {
    // Forward MessageEvent events to HookableLLM
    this.messageEvent.on('message:processed:before', (data) => {
      this.emit('message:before', data);
    });

    this.messageEvent.on('message:processed:after', (data) => {
      this.emit('message:after', data);
    });

    this.messageEvent.on('error', (error) => {
      this.emit('hook:error', error);
    });

    // Forward ChunkEvent events to HookableLLM
    this.chunkEvent.on('chunk:processed:before', (data) => {
      this.emit('chunk:before', data);
    });

    this.chunkEvent.on('chunk:processed:after', (data) => {
      this.emit('chunk:after', data);
    });

    this.chunkEvent.on('error', (error) => {
      this.emit('hook:error', error);
    });

    // Forward BufferEvent events to HookableLLM
    this.bufferEvent.on('buffer:processed:flush', (data) => {
      this.emit('buffer:flush', data);
    });

    this.bufferEvent.on('buffer:flushed', (data) => {
      this.emit('buffer:flushed', data);
    });

    this.bufferEvent.on('error', (error) => {
      this.emit('hook:error', error);
    });

    // Forward BufferManager events
    this.bufferManager.on('error', (error) => {
      this.emit('hook:error', error);
    });

    // Forward HookManager events
    this.hookManager.on('error', (error) => {
      this.emit('hook:error', error);
    });
  }

  private setupErrorHandling(): void {
    // Register global error handlers
    this.hookManager.onError((error) => {
      logger.error('Hook execution error', error.error, {
        hookId: error.hookId,
        event: error.event,
        executionTime: error.executionTime
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection in HookableLLM', new Error(String(reason)), {
        promise: promise.toString()
      });
    });
  }

  // Initialize the LLM (call this after setting up hooks)
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('HookableLLM already initialized');
      return;
    }

    try {
      logger.info('Initializing HookableLLM connections...');

      // Validate OpenAI API key by making a minimal test request
      logger.debug('Validating OpenAI API connection');
      try {
        // Simple model list request to validate API key
        await this.openaiClient.models.list();
        logger.info('OpenAI API connection validated successfully');
      } catch (apiError) {
        logger.error('OpenAI API validation failed', apiError as Error, {
          apiKeyPresent: !!this.config.apiKey,
          apiKeyLength: this.config.apiKey?.length
        });
        throw new Error(`OpenAI API validation failed: ${apiError}`);
      }

      // Load conversation history if available
      const stats = await this.conversationHistory.getStats();
      logger.info('Conversation history loaded', {
        totalConversations: stats.totalConversations,
        totalMessages: stats.totalMessages
      });

      this.isInitialized = true;
      logger.info('HookableLLM initialization complete');

    } catch (error) {
      logger.error('HookableLLM initialization failed', error as Error);
      throw error;
    }
  }

  // Main run method for processing messages
  async run(
    prompt: string,
    options: {
      conversationId?: string;
      systemMessage?: string;
      temperature?: number;
      maxTokens?: number;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<LLMResponse> {
    if (!this.isInitialized) {
      throw new Error('HookableLLM not initialized. Call initialize() first.');
    }

    const startTime = Date.now();
    const {
      conversationId: providedConversationId,
      systemMessage,
      temperature = this.config.temperature,
      maxTokens = this.config.maxTokens,
      metadata = {}
    } = options;

    try {
      logger.info('Starting message processing', {
        promptLength: prompt.length,
        conversationId: providedConversationId,
        hasSystemMessage: !!systemMessage
      });

      // Get or create conversation
      let conversationId = providedConversationId || this.currentConversationId;
      let conversation: Conversation | null = null;

      if (conversationId) {
        conversation = await this.conversationHistory.getConversation(conversationId);
      }

      if (!conversation) {
        conversation = await this.conversationHistory.createConversation({
          metadata: { ...metadata, createdAt: new Date() }
        });
        conversationId = conversation.id;
        this.currentConversationId = conversationId;
        logger.debug('Created new conversation', { conversationId });
      }

      // Create user message
      const userMessage: Message = {
        role: 'user',
        content: prompt,
        timestamp: new Date(),
        metadata: { ...metadata, runStartTime: startTime }
      };

      // Process message through before hooks
      const processedUserMessage = await this.messageEvent.processMessageBefore(
        userMessage,
        'outgoing',
        {
          source: 'run',
          requestId: `run-${Date.now()}`
        }
      );

      // Add processed user message to conversation
      await this.conversationHistory.addMessage(conversationId, processedUserMessage.message);

      // Get conversation context for LLM
      const messages = conversation.messages;

      // Add system message if provided
      if (systemMessage) {
        const systemMsg: Message = {
          role: 'system',
          content: systemMessage,
          timestamp: new Date(),
          metadata: { type: 'system', generated: true }
        };

        // Insert at beginning if not already present
        if (messages.length === 0 || messages[0].role !== 'system') {
          messages.unshift(systemMsg);
        }
      }

      // Call LLM (TODO: Implement actual OpenAI Agents SDK call)
      const llmResponse = await this.callLLM(messages, { temperature, maxTokens });

      // Create assistant message from response
      const assistantMessage: Message = {
        role: 'assistant',
        content: llmResponse.content,
        timestamp: new Date(),
        metadata: {
          model: this.config.model,
          temperature,
          maxTokens,
          usage: llmResponse.usage,
          processingTime: Date.now() - startTime
        }
      };

      // Process assistant message through before hooks
      const processedAssistantMessage = await this.messageEvent.processMessageBefore(
        assistantMessage,
        'incoming',
        {
          source: 'llm-response',
          requestId: `run-${Date.now()}`
        }
      );

      // Add processed assistant message to conversation
      await this.conversationHistory.addMessage(conversationId, processedAssistantMessage.message);

      // Process both messages through after hooks
      await this.messageEvent.processMessageAfter(
        processedUserMessage.message,
        llmResponse,
        'outgoing',
        {
          source: 'run-complete',
          requestId: `run-${Date.now()}`
        }
      );

      await this.messageEvent.processMessageAfter(
        processedAssistantMessage.message,
        llmResponse,
        'incoming',
        {
          source: 'run-complete',
          requestId: `run-${Date.now()}`
        }
      );

      const processingTime = Date.now() - startTime;

      const response: LLMResponse = {
        content: processedAssistantMessage.message.content,
        conversationId,
        messages: [...conversation.messages, processedAssistantMessage.message],
        usage: llmResponse.usage,
        metadata: {
          ...llmResponse.metadata,
          processingTime,
          hookExecutions: this.hookManager.getComprehensiveHookInfo()
        }
      };

      logger.info('Message processing completed', {
        conversationId,
        processingTime: `${processingTime}ms`,
        responseLength: response.content.length,
        totalMessages: response.messages.length
      });

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Message processing failed', error as Error, {
        processingTime: `${processingTime}ms`,
        conversationId: providedConversationId
      });
      throw error;
    }
  }

  // Real OpenAI API integration
  private async callLLM(
    messages: Message[],
    options: { temperature: number; maxTokens: number }
  ): Promise<{ content: string; usage?: any; metadata?: Record<string, any> }> {
    logger.debug('Calling OpenAI API', {
      messageCount: messages.length,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      model: this.config.model
    });

    try {
      // Convert our Message format to OpenAI ChatCompletion format
      const openaiMessages = messages.map(msg => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content
      }));

      const completion = await this.openaiClient.chat.completions.create({
        model: this.config.model,
        messages: openaiMessages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        stream: false // Use non-streaming for regular calls
      });

      const responseContent = completion.choices[0]?.message?.content || '';

      if (!responseContent) {
        logger.warn('Received empty response from OpenAI', {
          choices: completion.choices.length,
          usage: completion.usage
        });
        throw new Error('Empty response received from OpenAI');
      }

      logger.debug('OpenAI API response received', {
        contentLength: responseContent.length,
        usage: completion.usage,
        finishReason: completion.choices[0]?.finish_reason
      });

      return {
        content: responseContent,
        usage: completion.usage ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens
        } : undefined,
        metadata: {
          model: completion.model,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          finishReason: completion.choices[0]?.finish_reason,
          responseId: completion.id
        }
      };

    } catch (error) {
      logger.error('OpenAI API call failed', error as Error, {
        messageCount: messages.length,
        model: this.config.model,
        temperature: options.temperature,
        maxTokens: options.maxTokens
      });

      // Re-throw with more context
      throw new Error(`OpenAI API call failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Hook registration methods (delegated to HookManager)
  on(event: string, hook: any, priority?: number): this {
    this.hookManager.registerHook(event as any, hook, { priority });
    return this;
  }

  off(event: string, hook: any): this {
    this.hookManager.unregisterHook(event as any, hook);
    return this;
  }

  once(event: string, hook: any, priority?: number): this {
    this.hookManager.registerOneTimeHook(event as any, hook, { priority });
    return this;
  }

  // Message-specific hook methods (delegated to MessageEvent)
  onMessageBefore(hook: any, priority?: number): this {
    this.messageEvent.onMessageBefore(hook, priority);
    return this;
  }

  onMessageAfter(hook: any, priority?: number): this {
    this.messageEvent.onMessageAfter(hook, priority);
    return this;
  }

  onceMessageBefore(hook: any, priority?: number): this {
    this.messageEvent.onceMessageBefore(hook, priority);
    return this;
  }

  onceMessageAfter(hook: any, priority?: number): this {
    this.messageEvent.onceMessageAfter(hook, priority);
    return this;
  }

  offMessageBefore(hook: any): this {
    this.messageEvent.offMessageBefore(hook);
    return this;
  }

  offMessageAfter(hook: any): this {
    this.messageEvent.offMessageAfter(hook);
    return this;
  }

  // Chunk-specific hook methods (delegated to ChunkEvent)
  onChunkBefore(hook: any, priority?: number): this {
    this.chunkEvent.onChunkBefore(hook, priority);
    return this;
  }

  onChunkAfter(hook: any, priority?: number): this {
    this.chunkEvent.onChunkAfter(hook, priority);
    return this;
  }

  onceChunkBefore(hook: any, priority?: number): this {
    this.chunkEvent.onceChunkBefore(hook, priority);
    return this;
  }

  onceChunkAfter(hook: any, priority?: number): this {
    this.chunkEvent.onceChunkAfter(hook, priority);
    return this;
  }

  offChunkBefore(hook: any): this {
    this.chunkEvent.offChunkBefore(hook);
    return this;
  }

  offChunkAfter(hook: any): this {
    this.chunkEvent.offChunkAfter(hook);
    return this;
  }

  // Buffer-specific hook methods (delegated to BufferEvent)
  onBufferFlush(hook: any, priority?: number): this {
    this.bufferEvent.onBufferFlush(hook, priority);
    return this;
  }

  onceBufferFlush(hook: any, priority?: number): this {
    this.bufferEvent.onceBufferFlush(hook, priority);
    return this;
  }

  offBufferFlush(hook: any): this {
    this.bufferEvent.offBufferFlush(hook);
    return this;
  }

  // Conversation history methods (delegated to ConversationHistory)
  async loadHistory(history: ConversationHistoryType): Promise<void> {
    logger.info('Loading conversation history', {
      conversationCount: history.conversations.length
    });

    for (const conversation of history.conversations) {
      // Create the conversation first
      await this.conversationHistory.createConversation({
        id: conversation.id,
        metadata: conversation.metadata,
        title: conversation.title
      });

      // Then add messages
      await this.conversationHistory.addMessages(conversation.id, conversation.messages);
    }

    logger.info('Conversation history loaded successfully');
  }

  getHistory(): ConversationHistoryType {
    // Export current conversation history
    return this.conversationHistory.export();
  }

  // Direct access to conversation history for advanced usage
  getConversationHistory() {
    return this.conversationHistory;
  }

  // List all conversations
  async listConversations(filter?: any): Promise<Conversation[]> {
    return await this.conversationHistory.listConversations(filter);
  }

  // Get specific conversation
  async getConversation(conversationId: string): Promise<Conversation | null> {
    return await this.conversationHistory.getConversation(conversationId);
  }

  // Delete specific conversation
  async deleteConversation(conversationId: string): Promise<void> {
    return await this.conversationHistory.deleteConversation(conversationId);
  }

  // Add messages to existing conversation
  async addMessages(conversationId: string, messages: Message[]): Promise<void> {
    return await this.conversationHistory.addMessages(conversationId, messages);
  }

  async clearHistory(conversationId?: string): Promise<void> {
    if (conversationId) {
      await this.conversationHistory.deleteConversation(conversationId);
      if (this.currentConversationId === conversationId) {
        this.currentConversationId = undefined;
      }
      logger.info('Cleared specific conversation history', { conversationId });
    } else {
      await this.conversationHistory.clearAllConversations();
      this.currentConversationId = undefined;
      logger.info('Cleared all conversation history');
    }
  }

  // Utility methods
  emit(event: string, ...args: any[]): boolean {
    // Simple event emission - HookableLLM acts as an event emitter
    // In a more complete implementation, we might extend EventEmitter
    logger.debug('Event emitted', { event, argsCount: args.length });
    return true;
  }

  // Get current configuration
  getConfig(): HookableLLMConfig {
    return { ...this.config };
  }

  // Update configuration
  updateConfig(updates: Partial<HookableLLMConfig>): void {
    logger.info('Updating configuration', { keys: Object.keys(updates) });

    Object.assign(this.config, updates);

    // Validate updated configuration
    this.validateConfig(this.config);

    logger.info('Configuration updated successfully');
  }

  // Get performance and usage statistics
  async getStats(): Promise<{
    conversations: any;
    hooks: any;
    messages: any;
    performance: any;
  }> {
    const conversationStats = await this.conversationHistory.getStats();
    const messageStats = this.messageEvent.getPerformanceMetrics();
    const hookStats = this.hookManager.getComprehensiveHookInfo();

    return {
      conversations: conversationStats,
      hooks: hookStats,
      messages: messageStats,
      performance: {
        isInitialized: this.isInitialized,
        currentConversationId: this.currentConversationId,
        memoryUsage: this.conversationHistory.getMemoryUsage()
      }
    };
  }

  // =============================================
  // STREAMING METHODS
  // =============================================

  // Main streaming method for real-time chunk processing
  async runStream(
    prompt: string,
    options: {
      conversationId?: string;
      systemMessage?: string;
      temperature?: number;
      maxTokens?: number;
      bufferConfig?: StreamBufferConfig;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<LLMStreamResponse> {
    if (!this.isInitialized) {
      throw new Error('HookableLLM not initialized. Call initialize() first.');
    }

    const startTime = Date.now();
    const {
      conversationId: providedConversationId,
      systemMessage,
      temperature = this.config.temperature,
      maxTokens = this.config.maxTokens,
      bufferConfig,
      metadata = {}
    } = options;

    try {
      logger.info('Starting streaming message processing', {
        promptLength: prompt.length,
        conversationId: providedConversationId,
        hasSystemMessage: !!systemMessage,
        bufferConfig
      });

      // Get or create conversation
      let conversationId = providedConversationId || this.currentConversationId;
      let conversation: Conversation | null = null;

      if (conversationId) {
        conversation = await this.conversationHistory.getConversation(conversationId);
      }

      if (!conversation) {
        conversation = await this.conversationHistory.createConversation({
          metadata: { ...metadata, createdAt: new Date() }
        });
        conversationId = conversation.id;
        this.currentConversationId = conversationId;
        logger.debug('Created new conversation for streaming', { conversationId });
      }

      // Create unique stream buffer ID
      const bufferId = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const streamBuffer = this.bufferManager.createBuffer(bufferId, {
        config: bufferConfig,
        sequenceId: conversationId,
        metadata: { source: 'runStream', ...metadata }
      });

      // Create user message
      const userMessage: Message = {
        role: 'user',
        content: prompt,
        timestamp: new Date(),
        metadata: { ...metadata, runStartTime: startTime, isStreaming: true }
      };

      // Process message through before hooks
      const processedUserMessage = await this.messageEvent.processMessageBefore(
        userMessage,
        'outgoing',
        {
          source: 'runStream',
          requestId: `stream-${Date.now()}`,
          bufferId
        }
      );

      // Add processed user message to conversation
      await this.conversationHistory.addMessage(conversationId, processedUserMessage.message);

      // Get conversation context for LLM
      const messages = conversation.messages;

      // Add system message if provided
      if (systemMessage) {
        const systemMsg: Message = {
          role: 'system',
          content: systemMessage,
          timestamp: new Date(),
          metadata: { type: 'system', generated: true }
        };

        // Insert at beginning if not already present
        if (messages.length === 0 || messages[0].role !== 'system') {
          messages.unshift(systemMsg);
        }
      }

      // Call streaming LLM (TODO: Implement actual OpenAI Agents SDK streaming)
      await this.callLLMStream(messages, { temperature, maxTokens, bufferId });

      // Get final accumulated content from buffer
      const finalChunks = await this.flushBuffer(bufferId, 'manual');
      const content = finalChunks.map(chunk => chunk.content).join('');

      // Create stream response
      const streamResponse: LLMStreamResponse = {
        content,
        conversationId,
        bufferId,
        totalChunks: finalChunks.length,
        totalCharacters: content.length,
        chunks: finalChunks,
        metadata: {
          processingTime: Date.now() - startTime,
          model: this.config.model,
          temperature,
          maxTokens,
          bufferConfig
        }
      };

      const processingTime = Date.now() - startTime;

      logger.info('Streaming message processing completed', {
        conversationId,
        bufferId,
        processingTime: `${processingTime}ms`,
        totalChunks: streamResponse.totalChunks,
        totalCharacters: streamResponse.content.length
      });

      return streamResponse;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Streaming message processing failed', error as Error, {
        processingTime: `${processingTime}ms`,
        conversationId: providedConversationId
      });
      throw error;
    }
  }

  // Process individual chunks through the hooking system
  async processChunk(
    chunk: Chunk,
    options: {
      direction?: 'outgoing' | 'incoming';
      bufferId?: string;
      sequenceId?: string;
      source?: string;
      validationRule?: string;
    } = {}
  ): Promise<{ chunk: Chunk; metadata: any }> {
    const {
      direction = 'outgoing',
      bufferId,
      sequenceId,
      source = 'unknown',
      validationRule = 'default'
    } = options;

    try {
      // Process chunk through before hooks
      const beforeResult = await this.chunkEvent.processChunkBefore(
        chunk,
        direction,
        {
          source,
          requestId: `chunk-${Date.now()}`,
          sequenceId,
          bufferId,
          validationRule
        }
      );

      // Process chunk through after hooks
      const afterResult = await this.chunkEvent.processChunkAfter(
        beforeResult.chunk,
        direction,
        {
          source,
          requestId: `chunk-${Date.now()}`,
          sequenceId,
          bufferId
        }
      );

      return {
        chunk: afterResult.chunk,
        metadata: {
          before: beforeResult.metadata,
          after: afterResult.metadata
        }
      };

    } catch (error) {
      logger.error('Chunk processing failed', error as Error, {
        chunkId: chunk.id,
        direction,
        bufferId
      });
      throw error;
    }
  }

  // Create and manage a streaming buffer
  createStreamBuffer(
    bufferId: string,
    options: {
      config?: StreamBufferConfig;
      sequenceId?: string;
      metadata?: Record<string, any>;
    } = {}
  ) {
    return this.bufferManager.createBuffer(bufferId, options);
  }

  // Get existing stream buffer
  getStreamBuffer(bufferId: string) {
    return this.bufferManager.getBuffer(bufferId);
  }

  // Add chunk to stream buffer
  addChunkToBuffer(
    bufferId: string,
    chunk: Chunk,
    options?: { createIfNotExists?: boolean; bufferConfig?: StreamBufferConfig }
  ) {
    return this.bufferManager.addChunk(bufferId, chunk, options);
  }

  // Manually flush a buffer
  async flushBuffer(
    bufferId: string,
    reason: 'size' | 'time' | 'hybrid' | 'manual' = 'manual'
  ): Promise<Chunk[]> {
    return this.bufferManager.flushBuffer(bufferId, reason);
  }

  // Flush all buffers
  async flushAllBuffers(reason: 'size' | 'time' | 'hybrid' | 'manual' = 'manual'): Promise<{
    bufferId: string;
    chunks: Chunk[];
    error?: Error;
  }[]> {
    return this.bufferManager.flushAllBuffers(reason);
  }

  // Get streaming statistics
  getStreamingStats(): {
    bufferEvents: any;
    chunks: any;
    manager: any;
    efficiency: any;
  } {
    return {
      bufferEvents: this.bufferEvent.getPerformanceMetrics(),
      chunks: this.chunkEvent.getPerformanceMetrics(),
      manager: this.bufferManager.getStats(),
      efficiency: this.bufferEvent.analyzeBufferEfficiency()
    };
  }

  // Real OpenAI streaming integration
  private async callLLMStream(
    processedMessages: Message[],
    options: { temperature: number; maxTokens: number; bufferId: string }
  ): Promise<void> {
    const { temperature, maxTokens, bufferId } = options;

    logger.info('OpenAI streaming started', {
      messageCount: processedMessages.length,
      bufferId,
      temperature,
      maxTokens,
      model: this.config.model
    });

    try {
      // Convert our Message format to OpenAI ChatCompletion format
      const openaiMessages = processedMessages.map(msg => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content
      }));

      const stream = await this.openaiClient.chat.completions.create({
        model: this.config.model,
        messages: openaiMessages,
        temperature: temperature,
        max_tokens: maxTokens,
        stream: true // Enable streaming
      });

      let chunkIndex = 0;
      let accumulatedContent = '';

      logger.debug('OpenAI stream created, starting to process chunks');

      // Process the stream
      for await (const chunk of stream) {
        try {
          const delta = chunk.choices[0]?.delta;

          if (delta?.content) {
            const content = delta.content;
            accumulatedContent += content;

            // Create a system chunk from the streaming delta
            const systemChunk = ChunkEvent.createChunk(content, {
              index: chunkIndex++,
              sequenceId: `openai-stream-${Date.now()}`,
              metadata: {
                source: 'openai-stream',
                model: this.config.model,
                bufferId,
                temperature,
                maxTokens,
                finishReason: chunk.choices[0]?.finish_reason,
                accumulatedContent: accumulatedContent,
                chunkId: chunk.id,
                created: chunk.created
              },
              isComplete: !!chunk.choices[0]?.finish_reason
            });

            logger.debug('OpenAI chunk received', {
              bufferId,
              chunkIndex: systemChunk.index,
              contentLength: content.length,
              finishReason: chunk.choices[0]?.finish_reason,
              totalAccumulated: accumulatedContent.length
            });

            // Process the chunk through our hooking system
            await this.processChunk(systemChunk, 'outgoing', {
              source: 'openai-stream',
              sequenceId: systemChunk.sequenceId,
              bufferId
            });

            // Add chunk to buffer for accumulation
            const result = this.bufferManager.addChunk(bufferId, systemChunk);

            // Auto-flush if buffer indicates it should flush
            if (result.shouldFlush) {
              logger.info('Auto-flushing buffer due to OpenAI chunk', {
                bufferId,
                reason: result.flushReason,
                chunkCount: chunkIndex,
                contentLength: accumulatedContent.length
              });
              await this.flushBuffer(bufferId, result.flushReason || 'hybrid');
            }
          }

          // Check if stream is finished
          if (chunk.choices[0]?.finish_reason) {
            logger.info('OpenAI stream completed', {
              bufferId,
              finishReason: chunk.choices[0].finish_reason,
              totalChunks: chunkIndex,
              totalContent: accumulatedContent.length
            });
            break;
          }

        } catch (chunkError) {
          logger.error('Failed to process OpenAI stream chunk', chunkError as Error, {
            bufferId,
            chunkIndex,
            chunkId: chunk.id
          });
          // Continue with next chunk instead of failing entire stream
        }
      }

      logger.info('OpenAI streaming completed successfully', {
        bufferId,
        totalChunks: chunkIndex,
        totalContent: accumulatedContent.length
      });

    } catch (error) {
      logger.error('OpenAI streaming failed', error as Error, {
        bufferId,
        messageCount: processedMessages.length,
        model: this.config.model,
        temperature,
        maxTokens
      });

      // Re-throw with more context
      throw new Error(`OpenAI streaming failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Cleanup method
  async cleanup(): Promise<void> {
    logger.info('Cleaning up HookableLLM...');

    // Clear all hooks
    this.hookManager.clearAllHooks();
    this.messageEvent.clearMessageHooks();
    this.chunkEvent.clearChunkHooks();
    this.bufferEvent.clearBufferHooks();

    // Destroy all buffers
    this.bufferManager.destroyAll();

    // Clear current conversation
    this.currentConversationId = undefined;

    // Reset initialization state
    this.isInitialized = false;

    logger.info('HookableLLM cleanup complete');
  }
}