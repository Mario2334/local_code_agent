import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { anthropic } from "@ai-sdk/anthropic";
import {createVectorQueryTool} from "@mastra/rag";
import {CHROMA_PROMPT} from "@mastra/chroma"
import {deepseek} from "@ai-sdk/deepseek";
import {createOpenRouter} from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: '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',
});

const chromaQueryTool = createVectorQueryTool({
  vectorStoreName: "chroma",
  indexName: "code_agent",
  model: openai.embedding("text-embedding-3-small"),
});
export const codeAgent = new Agent({
  id: 'code-agent-stream',
  name: 'Chat Code Agent',
  instructions: `
You are a senior code analysis and implementation assistant for Q&A.

Behavior:
- Answer technical/code questions grounded in the project's indexed codebase.
- Always use the Chroma vector query tool to code saved in that db
- Provide precise references: include file paths and short code snippets from retrieved results.
- Explain architecture and trade-offs concisely; suggest minimal, safe changes when asked for improvements.
- Return answers in Markdown format.

Tools:
- Chroma Vector Query (chromaQueryTool): search the indexed codebase for relevant chunks; cite them.

Domains:
- Java/Spring Boot, Python, JS/TS, configs (YAML/JSON/properties), docs.

Always ground answers in retrieved code context before claiming specifics about implementations.
${CHROMA_PROMPT}
  `,
  // model: openai('gpt-5'),
  // model: anthropic("claude-sonnet-4-20250514"),
  // model: deepseek("deepseek-chat"),
  // model: openrouter.chat("qwen/qwen3-next-80b-a3b-thinking"),
  // model: openrouter.chat("qwen/qwen3-coder-flash"),
  model: openrouter.chat("openrouter/sonoma-dusk-alpha"),
  tools: {
    chromaQueryTool
  }
});
