# Quickstart Guide: LLM Class with Event Hooks

**Runtime**: Bun | **Language**: TypeScript | **Dependencies**: @openai/agents, zod

## Installation

```bash
# Install dependencies
bun add @openai/agents zod

# Install development dependencies
bun add -d @types/node typescript bun-types
```

## Basic Setup

### 1. Create Your LLM Instance

```typescript
// llm-instance.ts
import { HookableLLM } from './src/HookableLLM';

const llm = new HookableLLM({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4'
});

export { llm };
```

### 2. Run Basic Example

```typescript
// basic-example.ts
import { llm } from './llm-instance';

async function basicExample() {
  // Add a simple logging hook
  llm.on('message:before', (data) => {
    console.log('📤 Sending:', data.message.content);
  });

  llm.on('message:after', (data) => {
    console.log('📥 Received:', data.message.content);
  });

  // Execute a conversation
  const result = await llm.run('Hello! Tell me a joke.');

  console.log('✅ Complete! Response:', result.message.content);
}

basicExample().catch(console.error);
```

### 3. Run with Bun

```bash
# Set your OpenAI API key
export OPENAI_API_KEY=your_api_key_here

# Run the example
bun run basic-example.ts
```

## Streaming with Buffer Hooks

### 1. Configure Buffer and Add Streaming Hooks

```typescript
// streaming-example.ts
import { llm } from './llm-instance';

async function streamingExample() {
  // Configure buffer for streaming
  llm.bufferConfig = {
    maxSize: 3,           // Flush after 3 chunks
    maxTime: 100,         // Or after 100ms
    strategy: 'hybrid'    // Use both size and time triggers
  };

  // Add chunk processing hooks
  llm.on('chunk:before', (data) => {
    console.log(`⚡ Chunk ${data.sequence}: "${data.chunk}"`);
  });

  // Add buffer flush hook
  llm.on('buffer:flush', (data) => {
    console.log(`🔄 Buffer flushed: ${data.chunks.length} chunks (${data.flushReason})`);
    console.log(`   Combined: "${data.chunks.join('')}"`);
  });

  // Stream a response
  console.log('🚀 Starting streaming response...');

  for await (const chunk of llm.runStream('Write a short poem about coding.')) {
    if (chunk.isComplete) {
      console.log('✅ Streaming complete!');
    }
  }
}

streamingExample().catch(console.error);
```

### 2. Run Streaming Example

```bash
bun run streaming-example.ts
```

## Tool Integration

### 1. Define Tools

```typescript
// tools.ts
import type { Tool } from './src/types';

export const weatherTool: Tool = {
  name: 'get_weather',
  description: 'Get current weather information for a location',
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'The city and state, e.g. San Francisco, CA'
      },
      units: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
        description: 'Temperature units'
      }
    },
    required: ['location']
  },
  handler: async (params) => {
    // Mock weather API call
    await new Promise(resolve => setTimeout(resolve, 500));

    return {
      success: true,
      data: {
        location: params.location,
        temperature: 22,
        condition: 'partly cloudy',
        humidity: 65,
        units: params.units || 'celsius'
      },
      executionTime: 512
    };
  }
};

export const calculatorTool: Tool = {
  name: 'calculator',
  description: 'Perform mathematical calculations',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Mathematical expression to evaluate'
      }
    },
    required: ['expression']
  },
  handler: async (params) => {
    try {
      // Simple calculator implementation
      const result = eval(params.expression);
      return {
        success: true,
        data: { expression: params.expression, result },
        executionTime: 5
      };
    } catch (error) {
      return {
        success: false,
        error: 'Invalid expression',
        executionTime: 2
      };
    }
  }
};
```

### 2. Use Tools with Hooks

