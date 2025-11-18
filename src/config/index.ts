// Configuration management for LLM Event Hooks
import { createLogger } from '../utils/logger';

const logger = createLogger('Configuration');

export interface AppConfig {
  // OpenAI Configuration
  openaiApiKey?: string;
  defaultModel?: string;
  defaultTemperature?: number;
  defaultMaxTokens?: number;

  // Performance Configuration
  maxConcurrentHooks?: number;
  hookExecutionTimeout?: number;
  bufferFlushTimeout?: number;

  // Logging Configuration
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  maxLogEntries?: number;

  // Persistence Configuration
  defaultPersistenceType?: 'memory' | 'json';
  persistencePath?: string;
  autoCleanupAge?: number; // in milliseconds

  // Buffer Configuration
  defaultBufferSize?: number;
  defaultBufferTime?: number;
  defaultBufferStrategy?: 'size' | 'time' | 'hybrid';
}

class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig = {};

  private constructor() {
    this.loadFromEnvironment();
    this.setDefaults();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadFromEnvironment(): void {
    // OpenAI Configuration
    if (process.env.OPENAI_API_KEY) {
      this.config.openaiApiKey = process.env.OPENAI_API_KEY;
    }

    if (process.env.OPENAI_DEFAULT_MODEL) {
      this.config.defaultModel = process.env.OPENAI_DEFAULT_MODEL;
    }

    if (process.env.OPENAI_DEFAULT_TEMPERATURE) {
      this.config.defaultTemperature = parseFloat(process.env.OPENAI_DEFAULT_TEMPERATURE);
    }

    if (process.env.OPENAI_DEFAULT_MAX_TOKENS) {
      this.config.defaultMaxTokens = parseInt(process.env.OPENAI_DEFAULT_MAX_TOKENS, 10);
    }

    // Performance Configuration
    if (process.env.MAX_CONCURRENT_HOOKS) {
      this.config.maxConcurrentHooks = parseInt(process.env.MAX_CONCURRENT_HOOKS, 10);
    }

    if (process.env.HOOK_EXECUTION_TIMEOUT) {
      this.config.hookExecutionTimeout = parseInt(process.env.HOOK_EXECUTION_TIMEOUT, 30000);
    }

    if (process.env.BUFFER_FLUSH_TIMEOUT) {
      this.config.bufferFlushTimeout = parseInt(process.env.BUFFER_FLUSH_TIMEOUT, 100);
    }

    // Logging Configuration
    if (process.env.LOG_LEVEL) {
      this.config.logLevel = process.env.LOG_LEVEL.toLowerCase() as any;
    }

    if (process.env.MAX_LOG_ENTRIES) {
      this.config.maxLogEntries = parseInt(process.env.MAX_LOG_ENTRIES, 1000);
    }

    // Persistence Configuration
    if (process.env.DEFAULT_PERSISTENCE_TYPE) {
      this.config.defaultPersistenceType = process.env.DEFAULT_PERSISTENCE_TYPE as any;
    }

    if (process.env.PERSISTENCE_PATH) {
      this.config.persistencePath = process.env.PERSISTENCE_PATH;
    }

    if (process.env.AUTO_CLEANUP_AGE) {
      this.config.autoCleanupAge = parseInt(process.env.AUTO_CLEANUP_AGE, 7 * 24 * 60 * 60 * 1000); // 7 days
    }

    // Buffer Configuration
    if (process.env.DEFAULT_BUFFER_SIZE) {
      this.config.defaultBufferSize = parseInt(process.env.DEFAULT_BUFFER_SIZE, 10);
    }

    if (process.env.DEFAULT_BUFFER_TIME) {
      this.config.defaultBufferTime = parseInt(process.env.DEFAULT_BUFFER_TIME, 100);
    }

    if (process.env.DEFAULT_BUFFER_STRATEGY) {
      this.config.defaultBufferStrategy = process.env.DEFAULT_BUFFER_STRATEGY as any;
    }

    logger.debug('Configuration loaded from environment', {
      hasApiKey: !!this.config.openaiApiKey,
      hasModel: !!this.config.defaultModel,
      logLevel: this.config.logLevel
    });
  }

  private setDefaults(): void {
    // OpenAI Configuration
    this.config.defaultModel = this.config.defaultModel || 'gpt-4';
    this.config.defaultTemperature = this.config.defaultTemperature || 0.7;
    this.config.defaultMaxTokens = this.config.defaultMaxTokens || 4096;

    // Performance Configuration
    this.config.maxConcurrentHooks = this.config.maxConcurrentHooks || 1000;
    this.config.hookExecutionTimeout = this.config.hookExecutionTimeout || 30000; // 30 seconds
    this.config.bufferFlushTimeout = this.config.bufferFlushTimeout || 100; // 100ms

    // Logging Configuration
    this.config.logLevel = this.config.logLevel || 'info';
    this.config.maxLogEntries = this.config.maxLogEntries || 1000;

    // Persistence Configuration
    this.config.defaultPersistenceType = this.config.defaultPersistenceType || 'memory';
    this.config.persistencePath = this.config.persistencePath || './conversations.json';
    this.config.autoCleanupAge = this.config.autoCleanupAge || 7 * 24 * 60 * 60 * 1000; // 7 days

    // Buffer Configuration
    this.config.defaultBufferSize = this.config.defaultBufferSize || 10;
    this.config.defaultBufferTime = this.config.defaultBufferTime || 100;
    this.config.defaultBufferStrategy = this.config.defaultBufferStrategy || 'hybrid';

    logger.debug('Default configuration applied', {
      model: this.config.defaultModel,
      maxConcurrentHooks: this.config.maxConcurrentHooks,
      persistenceType: this.config.defaultPersistenceType
    });
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }

  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    this.config[key] = value;
    logger.debug('Configuration updated', { key, value });
  }

  getAll(): AppConfig {
    return { ...this.config };
  }

  // Validation methods
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate required OpenAI configuration
    if (!this.config.openaiApiKey) {
      errors.push('OpenAI API key is required');
    }

    if (!this.config.defaultModel) {
      errors.push('Default model is required');
    }

    // Validate performance configuration
    if (this.config.maxConcurrentHooks && this.config.maxConcurrentHooks <= 0) {
      errors.push('Max concurrent hooks must be greater than 0');
    }

    if (this.config.hookExecutionTimeout && this.config.hookExecutionTimeout <= 0) {
      errors.push('Hook execution timeout must be greater than 0');
    }

    // Validate persistence configuration
    if (!['memory', 'json'].includes(this.config.defaultPersistenceType!)) {
      errors.push('Default persistence type must be "memory" or "json"');
    }

    // Validate buffer configuration
    if (this.config.defaultBufferSize && this.config.defaultBufferSize <= 0) {
      errors.push('Default buffer size must be greater than 0');
    }

    if (this.config.defaultBufferTime && this.config.defaultBufferTime <= 0) {
      errors.push('Default buffer time must be greater than 0');
    }

    const isValid = errors.length === 0;

    if (!isValid) {
      logger.error('Configuration validation failed', { errors });
    } else {
      logger.info('Configuration validation passed');
    }

    return { isValid, errors };
  }

  // Utility methods
  reset(): void {
    this.config = {};
    this.loadFromEnvironment();
    this.setDefaults();
    logger.info('Configuration reset to defaults');
  }

  // Configuration file operations (optional implementation)
  async loadFromFile(filePath: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const data = await fs.readFile(filePath, 'utf-8');
      const fileConfig = JSON.parse(data);

      Object.assign(this.config, fileConfig);
      logger.info('Configuration loaded from file', { filePath });
    } catch (error) {
      logger.error('Failed to load configuration from file', error as Error, { filePath });
      throw error;
    }
  }

  async saveToFile(filePath: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(filePath, JSON.stringify(this.config, null, 2), 'utf-8');
      logger.info('Configuration saved to file', { filePath });
    } catch (error) {
      logger.error('Failed to save configuration to file', error as Error, { filePath });
      throw error;
    }
  }
}

// Default config instance
export const config = ConfigManager.getInstance();