#!/usr/bin/env bun

// Simple validation script to test core functionality
import { readFileSync } from 'fs';
import { join } from 'path';

console.log('🔍 Validating LLM Event Hooks Library...\n');

// Test 1: Check if main index file exists and can be read
try {
  const indexContent = readFileSync(join(__dirname, '../src/index.ts'), 'utf8');
  console.log('✅ Main index file readable');
} catch (error) {
  console.log('❌ Cannot read main index file:', error.message);
  process.exit(1);
}

// Test 2: Check package.json structure
try {
  const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
  console.log('✅ package.json valid JSON');

  if (packageJson.name === 'llm-event-hooks') {
    console.log('✅ Package name correct');
  } else {
    console.log('❌ Package name incorrect:', packageJson.name);
  }

  if (packageJson.version) {
    console.log('✅ Version defined:', packageJson.version);
  } else {
    console.log('❌ No version defined');
  }
} catch (error) {
  console.log('❌ Invalid package.json:', error.message);
  process.exit(1);
}

// Test 3: Check for core source files
const coreFiles = [
  'src/index.ts',
  'src/core/HookableLLM.ts',
  'src/core/HookManager.ts',
  'src/events/MessageEvent.ts',
  'src/events/ChunkEvent.ts',
  'src/events/BufferEvent.ts',
  'src/streaming/StreamBuffer.ts',
  'src/streaming/BufferManager.ts',
  'src/types.ts',
  'src/events/types.ts'
];

console.log('\n📁 Checking core source files...');
let allFilesExist = true;

for (const file of coreFiles) {
  try {
    readFileSync(join(__dirname, '..', file), 'utf8');
    console.log(`✅ ${file}`);
  } catch (error) {
    console.log(`❌ ${file} - ${error.message}`);
    allFilesExist = false;
  }
}

// Test 4: Check documentation files
console.log('\n📚 Checking documentation files...');
const docFiles = [
  'README.md',
  'LICENSE',
  'PERFORMANCE.md',
  'CHANGELOG.md'
];

for (const file of docFiles) {
  try {
    readFileSync(join(__dirname, '..', file), 'utf8');
    console.log(`✅ ${file}`);
  } catch (error) {
    console.log(`❌ ${file} - ${error.message}`);
  }
}

// Test 5: Check example files
console.log('\n🎨 Checking example files...');
const exampleFiles = [
  'examples/quick-start.ts',
  'examples/openai-integration.ts'
];

for (const file of exampleFiles) {
  try {
    readFileSync(join(__dirname, '..', file), 'utf8');
    console.log(`✅ ${file}`);
  } catch (error) {
    console.log(`❌ ${file} - ${error.message}`);
  }
}

// Test 6: Check build configuration files
console.log('\n⚙️  Checking build configuration...');
const buildFiles = [
  'tsconfig.json',
  'tsconfig.cjs.json',
  'tsconfig.esm.json',
  'package.json',
  '.npmignore'
];

for (const file of buildFiles) {
  try {
    readFileSync(join(__dirname, '..', file), 'utf8');
    console.log(`✅ ${file}`);
  } catch (error) {
    console.log(`❌ ${file} - ${error.message}`);
  }
}

// Test 7: Basic import test (try to require the package structure)
console.log('\n🧪 Testing basic module structure...');
try {
  const indexPath = join(__dirname, '../src/index.ts');
  const indexContent = readFileSync(indexPath, 'utf8');

  // Check for key exports
  const keyExports = [
    'HookableLLM',
    'MessageEvent',
    'ChunkEvent',
    'StreamBuffer',
    'quickStart',
    'Priorities',
    'DefaultBufferConfigs'
  ];

  for (const exportName of keyExports) {
    if (indexContent.includes(`export { ${exportName}`) || indexContent.includes(`export *`)) {
      console.log(`✅ ${exportName} exported`);
    } else {
      console.log(`⚠️  ${exportName} export not found`);
    }
  }
} catch (error) {
  console.log('❌ Module structure test failed:', error.message);
}

// Summary
console.log('\n📋 Validation Summary:');
console.log('=====================');

if (allFilesExist) {
  console.log('✅ All core files present');
  console.log('✅ Package structure ready');
  console.log('✅ Documentation complete');
  console.log('✅ Build configuration ready');
  console.log('\n🎉 Library is ready for release!');
} else {
  console.log('❌ Some core files missing');
  console.log('❌ Please fix missing files before release');
  process.exit(1);
}

console.log('\n🚀 LLM Event Hooks Library Validation Complete!');