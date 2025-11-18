// ConversationHistory management for LLM Event Hooks
import { createLogger } from '../utils/logger';
import {
  Conversation,
  Message,
  ConversationHistory as ConversationHistoryType,
  PersistenceAdapter,
  ConversationFilter,
  ConversationStats
} from '../types';

const logger = createLogger('ConversationHistory');

export class ConversationHistory {
  private conversations: Map<string, Conversation> = new Map();
  private persistence: PersistenceAdapter;
  private autoSave: boolean = true;
  private maxConversations: number = 1000;
  private maxMessagesPerConversation: number = 1000;

  constructor(persistence: PersistenceAdapter, options: {
    autoSave?: boolean;
    maxConversations?: number;
    maxMessagesPerConversation?: number;
  } = {}) {
    this.persistence = persistence;
    this.autoSave = options.autoSave ?? true;
    this.maxConversations = options.maxConversations ?? 1000;
    this.maxMessagesPerConversation = options.maxMessagesPerConversation ?? 1000;

    logger.debug('ConversationHistory initialized', {
      autoSave: this.autoSave,
      maxConversations: this.maxConversations,
      maxMessagesPerConversation: this.maxMessagesPerConversation,
      persistenceType: persistence.constructor.name
    });
  }

  // Create a new conversation
  async createConversation(options: {
    id?: string;
    metadata?: Record<string, any>;
    title?: string;
  } = {}): Promise<Conversation> {
    const id = options.id || this.generateConversationId();
    const now = new Date();

    // Check if conversation already exists
    if (this.conversations.has(id)) {
      throw new Error(`Conversation with id "${id}" already exists`);
    }

    // Enforce maximum conversation limit
    if (this.conversations.size >= this.maxConversations) {
      await this.cleanupOldConversations();
    }

    const conversation: Conversation = {
      id,
      messages: [],
      createdAt: now,
      updatedAt: now,
      metadata: options.metadata || {},
      title: options.title || `Conversation ${id.slice(0, 8)}`
    };

    // Store in memory
    this.conversations.set(id, conversation);

    // Save to persistence if enabled
    if (this.autoSave) {
      await this.saveConversation(conversation);
    }

    logger.info('Conversation created', {
      conversationId: id,
      title: conversation.title,
      autoSave: this.autoSave
    });

    return conversation;
  }

  // Get conversation by ID (load from persistence if not in memory)
  async getConversation(id: string): Promise<Conversation | null> {
    // Check memory first
    let conversation = this.conversations.get(id);

    // If not in memory, try loading from persistence
    if (!conversation) {
      try {
        conversation = await this.persistence.loadConversation(id);
        if (conversation) {
          this.conversations.set(id, conversation);
          logger.debug('Conversation loaded from persistence', {
            conversationId: id,
            messageCount: conversation.messages.length
          });
        }
      } catch (error) {
        logger.error('Failed to load conversation from persistence', error as Error, {
          conversationId: id
        });
      }
    }

    return conversation || null;
  }

