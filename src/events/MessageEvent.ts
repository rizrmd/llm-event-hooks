// Message event implementation for LLM Event Hooks
import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger';
import {
  Message,
  MessageEventData,
  MessageHookContext,
  MessageMetadata,
  MessageValidationRule,
  MessagePerformanceMetrics,
  HookFunction
} from '../events/types';
import { HookableEventEmitter } from '../core/EventEmitter';

const logger = createLogger('MessageEvent');

export class MessageEvent extends HookableEventEmitter {
  private performanceMetrics: MessagePerformanceMetrics = {
    totalMessages: 0,
    averageProcessingTime: 0,
    hookExecutionTime: 0,
    successfulHooks: 0,
    failedHooks: 0
  };

  private validationRules: Map<string, MessageValidationRule> = new Map();

  constructor() {
    super();
    this.setupDefaultValidation();
  }

  private setupDefaultValidation(): void {
    // Default validation for messages
    this.addValidationRule('default', {
      required: ['role', 'content'],
      optional: ['name', 'timestamp', 'metadata']
    });
  }

  // Add validation rules for messages
  addValidationRule(name: string, rule: MessageValidationRule): void {
    this.validationRules.set(name, rule);
    logger.debug('Validation rule added', { name, required: rule.required });
  }

  // Remove validation rule
  removeValidationRule(name: string): void {
    this.validationRules.delete(name);
    logger.debug('Validation rule removed', { name });
  }

  // Validate message against rules
  private validateMessage(message: Message, ruleName: string = 'default'): boolean {
    const rule = this.validationRules.get(ruleName);
    if (!rule) {
      logger.warn('Validation rule not found', { ruleName });
      return true;
    }

    // Check required fields
    for (const field of rule.required) {
      if (!(field in message)) {
        logger.error('Message validation failed - missing required field', null, {
          field,
          ruleName,
          message: JSON.stringify(message)
        });
        if (rule.errorMessage) {
          throw new Error(`${rule.errorMessage}: Missing required field '${field}'`);
        }
        return false;
      }
    }

    // Apply custom validator if provided
    if (rule.validator) {
      const isValid = rule.validator(message);
      if (!isValid) {
        logger.error('Message validation failed - custom validator', null, {
          ruleName,
          message: JSON.stringify(message)
        });
        if (rule.errorMessage) {
          throw new Error(`${rule.errorMessage}: Custom validation failed`);
        }
        return false;
      }
    }

    return true;
  }

