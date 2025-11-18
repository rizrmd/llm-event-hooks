// Simple structured logging for the LLM Event Hooks library

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4
}

interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
  error?: Error;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;
  private logs: LogEntry[] = [];
  private maxLogEntries: number = 1000;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private addLog(entry: LogEntry): void {
    this.logs.push(entry);

    // Keep only the last maxLogEntries entries
    if (this.logs.length > this.maxLogEntries) {
      this.logs.shift();
    }
  }

  private formatLog(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = LogLevel[entry.level];
    const { category, message, data, error } = entry;

    let formatted = `[${timestamp}] [${level}] [${category}] ${message}`;

    if (data) {
      formatted += ` | Data: ${JSON.stringify(data)}`;
    }

    if (error) {
      formatted += ` | Error: ${error.message}`;
      if (error.stack) {
        formatted += `\nStack: ${error.stack}`;
      }
    }

    return formatted;
  }

  debug(category: string, message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    const entry: LogEntry = {
      timestamp: new Date(),
      level: LogLevel.DEBUG,
      category,
      message,
      data
    };

    this.addLog(entry);
    console.debug(this.formatLog(entry));
  }

  info(category: string, message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const entry: LogEntry = {
      timestamp: new Date(),
      level: LogLevel.INFO,
      category,
      message,
      data
    };

    this.addLog(entry);
    console.info(this.formatLog(entry));
  }

  warn(category: string, message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.WARN)) return;

    const entry: LogEntry = {
      timestamp: new Date(),
      level: LogLevel.WARN,
      category,
      message,
      data
    };

    this.addLog(entry);
    console.warn(this.formatLog(entry));
  }

  error(category: string, message: string, error?: Error, data?: any): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    const entry: LogEntry = {
      timestamp: new Date(),
      level: LogLevel.ERROR,
      category,
      message,
      data,
      error
    };

    this.addLog(entry);
    console.error(this.formatLog(entry));
  }

  // Performance logging
  startTimer(category: string, operation: string): () => void {
    const startTime = Date.now();
    const operationId = `${category}-${operation}-${startTime}`;

    this.debug(category, `Starting operation: ${operation}`, { operationId });

    return () => {
      const duration = Date.now() - startTime;
      this.info(category, `Completed operation: ${operation}`, {
        operationId,
        duration: `${duration}ms`
      });
    };
  }

  // Utility methods
  getLogs(level?: LogLevel): LogEntry[] {
    if (level !== undefined) {
      return this.logs.filter(log => log.level >= level);
    }
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }

  setMaxLogEntries(max: number): void {
    this.maxLogEntries = max;
  }

  // Hook-specific logging helpers
  logHookExecution(category: string, event: string, hookId: string, duration: number, data?: any): void {
    this.debug(category, `Hook executed: ${event}`, {
      hookId,
      duration: `${duration}ms`,
      event,
      data
    });
  }

  logHookError(category: string, event: string, hookId: string, error: Error): void {
    this.error(category, `Hook execution failed: ${event}`, error, {
      hookId,
      event
    });
  }

  logPerformanceMetrics(category: string, metrics: Record<string, number>): void {
    this.info(category, 'Performance metrics collected', metrics);
  }
}

// Default logger instance
export const logger = Logger.getInstance();

// Convenience exports
export const createLogger = (category: string) => ({
  debug: (message: string, data?: any) => logger.debug(category, message, data),
  info: (message: string, data?: any) => logger.info(category, message, data),
  warn: (message: string, data?: any) => logger.warn(category, message, data),
  error: (message: string, error?: Error, data?: any) => logger.error(category, message, error, data),
  startTimer: (operation: string) => logger.startTimer(category, operation)
});