```typescript
// tools-example.ts
import { llm } from './llm-instance';
import { weatherTool, calculatorTool } from './tools';

async function toolsExample() {
  // Add tool monitoring hooks
  llm.on('tool:before', (data) => {
    console.log(`🔧 Executing tool: ${data.tool}`);
    console.log(`   Parameters:`, JSON.stringify(data.parameters, null, 2));
  });

  llm.on('tool:after', (data) => {
    console.log(`✅ Tool completed: ${data.tool}`);
    console.log(`   Execution time: ${data.executionTime}ms`);
    if (data.result?.success) {
      console.log(`   Result:`, data.result.data);
    } else {
      console.log(`   Error:`, data.result?.error);
    }
  });

  // Add tool loop monitoring
  llm.on('tool:loop:before', (data) => {
    console.log(`🔄 Tool loop starting with ${data.tools.length} available tools`);
  });

  llm.on('tool:loop:after', (data) => {
    console.log(`🏁 Tool loop completed`);
    if (data.decision.selectedTool) {
      console.log(`   Selected: ${data.decision.selectedTool}`);
    }
  });

  // Execute with tools
  const weatherResult = await llm.run('What is the weather like in Tokyo?', {
    tools: [weatherTool]
  });

  console.log('\nWeather Response:', weatherResult.message.content);

  const mathResult = await llm.run('Calculate 25 * 4 + 10', {
    tools: [calculatorTool]
  });

  console.log('\nMath Response:', mathResult.message.content);
}

toolsExample().catch(console.error);
```

### 3. Run Tools Example

```bash
bun run tools-example.ts
```

## Context Modification in Hooks

### 1. Modify System Context and Available Tools

```typescript
// context-modification-example.ts
import { llm } from './llm-instance';
import { weatherTool } from './tools';

async function contextModificationExample() {
  // Add context modification hooks
  llm.on('message:before', (data, context) => {
    // Modify system context dynamically
    context.systemContext = {
      ...context.systemContext,
      current_user: 'developer',
      session_id: context.sessionId,
      timestamp: new Date().toISOString(),
      capabilities: ['weather', 'calculation']
    };

    // Add additional tools based on context
    if (context.systemContext.current_user === 'developer') {
      context.availableTools.push(weatherTool);
    }

    console.log('🔧 Modified context:', {
      user: context.systemContext.current_user,
      toolsCount: context.availableTools.length
    });
  });

  const result = await llm.run('What tools do you have access to?', {
    tools: [] // Start with empty tools, hook will add them
  });

  console.log('Response:', result.message.content);
}

contextModificationExample().catch(console.error);
```

## Persistence

### 1. JSON File Persistence

```typescript
// persistence-example.ts
import { llm } from './src/HookableLLM';
import { JSONFilePersistence } from './src/persistence/JSONFilePersistence';

async function persistenceExample() {
  // Set up file-based persistence
  const persistence = new JSONFilePersistence('./conversations');
  llm.persistence = persistence;

  // Add persistence monitoring hooks
  llm.on('message:after', async (data, context) => {
    console.log('💾 Saving conversation...');
    await llm.saveHistory();
    console.log('✅ Conversation saved');
  });

  // Start a conversation
  console.log('📝 Starting conversation...');
  await llm.run('Hi! My name is Alice.');

  await llm.run('Remember that I live in San Francisco.');

  // Load history in new session
  const history = llm.getHistory();
  console.log('📚 Current history:', history.messages.length, 'messages');

  console.log('👋 Last message:', history.messages[history.messages.length - 1]?.content);
}

persistenceExample().catch(console.error);
```

## Error Handling

### 1. Comprehensive Error Handling

```typescript
// error-handling-example.ts
import { llm } from './llm-instance';
import { HookableLLMError } from './src/errors';

async function errorHandlingExample() {
  // Add error handling hooks
  llm.on('error', (data) => {
    console.error('❌ Error occurred:', data.error.message);
    console.error('   Context:', data.eventType);
    console.error('   Recoverable:', data.recoverable);

    if (data.suggestion) {
      console.error('   Suggestion:', data.suggestion);
    }
  });

  // Add hook that might fail
  llm.on('message:before', () => {
    // Simulate an error
    if (Math.random() < 0.3) { // 30% chance
      throw new Error('Simulated hook failure');
    }
  });

  try {
    const result = await llm.run('This should work despite hook errors.');
    console.log('✅ Success despite hook errors:', result.message.content.length, 'characters');
  } catch (error) {
    if (error instanceof HookableLLMError) {
      console.error('💥 LLM Error:', error.message, 'Code:', error.code);
    } else {
      console.error('💥 Unexpected error:', error);
    }
  }
}

errorHandlingExample().catch(console.error);
```

