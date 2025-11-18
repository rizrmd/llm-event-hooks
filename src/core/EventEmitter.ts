// Enhanced EventEmitter with priority-based hook execution
import { EventEmitter } from 'events';
import { HookEvent, HookFunction, HookRegistration } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('EventEmitter');

interface PriorityHookRegistration extends HookRegistration {
  id: string;
}

export class HookableEventEmitter extends EventEmitter {
  private hookRegistrations = new Map<HookEvent, PriorityHookRegistration[]>();
  private nextHookId = 1;

  constructor() {
    super();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    // Handle 'error' events to prevent crashes
    this.on('error', (error) => {
      logger.error('EventEmitter error', error);
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', new Error(String(reason)));
    });
  }

  // Register a hook with optional priority (lower numbers = higher priority)
  on(event: HookEvent, hook: HookFunction, priority: number = 100): this {
    this.registerHook(event, hook, priority);
    return super.on(event, hook);
  }

  // Register a one-time hook
  once(event: HookEvent, hook: HookFunction, priority: number = 100): this {
    const wrappedHook = (...args: any[]) => {
      this.unregisterHook(event, wrappedHook);
      return hook.apply(this, args);
    };
    wrappedHook.priority = priority;
    this.registerHook(event, wrappedHook, priority);
    return super.once(event, wrappedHook);
  }

  // Remove all listeners for an event (both EventEmitter and hooks)
  removeAllListeners(event: HookEvent): this {
    this.hookRegistrations.delete(event);
    return super.removeAllListeners(event);
  }

  // Remove a specific hook
  off(event: HookEvent, hook: HookFunction): this {
    this.unregisterHook(event, hook);
    return super.off(event, hook);
  }

  private registerHook(event: HookEvent, hook: HookFunction, priority: number): void {
    const registration: PriorityHookRegistration = {
      event,
      hook,
      priority: priority || 100,
      id: `hook-${this.nextHookId++}`
    };

    // Initialize event array if not exists
    if (!this.hookRegistrations.has(event)) {
      this.hookRegistrations.set(event, []);
    }

    // Add to registrations and sort by priority
    const registrations = this.hookRegistrations.get(event)!;
    registrations.push(registration);
    registrations.sort((a, b) => a.priority - b.priority);

    logger.debug('Hook registered', {
      event,
      hookId: registration.id,
      priority,
      totalHooks: registrations.length
    });
  }

  private unregisterHook(event: HookEvent, hook: HookFunction): void {
    const registrations = this.hookRegistrations.get(event);
    if (!registrations) return;

    const index = registrations.findIndex(reg => reg.hook === hook);
    if (index !== -1) {
      const removed = registrations.splice(index, 1)[0];
      logger.debug('Hook unregistered', {
        event,
        hookId: removed.id,
        remainingHooks: registrations.length
      });
    }
  }

  // Execute hooks for an event with data and context
  async executeHooks(event: HookEvent, data: any, context: any): Promise<any> {
    const registrations = this.hookRegistrations.get(event);
    if (!registrations || registrations.length === 0) {
      return data;
    }

    let currentData = data;
    const startTime = Date.now();

    logger.debug('Executing hooks', {
      event,
      hookCount: registrations.length,
      initialData: typeof currentData === 'object' ? { type: typeof currentData } : currentData
    });

    // Execute hooks in priority order with exception isolation
    for (const registration of registrations) {
      try {
        const hookStartTime = Date.now();

        const result = await Promise.resolve(
          registration.hook(currentData, context)
        );

        // Allow hooks to modify data (if they return something)
        if (result !== undefined) {
          currentData = result;
        }

        const hookDuration = Date.now() - hookStartTime;

        logger.debug('Hook executed successfully', {
          event,
          hookId: registration.id,
          duration: `${hookDuration}ms`,
          modifiedData: result !== undefined
        });

      } catch (error) {
        const hookDuration = Date.now() - hookStartTime;

        logger.error('Hook execution failed', error as Error, {
          event,
          hookId: registration.id,
          duration: `${hookDuration}ms`,
          error: (error as Error).message
        });

        // Emit a hook-specific error event but don't stop execution
        this.emit('error', {
          type: 'hook_execution_error',
          event,
          hookId: registration.id,
          error,
          duration: hookDuration,
          context
        });

        // Continue with next hook despite the error
        continue;
      }
    }

    const totalDuration = Date.now() - startTime;

    logger.debug('All hooks executed', {
      event,
      totalDuration: `${totalDuration}ms`,
      hookCount: registrations.length
    });

    return currentData;
  }

  // Execute hooks synchronously (for non-async hooks)
  executeHooksSync(event: HookEvent, data: any, context: any): any {
    const registrations = this.hookRegistrations.get(event);
    if (!registrations || registrations.length === 0) {
      return data;
    }

    let currentData = data;
    const startTime = Date.now();

    logger.debug('Executing hooks synchronously', {
      event,
      hookCount: registrations.length
    });

    for (const registration of registrations) {
      try {
        const hookStartTime = Date.now();

        const result = registration.hook(currentData, context);

        // Allow hooks to modify data (if they return something)
        if (result !== undefined) {
          currentData = result;
        }

        const hookDuration = Date.now() - hookStartTime;

        logger.debug('Sync hook executed successfully', {
          event,
          hookId: registration.id,
          duration: `${hookDuration}ms`,
          modifiedData: result !== undefined
        });

      } catch (error) {
        const hookDuration = Date.now() - hookStartTime;

        logger.error('Sync hook execution failed', error as Error, {
          event,
          hookId: registration.id,
          duration: `${hookDuration}ms`,
          error: (error as Error).message
        });

        // Emit a hook-specific error event but don't stop execution
        this.emit('error', {
          type: 'hook_execution_error',
          event,
          hookId: registration.id,
          error,
          duration: hookDuration,
          context
        });

        // Continue with next hook despite the error
        continue;
      }
    }

    const totalDuration = Date.now() - startTime;
    logger.debug('All sync hooks executed', {
      event,
      totalDuration: `${totalDuration}ms`,
      hookCount: registrations.length
    });

    return currentData;
  }

  // Get hook registration information
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

  // Get all hook registrations
  getAllHookInfo(): Record<HookEvent, Array<{ id: string; priority: number }>> {
    const info: Record<HookEvent, Array<{ id: string; priority: number }>> = {} as any;

    for (const [event] of this.hookRegistrations.entries()) {
      info[event] = this.getHookInfo(event);
    }

    return info;
  }
}