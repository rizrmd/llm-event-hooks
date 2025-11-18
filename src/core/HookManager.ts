// HookManager - Central management for all hook registration and execution
import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger';
import {
  HookEvent,
  HookFunction,
  HookRegistration,
  HookExecutionResult,
  HookError
} from '../types';

const logger = createLogger('HookManager');

interface PriorityHookRegistration {
  hook: HookFunction;
  priority: number;
  id: string;
  metadata: Record<string, any>;
  oneTime: boolean;
  timeout?: number;
}

export class HookManager extends EventEmitter {
  private hookRegistrations = new Map<HookEvent, PriorityHookRegistration[]>();
  private hookStats = new Map<string, {
    executionCount: number;
    totalExecutionTime: number;
    averageExecutionTime: number;
    errorCount: number;
    lastExecuted?: Date;
  }>();

  private globalHooks: Set<HookFunction> = new Set();
  private errorHandlers: Set<(error: HookError) => void> = new Set();

  constructor() {
    super();
    this.setupGlobalErrorHandling();
  }

  private setupGlobalErrorHandling(): void {
    // Handle any uncaught errors from hook execution
    this.on('error', (errorData) => {
      if (errorData.type === 'hook_execution_error') {
        const hookError: HookError = {
          hookId: errorData.hookId,
          event: errorData.event,
          error: errorData.error,
          context: errorData.context,
          timestamp: new Date(),
          executionTime: errorData.duration
        };

        // Notify all registered error handlers
        this.notifyErrorHandlers(hookError);
      }
    });
  }

