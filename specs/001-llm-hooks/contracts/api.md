# API Contracts: LLM Class with Event Hooks

## Core Public API

### HookableLLM Class

```typescript
// Constructor
class HookableLLM {
  constructor(config: HookableLLMConfig);
}

// Configuration
interface HookableLLMConfig {
  apiKey: string;                    // OpenAI API key (required)
  model?: string;                    // OpenAI model (default: "gpt-4")
  persistence?: PersistenceAdapter;  // Custom persistence implementation
  bufferConfig?: BufferConfig;       // Streaming buffer configuration
  maxConcurrency?: number;          // Max concurrent hook executions
}

// Main execution methods
run(prompt: string, options?: RunOptions): Promise<RunResult>;
runStream(prompt: string, options?: RunOptions): AsyncIterable<ChunkResult>;

// Hook management
on(event: HookEvent, hook: HookFunction): this;
off(event: HookEvent, hook: HookFunction): this;
once(event: HookEvent, hook: HookFunction): this;
removeAllListeners(event?: HookEvent): this;

// Conversation management
loadHistory(history: ConversationHistory): void;
getHistory(): ConversationHistory;
clearHistory(): void;
saveHistory(): Promise<void>;
```

### Hook Events

```typescript
type HookEvent =
  // Message events
  | 'message:before'    // Before sending message to LLM
  | 'message:after'     // After receiving response from LLM

  // Streaming events
  | 'chunk:before'      // Before processing individual chunk
  | 'chunk:after'       // After processing individual chunk
  | 'buffer:flush'      // When buffer flushes accumulated chunks

  // Tool events
  | 'tool:before'       // Before executing tool
  | 'tool:after'        // After tool execution completes
  | 'tool:loop:before'  // Before tool loop iteration
  | 'tool:loop:after'   // After tool loop iteration

  // Lifecycle events
  | 'session:start'     // When new conversation session starts
  | 'session:end'       // When conversation session ends
  | 'error'             // When any error occurs

// Hook function signature
type HookFunction<T = any> = (data: T, context: EventContext) => Promise<T | void> | T | void;

// Event data types
interface MessageHookData {
  message: Message;
  direction: 'outgoing' | 'incoming';
}

interface ChunkHookData {
  chunk: string;
  sequence: number;
  buffer: BufferState;
}

interface BufferFlushHookData {
  chunks: string[];
  flushReason: 'size' | 'time' | 'manual' | 'completion';
  duration: number;
}

interface ToolHookData {
  tool: string;
  parameters: Record<string, any>;
  result?: ToolResult;
  error?: Error;
  executionTime?: number;
}
```

### Execution Options

```typescript
interface RunOptions {
  stream?: boolean;                    // Enable streaming (default: false)
  tools?: Tool[];                      // Available tools for LLM
  systemContext?: Record<string, any>; // System context variables
  maxTokens?: number;                  // Max tokens in response
  temperature?: number;                // Response temperature (0-1)
  conversationId?: string;            // Specific conversation ID
  userId?: string;                     // User identifier for tracking
  metadata?: Record<string, any>;      // Additional metadata
}

// Tool definition
interface Tool {
  name: string;                        // Tool name (unique)
  description: string;                 // Tool description for LLM
  parameters: Record<string, any>;     // JSON schema for parameters
  handler: ToolHandler;                // Tool implementation function
}

type ToolHandler = (params: Record<string, any>, context: EventContext) => Promise<ToolResult>;

interface ToolResult {
  success: boolean;                    // Whether tool succeeded
  data?: any;                         // Tool output data
  error?: string;                     // Error message if failed
  executionTime: number;              // Execution time in milliseconds
}
```

### Return Types

```typescript
interface RunResult {
  message: Message;                   // Response message
  toolCalls?: ToolCall[];            // Tool calls made during execution
  usage?: TokenUsage;                 // Token usage statistics
  executionTime: number;              // Total execution time
  conversationId: string;            // Conversation identifier
  sessionId: string;                 // Session identifier
}

interface ChunkResult {
  content: string;                    // Chunk content
  isComplete: boolean;               // Whether streaming is complete
  sequence: number;                  // Chunk sequence number
  metadata?: Record<string, any>;    // Additional metadata
}

interface Message {
  id: string;                         // Unique message ID
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;                    // Message content
  timestamp: Date;                   // Message timestamp
  metadata?: Record<string, any>;    // Additional metadata
}

interface ToolCall {
  id: string;                         // Tool call ID
  tool: string;                       // Tool name
  parameters: Record<string, any>;    // Tool parameters
  result?: ToolResult;               // Tool execution result
}

interface TokenUsage {
  prompt: number;                     // Prompt tokens
  completion: number;                 // Completion tokens
  total: number;                      // Total tokens
}
```

