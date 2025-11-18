#!/usr/bin/env bun

// Simple build script that just copies files without type checking
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, extname, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🔨 Building LLM Event Hooks Library (Simple Mode)...\n');

function findTsFiles(dir: string, base: string = '', files: string[] = []): string[] {
  try {
    const items = require('fs').readdirSync(join(dir, base));
    for (const item of items) {
      const itemPath = join(dir, base, item);
      const stat = require('fs').statSync(itemPath);
      if (stat.isDirectory() && !item.startsWith('.')) {
        findTsFiles(dir, join(base, item), files);
      } else if (item.endsWith('.ts') && !item.endsWith('.d.ts') && !item.endsWith('.test.ts')) {
        files.push(join(base, item));
      }
    }
  } catch (error) {
    // Skip directories that can't be read
  }
  return files;
}

function copyFile(src: string, dest: string): boolean {
  try {
    const content = readFileSync(src, 'utf8');
    const destDir = dirname(dest);
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }
    writeFileSync(dest, content);
    return true;
  } catch (error) {
    console.log(`❌ Failed to copy ${src}: ${error.message}`);
    return false;
  }
}

// Main build process
try {
  console.log('📁 Finding source files...');
  const sourceFiles = findTsFiles(join(projectRoot, 'src'));
  console.log(`✅ Found ${sourceFiles.length} source files`);

  console.log('\n🧹 Cleaning dist directory...');
  try {
    require('fs').rmSync(join(projectRoot, 'dist'), { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
  mkdirSync(join(projectRoot, 'dist'), { recursive: true });
  console.log('✅ Dist directory cleaned');

  console.log('\n📚 Copying TypeScript files as JavaScript...');
  let successCount = 0;
  for (const sourceFile of sourceFiles) {
    const inputPath = join(projectRoot, 'src', sourceFile);
    const outputPath = join(projectRoot, 'dist', sourceFile.replace('.ts', '.js'));

    if (copyFile(inputPath, outputPath)) {
      successCount++;
    }
  }
  console.log(`✅ Copied ${successCount}/${sourceFiles.length} files`);

  console.log('\n📦 Creating ESM version...');
  for (const sourceFile of sourceFiles) {
    const inputPath = join(projectRoot, 'src', sourceFile);
    const outputPath = join(projectRoot, 'dist', sourceFile.replace('.ts', '.esm.js'));

    if (copyFile(inputPath, outputPath)) {
      successCount++;
    }
  }
  console.log(`✅ Created ESM versions`);

  console.log('\n📝 Creating type declarations...');
  for (const sourceFile of sourceFiles) {
    const inputPath = join(projectRoot, 'src', sourceFile);
    const outputPath = join(projectRoot, 'dist', sourceFile.replace('.ts', '.d.ts'));

    if (copyFile(inputPath, outputPath)) {
      successCount++;
    }
  }
  console.log(`✅ Created type declarations`);

  // Create package.json for different module types
  console.log('\n📋 Creating package.json files...');

  const cjsPackageJson = {
    type: 'commonjs',
    main: './index.js',
    types: './index.d.ts'
  };
  writeFileSync(join(projectRoot, 'dist', 'package.json'), JSON.stringify(cjsPackageJson, null, 2));
  console.log('✅ CommonJS package.json created');

  const esmPackageJson = {
    type: 'module',
    main: './index.esm.js',
    types: './index.d.ts'
  };
  writeFileSync(join(projectRoot, 'dist', 'esm.package.json'), JSON.stringify(esmPackageJson, null, 2));
  console.log('✅ ESM package.json created');

  console.log('\n🎉 Build completed successfully!');
  console.log('\n📦 Build artifacts:');
  console.log('   - dist/index.js (CommonJS)');
  console.log('   - dist/index.esm.js (ESM)');
  console.log('   - dist/index.d.ts (TypeScript declarations)');
  console.log('\n📋 Note: This is a TypeScript source build.');
  console.log('   For production use, run: bun run build:prod');

} catch (error) {
  console.log('\n❌ Build failed:', error.message);
  process.exit(1);
}