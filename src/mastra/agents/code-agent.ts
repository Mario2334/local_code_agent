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
  // model: anthropic("claude-3-5-haiku-latest"),
  // model: deepseek("deepseek-chat"),
  model: openrouter.chat("qwen/qwen3-next-80b-a3b-thinking"),
  tools: {
    chromaQueryTool
  }
});
