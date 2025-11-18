# Data Model: LLM Class with Event Hooks

**Date**: 2025-10-18
**Feature**: LLM Class with Event Hooks

## Core Entities

### 1. HookableLLM (Main Class)

```typescript
interface HookableLLMConfig {
  apiKey: string;
  model?: string;
  persistence?: PersistenceAdapter;
  bufferConfig?: BufferConfig;
}

class HookableLLM extends EventEmitter {
  constructor(config: HookableLLMConfig);

  // Hook management
  on(event: HookEvent, hook: HookFunction): this;
  off(event: HookEvent, hook: HookFunction): this;

  // Core functionality
  run(prompt: string, options?: RunOptions): Promise<RunResult>;
  runStream(prompt: string, options?: RunOptions): AsyncIterable<ChunkResult>;

  // History management
  loadHistory(history: ConversationHistory): void;
  getHistory(): ConversationHistory;
  clearHistory(): void;
}
```

### 2. Hook System

```typescript
type HookEvent =
  | 'message:before'
  | 'message:after'
  | 'chunk:before'
  | 'chunk:after'
  | 'buffer:flush'
  | 'tool:before'
  | 'tool:after'
  | 'tool:loop:before'
  | 'tool:loop:after';

interface HookFunction<T = any> {
  (data: T): Promise<T> | T;
  priority?: number; // Lower numbers = higher priority
}

interface HookRegistration {
  event: HookEvent;
  hook: HookFunction;
  priority: number;
  id: string;
}
```

### 3. Message and Conversation

```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

interface ConversationHistory {
  id: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

interface MessageEvent {
  message: Message;
  direction: 'outgoing' | 'incoming';
  context: EventContext;
}
```

### 4. Streaming and Buffering

```typescript
interface ChunkEvent {
  chunk: string;
  sequence: number;
  timestamp: Date;
  buffer: BufferState;
  context: EventContext;
}

interface BufferConfig {
  maxSize?: number;        // Max chunks before flush
  maxTime?: number;        // Max milliseconds before flush
  strategy?: 'size' | 'time' | 'hybrid';
}

interface BufferState {
  size: number;
  chunks: string[];
  createdAt: Date;
  lastFlush?: Date;
}

interface BufferFlushEvent {
  chunks: string[];
  flushReason: 'size' | 'time' | 'manual' | 'completion';
  duration: number;
  context: EventContext;
}
```

### 5. Tool System

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  handler: ToolHandler;
}

interface ToolHandler {
  (params: Record<string, any>): Promise<ToolResult>;
}

interface ToolEvent {
  tool: string;
  parameters: Record<string, any>;
  result?: ToolResult;
  error?: Error;
  executionTime?: number;
  context: EventContext;
}

interface ToolLoopEvent {
  tools: Tool[];
  decision: ToolDecision;
  context: EventContext;
}

interface ToolDecision {
  selectedTool?: string;
  parameters?: Record<string, any>;
  reasoning?: string;
  confidence?: number;
}

interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTime: number;
}
```

### 6. Event Context

```typescript
interface EventContext {
  conversationId: string;
  messageId?: string;
  sessionId: string;
  timestamp: Date;
  metadata: Record<string, any>;

  // Modifiable context (for hooks)
  systemContext?: Record<string, any>;
  availableTools?: Tool[];
  conversationState?: Record<string, any>;
}
```

### 7. Persistence Layer

```typescript
interface PersistenceAdapter {
  saveConversation(history: ConversationHistory): Promise<void>;
  loadConversation(id: string): Promise<ConversationHistory | null>;
  deleteConversation(id: string): Promise<void>;
  listConversations(): Promise<string[]>;
}

class JSONFilePersistence implements PersistenceAdapter {
  constructor(filePath: string);
  // Implementation methods...
}

class InMemoryPersistence implements PersistenceAdapter {
  // Implementation methods...
}
```

### 8. Core Execution

```typescript
interface RunOptions {
  stream?: boolean;
  tools?: Tool[];
  systemContext?: Record<string, any>;
  maxTokens?: number;
  temperature?: number;
}

interface RunResult {
  message: Message;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
  executionTime: number;
}

interface ChunkResult {
  content: string;
  isComplete: boolean;
  metadata?: Record<string, any>;
}

interface ToolCall {
  id: string;
  tool: string;
  parameters: Record<string, any>;
}

interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}
```

## Entity Relationships

```
HookableLLM
├── Manages -> HookRegistration[]
├── Manages -> ConversationHistory
├── Uses -> PersistenceAdapter
├── Uses -> BufferConfig
├── Emits -> MessageEvent
├── Emits -> ChunkEvent
├── Emits -> BufferFlushEvent
├── Emits -> ToolEvent
└── Emits -> ToolLoopEvent

ConversationHistory
├── Contains -> Message[]
└── Managed by -> PersistenceAdapter

Message
├── Part of -> MessageEvent
└── Part of -> ConversationHistory

Tool
├── Used in -> ToolEvent
└── Available in -> EventContext
```

## Data Validation Rules

### Message Validation
- `id`: Required, UUID format
- `role`: Required, one of: 'user', 'assistant', 'system', 'tool'
- `content`: Required, non-empty string
- `timestamp`: Required, valid date

### Hook Registration Validation
- `event`: Required, valid HookEvent
- `hook`: Required, callable function
- `priority`: Optional, number >= 0
- `id`: Required, unique within event type

### Buffer Configuration Validation
- `maxSize`: Optional, number > 0
- `maxTime`: Optional, number > 0
- `strategy`: Optional, one of: 'size', 'time', 'hybrid'

### Tool Validation
- `name`: Required, non-empty string, unique
- `description`: Required, non-empty string
- `parameters`: Required, object
- `handler`: Required, callable function

## State Transitions

### Hook Lifecycle
1. **Registration**: Hook registered with event and priority
2. **Execution**: Hook called when event occurs
3. **Error Handling**: Hook errors isolated, logged, main flow continues
4. **Unregistration**: Hook removed from execution queue

### Conversation Lifecycle
1. **Creation**: New conversation with unique ID
2. **Message Addition**: Messages added to conversation
3. **Persistence**: Conversation saved to persistence layer
4. **Loading**: Conversation loaded from persistence
5. **Clearing**: Conversation messages cleared

### Buffer Lifecycle
1. **Creation**: Buffer initialized with config
2. **Accumulation**: Chunks added to buffer
3. **Flush**: Buffer emptied and hooks triggered
4. **Reset**: Buffer reset for new streaming session

### Tool Execution Lifecycle
1. **Selection**: Tool selected by LLM (before-tool hook)
2. **Validation**: Parameters validated and potentially modified
3. **Execution**: Tool handler called
4. **Result Processing**: Result processed (after-tool hook)
5. **Loop Continuation**: Decision to continue or stop tool loop

## Performance Considerations

### Memory Management
- Buffer size limits to prevent memory bloat
- Automatic cleanup of old conversations
- Weak references for hook storage where appropriate

### Concurrency
- Thread-safe hook execution using async patterns
- Sequential hook execution within single event
- Concurrent event processing for different sessions

### Performance Targets
- Hook registration: <1ms
- Hook execution: <10ms overhead
- Buffer flush: <5ms
- Tool execution overhead: <2ms