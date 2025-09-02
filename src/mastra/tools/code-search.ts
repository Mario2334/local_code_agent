import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';

interface IndexedCodeFile {
  path: string;
  name: string;
  language: string;
  framework: string;
  content: string;
}

interface SearchResult {
  file: string;
  language: string;
  snippet: string;
  matches: number;
}

/**
 * Unified code search tool that searches through indexed code files
 * Supports both exact text matching and basic pattern matching
 */
export const codeSearchTool = createTool({
  id: 'search-code',
  description: 'Search through indexed code files for text patterns and return relevant results',
  inputSchema: z.object({
    query: z.string().describe('Search query (text or simple pattern)'),
    maxResults: z.number().default(10).optional(),
    languages: z.array(z.string()).optional().describe('Filter by programming languages (e.g., ["java", "python"])'),
    caseSensitive: z.boolean().default(false).optional(),
    indexFile: z.string().default(path.resolve('.mastra/output/code_index.json')).optional(),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        file: z.string(),
        language: z.string(), 
        snippet: z.string(),
        matches: z.number(),
      })
    ),
    totalMatches: z.number(),
    searchQuery: z.string(),
  }),
  execute: async ({ context }) => {
    try {
      // Read the code index
      const indexData: IndexedCodeFile[] = JSON.parse(
        await fs.readFile(context.indexFile!, 'utf-8')
      );

      const query = context.caseSensitive ? context.query : context.query.toLowerCase();
      const results: SearchResult[] = [];

      for (const file of indexData) {
        // Filter by language if specified
        if (context.languages && !context.languages.includes(file.language)) {
          continue;
        }

        const content = context.caseSensitive ? file.content : file.content.toLowerCase();
        
        // Count matches
        const matches = (content.match(new RegExp(escapeRegex(query), 'g')) || []).length;
        
        if (matches > 0) {
          // Extract snippet around first match
          const firstMatchIndex = content.indexOf(query);
          const snippetStart = Math.max(0, firstMatchIndex - 150);
          const snippetEnd = Math.min(content.length, firstMatchIndex + query.length + 150);
          
          let snippet = file.content.slice(snippetStart, snippetEnd);
          
          // Add ellipsis if truncated
          if (snippetStart > 0) snippet = '...' + snippet;
          if (snippetEnd < content.length) snippet = snippet + '...';
          
          // Clean up snippet (remove excessive whitespace/newlines)
          snippet = snippet.replace(/\\s+/g, ' ').trim();

          results.push({
            file: path.basename(file.path),
            language: file.language,
            snippet,
            matches,
          });
        }
      }

      // Sort by number of matches (descending) then by filename
      results.sort((a, b) => {
        if (b.matches !== a.matches) return b.matches - a.matches;
        return a.file.localeCompare(b.file);
      });

      // Limit results
      const limitedResults = results.slice(0, context.maxResults || 10);
      const totalMatches = results.reduce((sum, r) => sum + r.matches, 0);

      return {
        results: limitedResults,
        totalMatches,
        searchQuery: context.query,
      };

    } catch (error) {
      console.error('Error searching code:', error);
      
      // Return empty results with error info
      return {
        results: [],
        totalMatches: 0,
        searchQuery: context.query,
      };
    }
  },
});

/**
 * Escape special regex characters in search query
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
}
