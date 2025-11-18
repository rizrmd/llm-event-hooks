# Research Findings: LLM Class with Event Hooks

**Date**: 2025-10-18
**Feature**: LLM Class with Event Hooks

## OpenAI Agents JS Integration

### Decision: Use @openai/agents SDK
**Rationale**: Official OpenAI SDK specifically designed for agent development with built-in tool support and tracing capabilities.

**Key Findings**:
- **Package**: `@openai/agents` with `zod@3` dependency
- **Core Classes**: `Agent`, `run`, `RealtimeAgent`, `RealtimeSession`
- **Basic Pattern**: `const result = await run(agent, 'prompt');`
- **Tool Integration**: Turn any function into a tool automatically
- **Built-in Tracing**: Has tracing capabilities for debugging

### Architecture Approach
- **Wrapper Pattern**: Create a wrapper class around the OpenAI Agent to inject hooks
- **EventEmitter Integration**: Use Node.js EventEmitter for hook management
- **Middleware Style**: Implement hooks as middleware around the core `run()` function

## Hook System Design

### Decision: Custom EventEmitter-based Hook System
**Rationale**: Provides maximum flexibility, familiar Node.js patterns, and clean separation from OpenAI SDK.

**Key Findings**:
- **Hook Types**: before/after for messages, chunks, tools
- **Execution Order**: Priority-based sequential execution
- **Exception Handling**: Isolate hook failures to prevent main flow interruption
- **Thread Safety**: Use async/await patterns and proper queueing for concurrent operations

### Hook Registration Pattern
```typescript
// Example pattern to be implemented
class LLMAgentWithHooks {
  private eventEmitter = new EventEmitter();

  on(event: string, hook: Function): void
  off(event: string, hook: Function): void
  emit(event: string, data: any): Promise<void>
}
```

## Conversation History Management

### Decision: In-memory with Optional Persistence
**Rationale**: Provides performance for real-time use cases while allowing persistence customization.

**Key Findings**:
- **In-memory Storage**: Use Map or similar structure for O(1) access
- **Persistence Interface**: Define abstract interface for custom implementations
- **Loading**: Provide methods to load history from external storage
- **Memory Management**: Implement cleanup and size limits

### Persistence Options Researched
- **JSON File**: Simple, human-readable, good for development
- **SQLite**: Structured, ACID compliance, good for production
- **Custom Adapter**: Allow users to implement their own persistence

## Stream Buffering Strategy

### Decision: Configurable Buffer with Flush Hooks
**Rationale**: Balances performance with real-time requirements and provides maximum flexibility.

**Key Findings**:
- **Buffer Types**: Size-based (number of chunks), Time-based (milliseconds), Hybrid
- **Flush Triggers**: Configurable thresholds and manual flush options
- **Hook Integration**: Hooks trigger on buffer flush operations
- **Performance**: Target <10ms overhead per chunk

### Buffer Configuration Options
```typescript
interface BufferConfig {
  maxSize?: number;        // Max chunks before flush
  maxTime?: number;        // Max milliseconds before flush
  strategy?: 'size' | 'time' | 'hybrid';
}
```

## Tool Loop Implementation

### Decision: Hybrid Approach with Override Capability
**Rationale**: Provides automatic behavior while allowing developer control when needed.

**Key Findings**:
- **Automatic by Default**: Use OpenAI Agent's built-in tool execution
- **Override Points**: Before tool selection, after tool selection, before execution, after execution
- **Developer Control**: Ability to modify parameters, prevent execution, or handle manually
- **Hook Integration**: Tool hooks integrate seamlessly with automatic flow

## Technical Stack Decisions

### Runtime and Language
- **TypeScript**: Type safety and better developer experience
- **Bun Runtime**: Fast JavaScript execution and built-in tooling
- **Testing**: Bun's built-in test framework

### Performance Requirements
- **Chunk Processing**: <10ms latency target
- **Concurrent Hooks**: 1000+ simultaneous hook executions
- **Registration Operations**: <1ms for hook registration/unregistration
- **Memory**: Efficient buffer management to prevent leaks

## Dependencies Resolved

### OpenAI Agents JS
- **Package**: `@openai/agents`
- **Version**: Latest stable (check npm)
- **Peer Dependency**: `zod@3`
- **Integration**: Wrapper pattern around Agent class

### Persistence Mechanism
- **Default**: In-memory with optional file-based persistence
- **Interface**: Abstract persistence layer for custom implementations
- **Format**: JSON for simplicity, extensible to other formats

## Architecture Patterns

### Hook Management
- **EventEmitter**: Central event system for hook coordination
- **Priority Queue**: Ordered hook execution
- **Exception Isolation**: Prevent hook failures from affecting main flow
- **Async Support**: Full async/await support throughout

### Memory Management
- **Buffer Limits**: Configurable size limits to prevent memory leaks
- **Cleanup Hooks**: Automatic cleanup on instance destruction
- **Weak References**: Use weak references where appropriate

## Implementation Strategy

### Phase 1: Foundation
1. Hook registration system
2. Basic event emitter integration
3. Core LLM wrapper class

### Phase 2: Streaming Support
1. Stream buffer implementation
2. Chunk hook integration
3. Buffer flush mechanisms

### Phase 3: Tool Integration
1. Tool loop implementation
2. Tool hook integration
3. Override mechanisms

## Testing Strategy

### Unit Tests
- Hook registration and execution
- Buffer management
- Event emission patterns

### Integration Tests
- End-to-end message flows
- Streaming scenarios
- Tool execution workflows

### Performance Tests
- Hook execution latency
- Concurrent hook handling
- Memory usage under load