  // Add message to conversation
  async addMessage(
    conversationId: string,
    message: Message,
    options: {
      autoSave?: boolean;
      enforceMessageLimit?: boolean;
    } = {}
  ): Promise<Conversation> {
    const { autoSave = this.autoSave, enforceMessageLimit = true } = options;

    // Get or load conversation
    let conversation = await this.getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation "${conversationId}" not found`);
    }

    // Validate message
    this.validateMessage(message);

    // Enforce message limit if enabled
    if (enforceMessageLimit && conversation.messages.length >= this.maxMessagesPerConversation) {
      // Remove oldest messages to make room
      const toRemove = conversation.messages.length - this.maxMessagesPerConversation + 1;
      conversation.messages.splice(0, toRemove);
      logger.debug('Removed old messages to enforce limit', {
        conversationId,
        removedCount: toRemove,
        newTotal: conversation.messages.length
      });
    }

    // Add message
    conversation.messages.push(message);
    conversation.updatedAt = new Date();

    // Update title if this is the first user message and no title is set
    if (!conversation.title && message.role === 'user' && conversation.messages.length <= 3) {
      conversation.title = this.generateTitleFromMessage(message.content);
      logger.debug('Generated conversation title', {
        conversationId,
        title: conversation.title
      });
    }

    // Update memory
    this.conversations.set(conversationId, conversation);

    // Save to persistence if enabled
    if (autoSave) {
      await this.saveConversation(conversation);
    }

    logger.debug('Message added to conversation', {
      conversationId,
      messageRole: message.role,
      messageCount: conversation.messages.length,
      autoSave
    });

    return conversation;
  }

  // Add multiple messages to conversation
  async addMessages(
    conversationId: string,
    messages: Message[],
    options: {
      autoSave?: boolean;
      enforceMessageLimit?: boolean;
    } = {}
  ): Promise<Conversation> {
    const { autoSave = this.autoSave, enforceMessageLimit = true } = options;

    // Get conversation
    let conversation = await this.getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation "${conversationId}" not found`);
    }

    // Validate all messages
    for (const message of messages) {
      this.validateMessage(message);
    }

    // Calculate total messages after addition
    const totalMessages = conversation.messages.length + messages.length;

    // Enforce message limit if enabled
    if (enforceMessageLimit && totalMessages > this.maxMessagesPerConversation) {
      const toRemove = totalMessages - this.maxMessagesPerConversation;
      conversation.messages.splice(0, toRemove);
      logger.debug('Removed old messages before bulk addition', {
        conversationId,
        removedCount: toRemove,
        addingCount: messages.length
      });
    }

    // Add all messages
    conversation.messages.push(...messages);
    conversation.updatedAt = new Date();

    // Generate title if needed
    if (!conversation.title) {
      const firstUserMessage = messages.find(m => m.role === 'user') ||
                               conversation.messages.find(m => m.role === 'user');
      if (firstUserMessage) {
        conversation.title = this.generateTitleFromMessage(firstUserMessage.content);
      }
    }

    // Update memory
    this.conversations.set(conversationId, conversation);

    // Save to persistence if enabled
    if (autoSave) {
      await this.saveConversation(conversation);
    }

    logger.info('Multiple messages added to conversation', {
      conversationId,
      messageCount: messages.length,
      totalMessages: conversation.messages.length,
      autoSave
    });

    return conversation;
  }

  // Update conversation metadata
  async updateConversationMetadata(
    conversationId: string,
    metadata: Record<string, any>,
    options: { autoSave?: boolean } = {}
  ): Promise<Conversation> {
    const { autoSave = this.autoSave } = options;

    const conversation = await this.getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation "${conversationId}" not found`);
    }

    // Update metadata
    conversation.metadata = { ...conversation.metadata, ...metadata };
    conversation.updatedAt = new Date();

    // Update memory
    this.conversations.set(conversationId, conversation);

    // Save to persistence if enabled
    if (autoSave) {
      await this.saveConversation(conversation);
    }

    logger.debug('Conversation metadata updated', {
      conversationId,
      metadataKeys: Object.keys(metadata),
      autoSave
    });

    return conversation;
  }

  // Delete conversation
  async deleteConversation(conversationId: string): Promise<boolean> {
    try {
      // Remove from memory
      this.conversations.delete(conversationId);

      // Delete from persistence
      await this.persistence.deleteConversation(conversationId);

      logger.info('Conversation deleted', { conversationId });
      return true;
    } catch (error) {
      logger.error('Failed to delete conversation', error as Error, {
        conversationId
      });
      return false;
    }
  }

  // List conversations with optional filtering
  async listConversations(filter?: ConversationFilter): Promise<Conversation[]> {
    try {
      const conversations = await this.persistence.listConversations(filter);

      // Update memory with loaded conversations
      for (const conversation of conversations) {
        this.conversations.set(conversation.id, conversation);
      }

      logger.debug('Conversations listed', {
        count: conversations.length,
        hasFilter: !!filter
      });

      return conversations;
    } catch (error) {
      logger.error('Failed to list conversations', error as Error, { hasFilter: !!filter });
      return [];
    }
  }

  // Search conversations
  async searchConversations(query: {
    text?: string;
    role?: string;
    dateRange?: { start: Date; end: Date };
    metadata?: Record<string, any>;
    limit?: number;
  }): Promise<Conversation[]> {
    try {
      // For now, implement basic in-memory search
      // In a production system, this might use a proper search index
      let allConversations: Conversation[] = [];

      // If we have a text query, search through messages
      if (query.text) {
        const conversations = Array.from(this.conversations.values());
        for (const conversation of conversations) {
          const hasMatchingMessage = conversation.messages.some(msg =>
            msg.content.toLowerCase().includes(query.text!.toLowerCase())
          );
          if (hasMatchingMessage) {
            allConversations.push(conversation);
          }
        }
      } else {
        // Otherwise, just get all conversations
        allConversations = Array.from(this.conversations.values());
      }

      // Apply additional filters
      if (query.role) {
        allConversations = allConversations.filter(conv =>
          conv.messages.some(msg => msg.role === query.role)
        );
      }

      if (query.dateRange) {
        allConversations = allConversations.filter(conv =>
          conv.createdAt >= query.dateRange!.start &&
          conv.createdAt <= query.dateRange!.end
        );
      }

      if (query.metadata) {
        allConversations = allConversations.filter(conv => {
          for (const [key, value] of Object.entries(query.metadata!)) {
            if (conv.metadata[key] !== value) {
              return false;
            }
          }
          return true;
        });
      }

      // Apply limit
      if (query.limit && query.limit > 0) {
        allConversations = allConversations.slice(0, query.limit);
      }

      logger.debug('Conversations searched', {
        query,
        resultCount: allConversations.length
      });

      return allConversations;
    } catch (error) {
      logger.error('Failed to search conversations', error as Error, { query });
      return [];
    }
  }

  // Get conversation statistics
  async getStats(): Promise<ConversationStats> {
    const conversations = Array.from(this.conversations.values());
    const totalConversations = conversations.length;
    const totalMessages = conversations.reduce((sum, conv) => sum + conv.messages.length, 0);

    // Calculate average messages per conversation
    const avgMessagesPerConversation = totalConversations > 0 ? totalMessages / totalConversations : 0;

    // Find oldest and newest conversations
    let oldestConversation: Date | null = null;
    let newestConversation: Date | null = null;

    for (const conv of conversations) {
      if (!oldestConversation || conv.createdAt < oldestConversation) {
        oldestConversation = conv.createdAt;
      }
      if (!newestConversation || conv.createdAt > newestConversation) {
        newestConversation = conv.createdAt;
      }
    }

    // Get message distribution by role
    const messageRoleDistribution: Record<string, number> = {};
    for (const conv of conversations) {
      for (const msg of conv.messages) {
        messageRoleDistribution[msg.role] = (messageRoleDistribution[msg.role] || 0) + 1;
      }
    }

    const stats: ConversationStats = {
      totalConversations,
      totalMessages,
      avgMessagesPerConversation: Math.round(avgMessagesPerConversation * 100) / 100,
      oldestConversation,
      newestConversation,
      messageRoleDistribution
    };

    logger.debug('Conversation statistics calculated', stats);

    return stats;
  }

  // Clear all conversations
  async clearAllConversations(): Promise<void> {
    try {
      // Clear from memory
      this.conversations.clear();

      // Clear from persistence (this depends on the persistence implementation)
      const conversations = await this.persistence.listConversations();
      for (const conversation of conversations) {
        await this.persistence.deleteConversation(conversation.id);
      }

      logger.info('All conversations cleared');
    } catch (error) {
      logger.error('Failed to clear all conversations', error as Error);
      throw error;
    }
  }

  // Export conversation history
  async exportHistory(format: 'json' | 'csv' = 'json'): Promise<string> {
    const conversations = Array.from(this.conversations.values());

    if (format === 'json') {
      return JSON.stringify(conversations, null, 2);
    } else if (format === 'csv') {
      // Simple CSV export with basic fields
      const headers = ['conversationId', 'title', 'createdAt', 'updatedAt', 'messageCount'];
      const rows = [headers.join(',')];

      for (const conv of conversations) {
        const row = [
          conv.id,
          `"${conv.title.replace(/"/g, '""')}"`, // Escape quotes in CSV
          conv.createdAt.toISOString(),
          conv.updatedAt.toISOString(),
          conv.messages.length.toString()
        ];
        rows.push(row.join(','));
      }

      return rows.join('\n');
    }

    throw new Error(`Unsupported export format: ${format}`);
  }

  // Private helper methods

  private generateConversationId(): string {
    return `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateTitleFromMessage(content: string): string {
    // Take first 50 characters, truncate at word boundary
    const truncated = content.length > 50 ?
      content.substr(0, 50).replace(/\s+\S*$/, '') + '...' :
      content;

    return truncated.replace(/"/g, '');
  }

  private validateMessage(message: Message): void {
    if (!message.role || typeof message.role !== 'string') {
      throw new Error('Message must have a valid role');
    }

    if (!message.content || typeof message.content !== 'string') {
      throw new Error('Message must have valid content');
    }

    const validRoles = ['system', 'user', 'assistant', 'tool'];
    if (!validRoles.includes(message.role)) {
      throw new Error(`Invalid message role: ${message.role}. Must be one of: ${validRoles.join(', ')}`);
    }
  }

  private async saveConversation(conversation: Conversation): Promise<void> {
    try {
      await this.persistence.saveConversation(conversation);
    } catch (error) {
      logger.error('Failed to save conversation to persistence', error as Error, {
        conversationId: conversation.id
      });
      throw error;
    }
  }

  private async cleanupOldConversations(): Promise<void> {
    // Sort conversations by last updated time (oldest first)
    const sortedConversations = Array.from(this.conversations.values())
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());

    // Remove the oldest 10% to make room
    const toRemove = Math.max(1, Math.floor(this.maxConversations * 0.1));

    for (let i = 0; i < toRemove && i < sortedConversations.length; i++) {
      const conversation = sortedConversations[i];
      this.conversations.delete(conversation.id);
      await this.persistence.deleteConversation(conversation.id);
    }

    logger.info('Cleaned up old conversations', {
      removedCount: toRemove,
      remainingCount: this.conversations.size
    });
  }

  // Get current memory usage
  getMemoryUsage(): {
    conversationCount: number;
    totalMessages: number;
    memorySizeBytes: number;
  } {
    const conversations = Array.from(this.conversations.values());
    const totalMessages = conversations.reduce((sum, conv) => sum + conv.messages.length, 0);

    // Rough estimation of memory usage
    const memorySizeBytes = JSON.stringify(conversations).length * 2; // Approximate

    return {
      conversationCount: conversations.length,
      totalMessages,
      memorySizeBytes
    };
  }
}