### Persistence Interface

```typescript
interface PersistenceAdapter {
  // Conversation management
  saveConversation(history: ConversationHistory): Promise<void>;
  loadConversation(id: string): Promise<ConversationHistory | null>;
  deleteConversation(id: string): Promise<void>;
  listConversations(): Promise<string[]>;

  // Session management
  saveSession(session: SessionData): Promise<void>;
  loadSession(id: string): Promise<SessionData | null>;
  deleteSession(id: string): Promise<void>;
}

interface ConversationHistory {
  id: string;                         // Conversation ID
  messages: Message[];                // Message history
  createdAt: Date;                   // Creation timestamp
  updatedAt: Date;                   // Last update timestamp
  metadata?: Record<string, any>;    // Additional metadata
}

interface SessionData {
  id: string;                         // Session ID
  conversationId: string;            // Associated conversation
  userId?: string;                   // User identifier
  systemContext?: Record<string, any>; // Session context
  createdAt: Date;                   // Session start
  lastActivity: Date;                // Last activity
}
```

### Buffer Configuration

```typescript
interface BufferConfig {
  maxSize?: number;                   // Max chunks before flush (default: 10)
  maxTime?: number;                   // Max milliseconds before flush (default: 100)
  strategy?: 'size' | 'time' | 'hybrid'; // Flush strategy (default: 'hybrid')
  autoFlush?: boolean;                // Auto-flush on completion (default: true)
}

interface BufferState {
  size: number;                       // Current buffer size
  chunks: string[];                  // Accumulated chunks
  createdAt: Date;                   // Buffer creation time
  lastFlush?: Date;                  // Last flush time
  strategy: BufferConfig['strategy']; // Active flush strategy
}
```

### Event Context

```typescript
interface EventContext {
  // Immutable context
  conversationId: string;            // Conversation identifier
  messageId?: string;                // Current message ID
  sessionId: string;                 // Session identifier
  timestamp: Date;                   // Event timestamp
  eventType: HookEvent;             // Event type
  metadata: Record<string, any>;     // Event metadata

  // Modifiable context (hooks can change these)
  systemContext: Record<string, any>; // System context variables
  availableTools: Tool[];            // Available tools for LLM
  conversationState: Record<string, any>; // Conversation state
  userContext?: Record<string, any>; // User-specific context
}
```

## Error Handling

### Error Types

```typescript
class HookableLLMError extends Error {
  constructor(message: string, public code: string, public context?: any);
}

class HookExecutionError extends HookableLLMError {
  constructor(message: string, public hookEvent: HookEvent, public hookId: string);
}

class BufferError extends HookableLLMError {
  constructor(message: string, public bufferState: BufferState);
}

class ToolExecutionError extends HookableLLMError {
  constructor(message: string, public toolName: string, public parameters: Record<string, any>);
}

class PersistenceError extends HookableLLMError {
  constructor(message: string, public operation: string);
}
```

### Error Event Data

```typescript
interface ErrorHookData {
  error: Error;
  eventType?: HookEvent;             // Event during which error occurred
  context?: EventContext;           // Event context if available
  recoverable: boolean;             // Whether error is recoverable
  suggestion?: string;              // Suggested resolution
}
```

## Usage Examples

### Basic Usage

```typescript
const llm = new HookableLLM({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4'
});

// Add message hooks
llm.on('message:before', async (data, context) => {
  console.log('Sending message:', data.message.content);
  // Can modify context.systemContext or context.availableTools
});

llm.on('message:after', async (data, context) => {
  console.log('Received response:', data.message.content);
});

// Execute
const result = await llm.run('Hello, how are you?');
```

### Streaming with Buffer Hooks

```typescript
llm.bufferConfig = {
  maxSize: 5,
  maxTime: 50,
  strategy: 'hybrid'
};

llm.on('chunk:before', async (data, context) => {
  console.log('Processing chunk:', data.sequence);
});

llm.on('buffer:flush', async (data, context) => {
  console.log('Buffer flushed:', data.chunks.length, 'chunks');
});

for await (const chunk of llm.runStream('Tell me a story')) {
  // Process streaming response
}
```

### Tool Integration

```typescript
const weatherTool: Tool = {
  name: 'get_weather',
  description: 'Get current weather for a location',
  parameters: {
    type: 'object',
    properties: {
      location: { type: 'string' }
    },
    required: ['location']
  },
  handler: async (params) => {
    // Weather API call implementation
    return {
      success: true,
      data: { temperature: 72, condition: 'sunny' },
      executionTime: 150
    };
  }
};

llm.on('tool:before', async (data, context) => {
  console.log('Executing tool:', data.tool);
  // Can modify parameters or prevent execution
});

const result = await llm.run('What is the weather in New York?', {
  tools: [weatherTool]
});
```