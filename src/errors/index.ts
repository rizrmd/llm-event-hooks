// Error Classes for LLM Event Hooks
// Exporting error types from types/index.ts for convenience

export {
  HookableLLMError,
  HookExecutionError,
  BufferError,
  ToolExecutionError,
  PersistenceError
} from '../types';

// Additional error handling utilities
export class ValidationError extends HookableLLMError {
  constructor(message: string, public field?: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class ConfigurationError extends HookableLLMError {
  constructor(message: string, public configKey?: string) {
    super(message, 'CONFIGURATION_ERROR');
    this.name = 'ConfigurationError';
  }
}

export class TimeoutError extends HookableLLMError {
  constructor(message: string, public timeoutMs: number) {
    super(message, 'TIMEOUT_ERROR');
    this.name = 'TimeoutError';
  }
}

// Error handling utilities
export const isHookableError = (error: unknown): error is HookableLLMError => {
  return error instanceof HookableLLMError;
};

export const createErrorContext = (error: Error, context?: Record<string, any>) => {
  return {
    message: error.message,
    name: error.name,
    stack: error.stack,
    context,
    timestamp: new Date()
  };
};