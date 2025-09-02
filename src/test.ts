#!/usr/bin/env node

/**
 * Simple test for the Code Agent
 * Tests code collection and search functionality
 */

import path from 'path';
import { fileURLToPath } from 'url';

async function runTest() {
  console.log('🚀 Code Agent Test');
  console.log('==================');

  try {
    // Import tools
    const { collectCodeTool } = await import('./mastra/tools/code-collector.js');
    const { codeSearchTool } = await import('./mastra/tools/code-search.js');
    
    // Test code collection
    const testPath = process.argv[2] || './backup';
    const absolutePath = path.resolve(testPath);
    
    console.log(`📂 Collecting code from: ${absolutePath}`);
    
    const collectionResult = await collectCodeTool.execute({
      context: {
        root: absolutePath,
        framework: 'auto',
      }
    } as any);
    
    console.log(`✅ Found ${collectionResult.indexedCount} code files`);
    
    // Test search
    if (collectionResult.indexedCount > 0) {
      console.log('\\n🔍 Testing search...');
      
      const searchResult = await codeSearchTool.execute({
        context: {
          query: 'def',
          maxResults: 3,
          indexFile: collectionResult.outFile,
        }
      } as any);
      
      console.log(`📋 Found ${searchResult.totalMatches} total matches in ${searchResult.results.length} files:`);
      
      searchResult.results.forEach((result, i) => {
        console.log(`\\n${i + 1}. ${result.file} (${result.language}) - ${result.matches} matches`);
        console.log(`   ${result.snippet.substring(0, 100)}...`);
      });
    }
    
    console.log('\\n✅ Test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run test if called directly
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  runTest().catch(console.error);
}

export { runTest };
