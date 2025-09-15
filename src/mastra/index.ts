import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { codeIngestWorkflow } from './workflows/code-ingest';
import { codeAgent } from './agents/code-agent';
import { planningWorkflow } from './workflows/planning';
import { planningAgent } from './agents/planning-agent';
import { ChromaVector } from '@mastra/chroma';

export const mastra = new Mastra({
  workflows: { codeIngestWorkflow, planningWorkflow },
  agents: { codeAgent, planningAgent },
  vectors: {
    chroma: new ChromaVector(),
  },
  storage: new LibSQLStore({
    url: "file:../mastra.db",
  }),
  logger: new PinoLogger({
    name: 'Code Agent',
    level: 'info',
  }),
  server: {
    build: {
      swaggerUI: true
    }
  }
});
