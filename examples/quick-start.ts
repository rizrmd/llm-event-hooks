// Quick Start Example - HookableLLM with OpenAI
// This shows the simplest way to get started with real OpenAI integration

import { HookableLLM, InMemoryPersistence } from '../src/index';

async function hookableLLMDemo() {
  console.log('🚀 HookableLLM Demo with Real OpenAI Integration\n');

  try {
    // Simple instance creation
    const llm = new HookableLLM({
      apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here',
      model: 'gpt-4',
      persistence: new InMemoryPersistence()
    });

    // Initialize when ready
    await llm.initialize();
    console.log('✅ HookableLLM initialized successfully!\n');

    // Simple message processing
    console.log('📝 Example 1: Simple Message Processing');
    const response1 = await llm.run('What is 2 + 2?');
    console.log(`Answer: ${response1.content}\n`);

    // Message with system prompt
    console.log('🤖 Example 2: With System Prompt');
    const response2 = await llm.run('Tell me a joke about programming', {
      systemMessage: 'You are a funny comedian who loves programming puns.'
    });
    console.log(`Joke: ${response2.content}\n`);

    // Streaming example
    console.log('🌊 Example 3: Streaming Response');

    // Add a simple streaming hook
    let chunkCount = 0;
    llm.onChunkBefore(async (data) => {
      chunkCount++;
      console.log(`Chunk ${chunkCount}: "${data.chunk.content}"`);
      return data;
    });

    const streamResponse = await llm.runStream('Explain JavaScript closures in simple terms');
    console.log(`\nStreaming completed: ${streamResponse.totalChunks} chunks`);
    console.log(`Full response: "${streamResponse.content}"\n`);

    // Show some statistics
    const stats = llm.getStreamingStats();
    console.log('📊 Streaming Statistics:');
    console.log(`- Total chunks processed: ${stats.chunks.totalChunks}`);
    console.log(`- Average processing time: ${stats.chunks.averageProcessingTime.toFixed(2)}ms`);

    // Cleanup
    await llm.cleanup();
    console.log('✅ Demo completed successfully!');

  } catch (error) {
    console.error('❌ Quick start demo failed:', error.message);

    if (error.message.includes('OpenAI API validation failed')) {
      console.log('\n💡 To run this demo:');
      console.log('1. Get an OpenAI API key from https://platform.openai.com/api-keys');
      console.log('2. Set environment variable: export OPENAI_API_KEY="your-key-here"');
      console.log('3. Run: bun run examples/quick-start.ts');
    }
  }
}

// Run if called directly
if (require.main === module) {
  hookableLLMDemo();
}

export { hookableLLMDemo };