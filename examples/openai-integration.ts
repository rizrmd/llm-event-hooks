// Production-ready OpenAI integration example
// This demonstrates how to use the HookableLLM library with real OpenAI API calls

import { HookableLLM, DefaultBufferConfigs, Events, Priorities } from '../src/index';

// Initialize the LLM with your OpenAI API key
const llm = new HookableLLM({
  apiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key-here',
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 1000,
  enableLogging: true,
  hookTimeout: 30000,
  maxConcurrentHooks: 10
});

async function demonstrateMessageHooks() {
  console.log('\n🔗 === Message Hooks Demo ===');

  // Register a message preprocessing hook
  llm.onMessageBefore(
    async (data, context) => {
      console.log(`📤 Outgoing message (${data.message.role}): ${data.message.content.substring(0, 50)}...`);

      // Add metadata to the message
      data.message.metadata.processedBy = 'message-before-hook';
      data.message.metadata.processedAt = new Date().toISOString();

      return data;
    },
    Priorities.HIGH
  );

  // Register a message postprocessing hook
  llm.onMessageAfter(
    async (data, context) => {
      console.log(`📥 Incoming response (${data.message.role}): ${data.message.content.substring(0, 50)}...`);

      // Add response metadata
      data.message.metadata.processedBy = 'message-after-hook';

      return data;
    },
    Priorities.LOW
  );

  // Register an error handling hook
  llm.on('hook:error', (error) => {
    console.error(`❌ Hook error in ${error.event}: ${error.error.message}`);
  });

  try {
    const response = await llm.run('What is the capital of France? Answer in one word.', {
      systemMessage: 'You are a helpful assistant. Be concise.',
      metadata: { demo: 'message-hooks' }
    });

    console.log(`✅ Response: ${response.content}`);
    console.log(`📊 Usage:`, response.usage);
    console.log(`💰 Tokens: ${response.usage?.totalTokens || 'N/A'}`);

  } catch (error) {
    console.error('❌ Message processing failed:', error);
  }
}

async function demonstrateStreamingHooks() {
  console.log('\n🌊 === Streaming Hooks Demo ===');

  let totalChunks = 0;
  let totalContent = '';

  // Register chunk processing hooks
  llm.onChunkBefore(
    async (data, context) => {
      totalChunks++;
      console.log(`🔹 Chunk ${totalChunks}: "${data.chunk.content}"`);
      return data;
    },
    Priorities.CRITICAL // Process chunks as quickly as possible
  );

  llm.onChunkAfter(
    async (data, context) => {
      totalContent += data.chunk.content;

      // You could transform content here
      if (data.chunk.content.includes('Paris')) {
        data.chunk.content = data.chunk.content.replace('Paris', '🇫🇷 Paris');
      }

      return data;
    },
    Priorities.NORMAL
  );

  // Register buffer flush hook
  llm.onBufferFlush(
    async (data, context) => {
      console.log(`🔄 Buffer flushed: ${data.chunks.length} chunks, reason: ${data.flushReason}`);
      console.log(`📝 Accumulated content: "${data.chunks.map(c => c.content).join('')}"`);
      return data;
    },
    Priorities.LOW
  );

  try {
    const streamResponse = await llm.runStream('Tell me about Paris, France. What makes it special?', {
      bufferConfig: DefaultBufferConfigs.SMALL_FAST, // Fast, small buffers for demo
      systemMessage: 'You are a knowledgeable tour guide. Be enthusiastic!',
      metadata: { demo: 'streaming-hooks' }
    });

    console.log(`\n✅ Streaming completed!`);
    console.log(`📊 Total chunks: ${streamResponse.totalChunks}`);
    console.log(`📝 Total content: "${streamResponse.content}"`);
    console.log(`📏 Total characters: ${streamResponse.totalCharacters}`);

  } catch (error) {
    console.error('❌ Streaming failed:', error);
  }
}