  // Create metadata for message processing
  private createMessageMetadata(source: string, requestId?: string): MessageMetadata {
    return {
      processedAt: new Date(),
      source,
      version: '1.0.0',
      requestId,
      correlationId: requestId || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
  }

  // Create hook context for message processing
  private createHookContext(messageId: string, totalHooks: number, executionOrder: number): MessageHookContext {
    return {
      messageId,
      hookId: `message-hook-${Date.now()}`,
      executionOrder,
      totalHooks
    };
  }

  // Process message before hooks
  async processMessageBefore(
    message: Message,
    direction: 'outgoing' | 'incoming',
    options: {
      source?: string;
      requestId?: string;
      validationRule?: string
    } = {}
  ): Promise<{ message: Message; metadata: MessageMetadata }> {
    const startTime = Date.now();
    const { source = 'unknown', requestId, validationRule = 'default' } = options;

    try {
      // Validate message
      this.validateMessage(message, validationRule);

      // Create metadata
      const metadata = this.createMessageMetadata(source, requestId);

      // Create event data
      const eventData: MessageEventData = {
        message,
        direction
      };

      // Get hook info for context
      const hookInfo = this.getHookInfo('message:before');
      const context = this.createHookContext(
        metadata.correlationId!,
        hookInfo.length,
        0
      );

      logger.debug('Processing message before hooks', {
        direction,
        messageId: metadata.correlationId,
        hookCount: hookInfo.length,
        hasContent: !!message.content
      });

      // Execute before hooks
      const processedData = await this.executeHooks('message:before', eventData, context);

      // Update performance metrics
      this.updatePerformanceMetrics(startTime, hookInfo.length, 0);

      logger.info('Message before hooks processed', {
        direction,
        messageId: metadata.correlationId,
        processingTime: `${Date.now() - startTime}ms`,
        wasModified: processedData.message !== message
      });

      // Emit the processed message event
      this.emit('message:processed:before', {
        originalMessage: message,
        processedMessage: processedData.message,
        metadata,
        direction
      });

      return {
        message: processedData.message,
        metadata
      };

    } catch (error) {
      this.performanceMetrics.failedHooks++;
      logger.error('Message before processing failed', error as Error, {
        direction,
        processingTime: `${Date.now() - startTime}ms`
      });
      throw error;
    }
  }

  // Process message after hooks
  async processMessageAfter(
    message: Message,
    response?: any,
    direction: 'outgoing' | 'incoming',
    options: {
      source?: string;
      requestId?: string;
    } = {}
  ): Promise<{ message: Message; response?: any; metadata: MessageMetadata }> {
    const startTime = Date.now();
    const { source = 'unknown', requestId } = options;

    try {
      // Create metadata
      const metadata = this.createMessageMetadata(source, requestId);

      // Create event data
      const eventData: MessageEventData = {
        message,
        direction
      };

      // Get hook info for context
      const hookInfo = this.getHookInfo('message:after');
      const context = this.createHookContext(
        metadata.correlationId!,
        hookInfo.length,
        0
      );

      logger.debug('Processing message after hooks', {
        direction,
        messageId: metadata.correlationId,
        hookCount: hookInfo.length,
        hasResponse: !!response
      });

      // Execute after hooks
      const processedData = await this.executeHooks('message:after', eventData, context);

      // Update performance metrics
      this.updatePerformanceMetrics(startTime, hookInfo.length, 0);

      logger.info('Message after hooks processed', {
        direction,
        messageId: metadata.correlationId,
        processingTime: `${Date.now() - startTime}ms`,
        wasModified: processedData.message !== message
      });

      // Emit the processed message event
      this.emit('message:processed:after', {
        originalMessage: message,
        processedMessage: processedData.message,
        response,
        metadata,
        direction
      });

      return {
        message: processedData.message,
        response,
        metadata
      };

    } catch (error) {
      this.performanceMetrics.failedHooks++;
      logger.error('Message after processing failed', error as Error, {
        direction,
        processingTime: `${Date.now() - startTime}ms`
      });
      throw error;
    }
  }

  // Update performance metrics
  private updatePerformanceMetrics(startTime: number, hookCount: number, failedCount: number): void {
    const processingTime = Date.now() - startTime;
    this.performanceMetrics.totalMessages++;
    this.performanceMetrics.hookExecutionTime += processingTime;
    this.performanceMetrics.successfulHooks += hookCount;
    this.performanceMetrics.failedHooks += failedCount;

    // Calculate average processing time
    this.performanceMetrics.averageProcessingTime =
      this.performanceMetrics.hookExecutionTime / this.performanceMetrics.totalMessages;
  }

  // Get current performance metrics
  getPerformanceMetrics(): MessagePerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  // Reset performance metrics
  resetPerformanceMetrics(): void {
    this.performanceMetrics = {
      totalMessages: 0,
      averageProcessingTime: 0,
      hookExecutionTime: 0,
      successfulHooks: 0,
      failedHooks: 0
    };
    logger.info('Performance metrics reset');
  }

  // Register message-specific hook
  onMessageBefore(hook: HookFunction, priority?: number): this {
    return this.on('message:before', hook, priority);
  }

  onMessageAfter(hook: HookFunction, priority?: number): this {
    return this.on('message:after', hook, priority);
  }

  onceMessageBefore(hook: HookFunction, priority?: number): this {
    return this.once('message:before', hook, priority);
  }

  onceMessageAfter(hook: HookFunction, priority?: number): this {
    return this.once('message:after', hook, priority);
  }

  // Remove message-specific hook
  offMessageBefore(hook: HookFunction): this {
    return this.off('message:before', hook);
  }

  offMessageAfter(hook: HookFunction): this {
    return this.off('message:after', hook);
  }

  // Get hook registration info
  getMessageHookInfo(): {
    before: Array<{ id: string; priority: number }>;
    after: Array<{ id: string; priority: number }>;
  } {
    return {
      before: this.getHookInfo('message:before'),
      after: this.getHookInfo('message:after')
    };
  }

  // Clear all message hooks
  clearMessageHooks(): void {
    this.removeAllListeners('message:before');
    this.removeAllListeners('message:after');
    logger.info('All message hooks cleared');
  }

  // Validate message content and structure
  static validateMessageStructure(message: any): message is Message {
    if (!message || typeof message !== 'object') {
      return false;
    }

    // Check required fields
    if (!message.role || typeof message.role !== 'string') {
      return false;
    }

    if (!message.content || typeof message.content !== 'string') {
      return false;
    }

    // Validate role enum
    const validRoles = ['system', 'user', 'assistant', 'tool'];
    if (!validRoles.includes(message.role)) {
      return false;
    }

    return true;
  }

  // Create a standard message object
  static createMessage(
    role: 'system' | 'user' | 'assistant' | 'tool',
    content: string,
    options: { name?: string; timestamp?: Date; metadata?: Record<string, any> } = {}
  ): Message {
    return {
      role,
      content,
      name: options.name,
      timestamp: options.timestamp || new Date(),
      metadata: options.metadata || {}
    };
  }
}