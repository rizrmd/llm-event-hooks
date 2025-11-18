import { PersistenceAdapter } from './PersistenceAdapter';
import { ConversationHistory, SessionData } from '../types';

export class InMemoryPersistence extends PersistenceAdapter {
  private conversations = new Map<string, ConversationHistory>();
  private sessions = new Map<string, SessionData>();

  async saveConversation(history: ConversationHistory): Promise<void> {
    this.validateConversation(history);

    // Ensure the conversation has an ID
    if (!history.id) {
      history.id = this.generateId();
    }

    // Update timestamps
    history.updatedAt = new Date();
    if (!history.createdAt) {
      history.createdAt = new Date();
    }

    this.conversations.set(history.id, { ...history });
  }

  async loadConversation(id: string): Promise<ConversationHistory | null> {
    const conversation = this.conversations.get(id);
    return conversation ? { ...conversation } : null;
  }

  async deleteConversation(id: string): Promise<void> {
    this.conversations.delete(id);
  }

  async listConversations(): Promise<string[]> {
    return Array.from(this.conversations.keys());
  }

  async saveSession(session: SessionData): Promise<void> {
    if (!session.id) {
      session.id = this.generateId();
    }

    session.lastActivity = new Date();
    if (!session.createdAt) {
      session.createdAt = new Date();
    }

    this.sessions.set(session.id, { ...session });
  }

  async loadSession(id: string): Promise<SessionData | null> {
    const session = this.sessions.get(id);
    return session ? { ...session } : null;
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  // Utility methods for testing and management
  clear(): void {
    this.conversations.clear();
    this.sessions.clear();
  }

  size(): { conversations: number; sessions: number } {
    return {
      conversations: this.conversations.size,
      sessions: this.sessions.size
    };
  }

  // Memory management - remove old conversations
  async cleanup(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    const now = Date.now();
    const cutoffTime = now - maxAge;

    // Clean old conversations
    for (const [id, conversation] of this.conversations.entries()) {
      if (conversation.updatedAt.getTime() < cutoffTime) {
        this.conversations.delete(id);
      }
    }

    // Clean old sessions
    for (const [id, session] of this.sessions.entries()) {
      if (session.lastActivity.getTime() < cutoffTime) {
        this.sessions.delete(id);
      }
    }
  }
}