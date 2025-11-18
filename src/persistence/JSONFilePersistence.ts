import { PersistenceAdapter } from './PersistenceAdapter';
import { ConversationHistory, SessionData } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('JSONFilePersistence');

export class JSONFilePersistence extends PersistenceAdapter {
  private filePath: string;
  private sessionFilePath: string;

  constructor(filePath: string) {
    super();
    this.filePath = filePath;
    this.sessionFilePath = filePath.replace('.json', '_sessions.json');
  }

  private async ensureDirectoryExists(): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const dir = this.filePath.substring(0, this.filePath.lastIndexOf('/'));
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore
    }
  }

  private async readJsonFile<T>(filePath: string): Promise<T | null> {
    const fs = await import('fs/promises');

    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  private async writeJsonFile<T>(filePath: string, data: T): Promise<void> {
    const fs = await import('fs/promises');
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async saveConversation(history: ConversationHistory): Promise<void> {
    try {
      await this.ensureDirectoryExists();
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

      // Load existing conversations
      const conversations = await this.loadConversationsData();
      conversations[history.id] = history;

      // Save back to file
      await this.writeJsonFile(this.filePath, conversations);

      logger.debug('Conversation saved', { conversationId: history.id });
    } catch (error) {
      logger.error('Failed to save conversation', error as Error);
      throw error;
    }
  }

  async loadConversation(id: string): Promise<ConversationHistory | null> {
    try {
      const conversations = await this.loadConversationsData();
      return conversations[id] ? { ...conversations[id] } : null;
    } catch (error) {
      logger.error('Failed to load conversation', error as Error, { conversationId: id });
      throw error;
    }
  }

  async deleteConversation(id: string): Promise<void> {
    try {
      const conversations = await this.loadConversationsData();
      delete conversations[id];
      await this.writeJsonFile(this.filePath, conversations);

      logger.debug('Conversation deleted', { conversationId: id });
    } catch (error) {
      logger.error('Failed to delete conversation', error as Error, { conversationId: id });
      throw error;
    }
  }

  async listConversations(): Promise<string[]> {
    try {
      const conversations = await this.loadConversationsData();
      return Object.keys(conversations);
    } catch (error) {
      logger.error('Failed to list conversations', error as Error);
      throw error;
    }
  }

  async saveSession(session: SessionData): Promise<void> {
    try {
      await this.ensureDirectoryExists();

      if (!session.id) {
        session.id = this.generateId();
      }

      session.lastActivity = new Date();
      if (!session.createdAt) {
        session.createdAt = new Date();
      }

      const sessions = await this.loadSessionsData();
      sessions[session.id] = session;

      await this.writeJsonFile(this.sessionFilePath, sessions);

      logger.debug('Session saved', { sessionId: session.id });
    } catch (error) {
      logger.error('Failed to save session', error as Error);
      throw error;
    }
  }

  async loadSession(id: string): Promise<SessionData | null> {
    try {
      const sessions = await this.loadSessionsData();
      return sessions[id] ? { ...sessions[id] } : null;
    } catch (error) {
      logger.error('Failed to load session', error as Error, { sessionId: id });
      throw error;
    }
  }

  async deleteSession(id: string): Promise<void> {
    try {
      const sessions = await this.loadSessionsData();
      delete sessions[id];
      await this.writeJsonFile(this.sessionFilePath, sessions);

      logger.debug('Session deleted', { sessionId: id });
    } catch (error) {
      logger.error('Failed to delete session', error as Error, { sessionId: id });
      throw error;
    }
  }

  private async loadConversationsData(): Promise<Record<string, ConversationHistory>> {
    const data = await this.readJsonFile<Record<string, ConversationHistory>>(this.filePath);
    return data || {};
  }

  private async loadSessionsData(): Promise<Record<string, SessionData>> {
    const data = await this.readJsonFile<Record<string, SessionData>>(this.sessionFilePath);
    return data || {};
  }

  // Utility methods for maintenance
  async cleanup(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    const now = Date.now();
    const cutoffTime = now - maxAge;

    // Clean old conversations
    const conversations = await this.loadConversationsData();
    let conversationsCleaned = 0;

    for (const [id, conversation] of Object.entries(conversations)) {
      if (conversation.updatedAt.getTime() < cutoffTime) {
        delete conversations[id];
        conversationsCleaned++;
      }
    }

    if (conversationsCleaned > 0) {
      await this.writeJsonFile(this.filePath, conversations);
      logger.info('Cleaned up old conversations', { cleaned: conversationsCleaned });
    }

    // Clean old sessions
    const sessions = await this.loadSessionsData();
    let sessionsCleaned = 0;

    for (const [id, session] of Object.entries(sessions)) {
      if (session.lastActivity.getTime() < cutoffTime) {
        delete sessions[id];
        sessionsCleaned++;
      }
    }

    if (sessionsCleaned > 0) {
      await this.writeJsonFile(this.sessionFilePath, sessions);
      logger.info('Cleaned up old sessions', { cleaned: sessionsCleaned });
    }
  }

  async getStorageStats(): Promise<{
    conversationsCount: number;
    sessionsCount: number;
    fileSize: { conversations: number; sessions: number }
  }> {
    const fs = await import('fs/promises');

    const [conversations, sessions] = await Promise.all([
      this.loadConversationsData(),
      this.loadSessionsData()
    ]);

    const [conversationStats, sessionStats] = await Promise.allSettled([
      fs.stat(this.filePath).catch(() => ({ size: 0 })),
      fs.stat(this.sessionFilePath).catch(() => ({ size: 0 }))
    ]);

    return {
      conversationsCount: Object.keys(conversations).length,
      sessionsCount: Object.keys(sessions).length,
      fileSize: {
        conversations: conversationStats.status === 'fulfilled' ? conversationStats.value.size : 0,
        sessions: sessionStats.status === 'fulfilled' ? sessionStats.value.size : 0
      }
    };
  }
}