async function demonstrateAdvancedHooks() {
  console.log('\n🚀 === Advanced Hooks Demo ===');

  // Content transformation hook
  llm.onChunkBefore(async (data, context) => {
    // Add timestamp to each chunk
    data.chunk.metadata.timestamp = new Date().toISOString();

    // Example: Filter out any potential profanity (placeholder implementation)
    if (data.chunk.content.toLowerCase().includes('badword')) {
      data.chunk.content = data.chunk.content.replace(/badword/gi, '[FILTERED]');
    }

    return data;
  }, Priorities.HIGH);

  // Analytics hook (runs after all processing)
  llm.onChunkAfter(async (data, context) => {
    // Track chunk processing metrics
    const processingTime = Date.now() - new Date(data.chunk.metadata.timestamp).getTime();
    console.log(`⚡ Chunk processed in ${processingTime}ms`);

    // This could be sent to your analytics service
    if (processingTime > 100) {
      console.warn(`🐌 Slow chunk processing detected: ${processingTime}ms`);
    }

    return data;
  }, Priorities.LOW);

  // Buffer efficiency monitoring
  llm.onBufferFlush(async (data, context) => {
    const avgChunkSize = data.chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / data.chunks.length;
    console.log(`📊 Buffer flush analysis:`);
    console.log(`   - Chunks: ${data.chunks.length}`);
    console.log(`   - Avg chunk size: ${avgChunkSize.toFixed(1)} chars`);
    console.log(`   - Flush reason: ${data.flushReason}`);
    console.log(`   - Total size: ${data.totalSize} chars`);

    return data;
  }, Priorities.LOW);

  try {
    const response = await llm.runStream('Write a short poem about technology and progress.', {
      bufferConfig: DefaultBufferConfigs.MEDIUM_BALANCED,
      systemMessage: 'You are a creative poet. Write something inspiring.',
      metadata: { demo: 'advanced-hooks' }
    });

    console.log(`\n🎨 Poem completed: "${response.content}"`);

  } catch (error) {
    console.error('❌ Advanced streaming failed:', error);
  }
}

async function demonstratePerformanceMonitoring() {
  console.log('\n📊 === Performance Monitoring Demo ===');

  // Performance tracking hooks
  const startTime = Date.now();

  llm.onChunkBefore(async (data, context) => {
    data.chunk.metadata.receivedAt = Date.now();
    return data;
  });

  llm.onChunkAfter(async (data, context) => {
    const processingTime = Date.now() - data.chunk.metadata.receivedAt;
    if (processingTime > 10) {
      console.warn(`⚠️  Slow chunk processing: ${processingTime}ms`);
    }
    return data;
  });

  try {
    const response = await llm.runStream('Explain quantum computing in simple terms.', {
      bufferConfig: DefaultBufferConfigs.LARGE_SLOW,
      metadata: { demo: 'performance-monitoring' }
    });

    const totalTime = Date.now() - startTime;
    const avgTimePerChunk = totalTime / response.totalChunks;

    console.log(`📈 Performance Metrics:`);
    console.log(`   - Total time: ${totalTime}ms`);
    console.log(`   - Chunks processed: ${response.totalChunks}`);
    console.log(`   - Avg time per chunk: ${avgTimePerChunk.toFixed(2)}ms`);
    console.log(`   - Chunks per second: ${(1000 / avgTimePerChunk).toFixed(1)}`);

    // Get comprehensive stats
    const stats = llm.getStreamingStats();
    console.log(`\n🔧 System Statistics:`);
    console.log(`   - Buffer events: ${JSON.stringify(stats.bufferEvents, null, 2)}`);
    console.log(`   - Chunk processing: ${JSON.stringify(stats.chunks, null, 2)}`);

  } catch (error) {
    console.error('❌ Performance monitoring failed:', error);
  }
}

async function main() {
  console.log('🎯 Starting OpenAI Integration Demo...');
  console.log('This demo shows real OpenAI API integration with comprehensive hooking.\n');

  try {
    // Initialize the LLM
    console.log('🔧 Initializing HookableLLM with OpenAI...');
    await llm.initialize();
    console.log('✅ HookableLLM initialized successfully!\n');

    // Run demonstrations
    await demonstrateMessageHooks();
    await demonstrateStreamingHooks();
    await demonstrateAdvancedHooks();
    await demonstratePerformanceMonitoring();

    // Show final statistics
    const finalStats = await llm.getStats();
    console.log('\n📋 Final Statistics:');
    console.log(JSON.stringify(finalStats, null, 2));

  } catch (error) {
    console.error('❌ Demo failed:', error);

    if (error.message.includes('OpenAI API validation failed')) {
      console.log('\n💡 Tip: Make sure to set your OPENAI_API_KEY environment variable');
      console.log('   export OPENAI_API_KEY="your-api-key-here"');
    }
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await llm.cleanup();
    console.log('✅ Demo completed!');
  }
}

// Run the demo
if (require.main === module) {
  main().catch(console.error);
}

export {
  demonstrateMessageHooks,
  demonstrateStreamingHooks,
  demonstrateAdvancedHooks,
  demonstratePerformanceMonitoring
};