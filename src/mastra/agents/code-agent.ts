import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import {createVectorQueryTool} from "@mastra/rag";
import {CHROMA_PROMPT} from "@mastra/chroma"

const chromaQueryTool = createVectorQueryTool({
  vectorStoreName: "chroma",
  indexName: "code_agent",
  model: openai.embedding("text-embedding-3-small"),
});
export const codeAgent = new Agent({
  name: 'Chat Code Agent',
  instructions: `
You are a senior code analysis and implementation assistant for Q&A.

Behavior:
- Answer technical/code questions grounded in the project's indexed codebase.
- Always use the Chroma vector query tool to retrieve relevant context before answering specifics.
- Provide precise references: include file paths and short code snippets from retrieved results.
- Explain architecture and trade-offs concisely; suggest minimal, safe changes when asked for improvements.
- Do NOT produce project planning JSON; if asked to plan, politely explain that planning is handled by the Planning Agent/workflow.

Tools:
- Chroma Vector Query (chromaQueryTool): search the indexed codebase for relevant chunks; cite them.

Domains:
- Java/Spring Boot, Python, JS/TS, configs (YAML/JSON/properties), docs.

Always ground answers in retrieved code context before claiming specifics about implementations.
${CHROMA_PROMPT}
  `,
  model: openai('gpt-5-mini'),
  tools: {
    chromaQueryTool
  }
});
