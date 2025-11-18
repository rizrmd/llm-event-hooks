import { ConversationHistory, SessionData } from '../types';

// Abstract persistence interface for different storage backends
export abstract class PersistenceAdapter {
  abstract saveConversation(history: ConversationHistory): Promise<void>;
  abstract loadConversation(id: string): Promise<ConversationHistory | null>;
  abstract deleteConversation(id: string): Promise<void>;
  abstract listConversations(): Promise<string[]>;

  // Optional session management methods
  async saveSession(session: SessionData): Promise<void> {
    // Default implementation - can be overridden
    throw new Error('Session management not implemented by this adapter');
  }

  async loadSession(id: string): Promise<SessionData | null> {
    // Default implementation - can be overridden
    throw new Error('Session management not implemented by this adapter');
  }

  async deleteSession(id: string): Promise<void> {
    // Default implementation - can be overridden
    throw new Error('Session management not implemented by this adapter');
  }

  // Utility methods
  protected generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  protected validateConversation(history: ConversationHistory): void {
    if (!history.id) {
      throw new Error('Conversation ID is required');
    }
    if (!history.messages || !Array.isArray(history.messages)) {
      throw new Error('Conversation messages must be an array');
    }
    if (!history.createdAt || !(history.createdAt instanceof Date)) {
      throw new Error('Conversation createdAt must be a valid Date');
    }
  }
}