  private notifyErrorHandlers(error: HookError): void {
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch (handlerError) {
        logger.error('Error handler failed', handlerError as Error, {
          originalHookId: error.hookId,
          originalEvent: error.event
        });
      }
    }
  }

  // Register a hook with enhanced metadata and validation
  registerHook(
    event: HookEvent,
    hook: HookFunction,
    options: {
      priority?: number;
      id?: string;
      metadata?: Record<string, any>;
      timeout?: number;
    } = {}
  ): string {
    const {
      priority = 100,
      id = `hook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      metadata = {},
      timeout
    } = options;

    // Validate hook function
    if (typeof hook !== 'function') {
      throw new Error('Hook must be a function');
    }

    // Create registration
    const registration: PriorityHookRegistration = {
      hook,
      priority,
      id,
      metadata,
      oneTime: false,
      timeout
    };

    // Initialize event array if not exists
    if (!this.hookRegistrations.has(event)) {
      this.hookRegistrations.set(event, []);
    }

    // Add to registrations and sort by priority
    const registrations = this.hookRegistrations.get(event)!;
    registrations.push(registration);
    registrations.sort((a, b) => a.priority - b.priority);

    // Initialize hook stats
    this.hookStats.set(id, {
      executionCount: 0,
      totalExecutionTime: 0,
      averageExecutionTime: 0,
      errorCount: 0
    });

    logger.info('Hook registered', {
      hookId: id,
      event,
      priority,
      hasTimeout: !!timeout,
      metadataKeys: Object.keys(metadata)
    });

    return id;
  }

  // Register a one-time hook with auto-cleanup
  registerOneTimeHook(
    event: HookEvent,
    hook: HookFunction,
    options: {
      priority?: number;
      id?: string;
      metadata?: Record<string, any>;
      timeout?: number;
    } = {}
  ): string {
    const {
      priority = 100,
      id = `once-hook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      metadata = {},
      timeout
    } = options;

    const wrappedHook = async (...args: any[]) => {
      const startTime = Date.now();

      try {
        // Execute the original hook
        const result = await Promise.resolve(hook.apply(this, args));

        // Auto-unregister after successful execution
        this.unregisterHookById(id);

        return result;
      } catch (error) {
        // Still unregister even if hook fails
        this.unregisterHookById(id);
        throw error;
      }
    };

    // Create registration
    const registration: PriorityHookRegistration = {
      hook: wrappedHook,
      priority,
      id,
      metadata,
      oneTime: true,
      timeout
    };

    // Initialize event array if not exists
    if (!this.hookRegistrations.has(event)) {
      this.hookRegistrations.set(event, []);
    }

    // Add to registrations and sort by priority
    const registrations = this.hookRegistrations.get(event)!;
    registrations.push(registration);
    registrations.sort((a, b) => a.priority - b.priority);

    // Initialize hook stats
    this.hookStats.set(id, {
      executionCount: 0,
      totalExecutionTime: 0,
      averageExecutionTime: 0,
      errorCount: 0
    });

    logger.info('One-time hook registered', {
      hookId: id,
      event,
      priority,
      hasTimeout: !!timeout,
      metadataKeys: Object.keys(metadata)
    });

    return id;
  }

  // Unregister hook by ID
  unregisterHookById(hookId: string): boolean {
    for (const [event, registrations] of this.hookRegistrations.entries()) {
      const index = registrations.findIndex(reg => reg.id === hookId);
      if (index !== -1) {
        registrations.splice(index, 1);
        this.hookStats.delete(hookId);

        logger.info('Hook unregistered by ID', {
          hookId,
          event
        });

        return true;
      }
    }

    logger.warn('Hook not found for unregistration', { hookId });
    return false;
  }

  // Unregister hook by function reference
  unregisterHook(event: HookEvent, hook: HookFunction): boolean {
    const registrations = this.hookRegistrations.get(event);
    if (!registrations) return false;

    const index = registrations.findIndex(reg => reg.hook === hook);
    if (index !== -1) {
      const removed = registrations.splice(index, 1)[0];
      this.hookStats.delete(removed.id);

      logger.info('Hook unregistered by function', {
        hookId: removed.id,
        event
      });

      return true;
    }

    return false;
  }

  // Execute hooks with enhanced monitoring and error handling
  async executeHooksWithMonitoring(
    event: HookEvent,
    data: any,
    context: any
  ): Promise<HookExecutionResult> {
    const startTime = Date.now();
    const registrations = this.hookRegistrations.get(event) || [];

    const result: HookExecutionResult = {
      success: true,
      executedHooks: [],
      errors: [],
      modifiedData: data,
      executionTime: 0,
      hookCount: registrations.length
    };

    logger.debug('Executing hooks with monitoring', {
      event,
      hookCount: registrations.length,
      initialDataType: typeof data
    });

    // Execute hooks in priority order
    for (const registration of registrations) {
      const hookStartTime = Date.now();

      try {
        // Execute hook with optional timeout
        const hookResult = registration.timeout
          ? await this.executeWithTimeout(registration.hook, [data, context], registration.timeout)
          : await Promise.resolve(registration.hook(data, context));

        const hookDuration = Date.now() - hookStartTime;

        // Update hook stats
        this.updateHookStats(registration.id, hookDuration, false);

        // Record successful execution
        result.executedHooks.push({
          hookId: registration.id,
          priority: registration.priority,
          executionTime: hookDuration,
          success: true,
          modifiedData: hookResult !== undefined
        });

        // Allow hooks to modify data
        if (hookResult !== undefined) {
          data = hookResult;
          result.modifiedData = data;
        }

        logger.debug('Hook executed successfully', {
          hookId: registration.id,
          duration: `${hookDuration}ms`,
          modifiedData: hookResult !== undefined
        });

      } catch (error) {
        const hookDuration = Date.now() - hookStartTime;
        const hookError: HookError = {
          hookId: registration.id,
          event,
          error: error as Error,
          context,
          timestamp: new Date(),
          executionTime: hookDuration
        };

        // Update hook stats
        this.updateHookStats(registration.id, hookDuration, true);

        // Record error
        result.errors.push(hookError);

        logger.error('Hook execution failed', error as Error, {
          hookId: registration.id,
          event,
          duration: `${hookDuration}ms`
        });

        // Notify error handlers
        this.notifyErrorHandlers(hookError);

        // Continue execution despite errors (exception isolation)
        continue;
      }
    }

    result.executionTime = Date.now() - startTime;
    result.success = result.errors.length === 0;

    logger.info('Hook execution completed', {
      event,
      totalDuration: `${result.executionTime}ms`,
      hookCount: result.hookCount,
      successCount: result.executedHooks.filter(h => h.success).length,
      errorCount: result.errors.length,
      dataModified: result.modifiedData !== data
    });

    return result;
  }

  // Execute function with timeout
  private async executeWithTimeout<T>(
    fn: (...args: any[]) => T,
    args: any[],
    timeout: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Hook execution timed out after ${timeout}ms`));
      }, timeout);

      Promise.resolve(fn.apply(this, args))
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  // Update hook statistics
  private updateHookStats(hookId: string, executionTime: number, hasError: boolean): void {
    const stats = this.hookStats.get(hookId);
    if (!stats) return;

    stats.executionCount++;
    stats.totalExecutionTime += executionTime;
    stats.averageExecutionTime = stats.totalExecutionTime / stats.executionCount;
    stats.lastExecuted = new Date();

    if (hasError) {
      stats.errorCount++;
    }
  }

  // Get hook info for an event
  getHookInfo(event: HookEvent): Array<{ id: string; priority: number }> {
    const registrations = this.hookRegistrations.get(event);
    if (!registrations) {
      return [];
    }

    return registrations.map(reg => ({
      id: reg.id,
      priority: reg.priority
    }));
  }

  // Get hook statistics
  getHookStats(hookId?: string): any {
    if (hookId) {
      return this.hookStats.get(hookId);
    }

    // Return all stats
    const allStats: Record<string, any> = {};
    for (const [id, stats] of this.hookStats.entries()) {
      allStats[id] = { ...stats };
    }
    return allStats;
  }

  // Get comprehensive hook information
  getComprehensiveHookInfo(): Record<HookEvent, Array<{
    id: string;
    priority: number;
    metadata: Record<string, any>;
    stats: any;
    oneTime: boolean;
  }>> {
    const info: Record<HookEvent, Array<any>> = {} as any;
    const allEvents: HookEvent[] = [
      'message:before',
      'message:after',
      'chunk:before',
      'chunk:after',
      'buffer:flush',
      'tool:before',
      'tool:after',
      'tool:loop:before',
      'tool:loop:after'
    ];

    for (const event of allEvents) {
      const registrations = this.hookRegistrations.get(event) || [];
      info[event] = [];

      for (const registration of registrations) {
        const stats = this.hookStats.get(registration.id);

        info[event].push({
          id: registration.id,
          priority: registration.priority,
          metadata: registration.metadata,
          stats: stats || null,
          oneTime: registration.oneTime
        });
      }
    }

    return info;
  }

  // Register global error handler
  onError(handler: (error: HookError) => void): () => void {
    this.errorHandlers.add(handler);

    // Return unsubscribe function
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  // Register global hook (executed for all events)
  registerGlobalHook(hook: HookFunction, priority: number = 100): string {
    const hookId = this.registerHook('message:before' as HookEvent, hook, { priority });
    this.globalHooks.add(hook);
    return hookId;
  }

  // Clear all hooks
  clearAllHooks(): void {
    this.hookRegistrations.clear();
    this.hookStats.clear();
    this.globalHooks.clear();

    logger.info('All hooks cleared');
  }

  // Validate hook configuration
  validateHookConfiguration(): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for duplicate priorities within same event
    for (const [event, registrations] of this.hookRegistrations.entries()) {
      const priorityCounts = new Map<number, number>();

      for (const registration of registrations) {
        const count = priorityCounts.get(registration.priority) || 0;
        priorityCounts.set(registration.priority, count + 1);

        if (count > 0) {
          warnings.push(
            `Event "${event}" has ${count + 1} hooks with priority ${registration.priority}. ` +
            'Consider using unique priorities for predictable execution order.'
          );
        }
      }
    }

    // Check for hooks with high execution times
    for (const [hookId, stats] of this.hookStats.entries()) {
      if (stats.averageExecutionTime > 100) { // 100ms threshold
        warnings.push(
          `Hook "${hookId}" has average execution time of ${stats.averageExecutionTime.toFixed(2)}ms. ` +
          'Consider optimizing for better performance.'
        );
      }

      if (stats.errorCount > 0) {
        const errorRate = (stats.errorCount / stats.executionCount) * 100;
        if (errorRate > 10) { // 10% error rate threshold
          warnings.push(
            `Hook "${hookId}" has high error rate: ${errorRate.toFixed(1)}% ` +
            `(${stats.errorCount}/${stats.executionCount} executions). Consider reviewing the hook implementation.`
          );
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Export hook configuration for backup/restore
  exportHookConfiguration(): {
    version: string;
    exportedAt: Date;
    hooks: Array<{
      event: HookEvent;
      hookId: string;
      priority: number;
      metadata: Record<string, any>;
      oneTime: boolean;
    }>;
  } {
    const hookInfo = this.getComprehensiveHookInfo();
    const hooks: any[] = [];

    for (const [event, eventHooks] of Object.entries(hookInfo)) {
      for (const hook of eventHooks) {
        hooks.push({
          event: event as HookEvent,
          hookId: hook.id,
          priority: hook.priority,
          metadata: hook.metadata,
          oneTime: hook.oneTime
        });
      }
    }

    return {
      version: '1.0.0',
      exportedAt: new Date(),
      hooks
    };
  }
}