## Performance Monitoring

### 1. Track Performance Metrics

```typescript
// performance-example.ts
import { llm } from './llm-instance';

const performanceMetrics = {
  messageCount: 0,
  totalExecutionTime: 0,
  chunkCount: 0,
  toolExecutions: 0,
  bufferFlushes: 0
};

async function performanceExample() {
  // Add performance monitoring hooks
  llm.on('message:before', () => {
    performanceMetrics.messageCount++;
  });

  llm.on('message:after', (data) => {
    console.log(`📊 Message #${performanceMetrics.messageCount} completed`);
  });

  llm.on('chunk:before', () => {
    performanceMetrics.chunkCount++;
  });

  llm.on('tool:after', () => {
    performanceMetrics.toolExecutions++;
  });

  llm.on('buffer:flush', () => {
    performanceMetrics.bufferFlushes++;
  });

  // Run various operations
  const startTime = Date.now();

  await llm.run('Hello, tell me a short story.');

  await llm.runStream('Count from 1 to 10 slowly.');

  await llm.run('What is 2 + 2?');

  const totalTime = Date.now() - startTime;
  performanceMetrics.totalExecutionTime = totalTime;

  // Report metrics
  console.log('\n📈 Performance Metrics:');
  console.log(`   Total time: ${totalTime}ms`);
  console.log(`   Messages: ${performanceMetrics.messageCount}`);
  console.log(`   Chunks: ${performanceMetrics.chunkCount}`);
  console.log(`   Tool executions: ${performanceMetrics.toolExecutions}`);
  console.log(`   Buffer flushes: ${performanceMetrics.bufferFlushes}`);
  console.log(`   Avg time per message: ${(totalTime / performanceMetrics.messageCount).toFixed(2)}ms`);
}

performanceExample().catch(console.error);
```

## Run Examples

```bash
# Make all scripts executable
chmod +x *.ts

# Run individual examples
bun run basic-example.ts
bun run streaming-example.ts
bun run tools-example.ts
bun run context-modification-example.ts
bun run persistence-example.ts
bun run error-handling-example.ts
bun run performance-example.ts
```

## Environment Setup

### bunfig.toml (optional)

```toml
# bunfig.toml
[install.scopes]
"@openai" = "https://registry.npmjs.org/"

[test]
preload = "./test-setup.ts"

[run]
preload = ["./dotenv-config.ts"]
```

### .env

```env
# .env
OPENAI_API_KEY=your_openai_api_key_here
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "allowJs": true,
    "checkJs": false,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "types": ["bun-types"]
  }
}
```

## Next Steps

1. **Explore Advanced Hooks**: Try combining multiple hooks for complex workflows
2. **Custom Persistence**: Implement your own `PersistenceAdapter` for databases
3. **Performance Optimization**: Tune buffer settings for your use case
4. **Error Recovery**: Implement sophisticated error handling and retry logic
5. **Testing**: Write comprehensive tests for your hook implementations

## Troubleshooting

### Common Issues

1. **API Key Not Found**: Ensure `OPENAI_API_KEY` is set in your environment
2. **Module Not Found**: Run `bun install` to install dependencies
3. **TypeScript Errors**: Check your `tsconfig.json` configuration
4. **Hook Not Triggering**: Verify hook event names and function signatures
5. **Performance Issues**: Adjust buffer configuration and hook execution time

### Getting Help

- Check the [API Documentation](./contracts/api.md) for detailed interface information
- Review the [Data Model](./data-model.md) for entity relationships
- Run examples with `DEBUG=* bun run example.ts` for verbose logging