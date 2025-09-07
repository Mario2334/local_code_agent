import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { codeIngestWorkflow } from './workflows/code-ingest';
import { codeAgent } from './agents/code-agent';
import { planningWorkflow } from './workflows/planning';
import { runUserTaskWorkflow } from './workflows/run-user-task';
import { ChromaVector } from '@mastra/chroma';

export const mastra = new Mastra({
  workflows: { codeIngestWorkflow, planningWorkflow, runUserTaskWorkflow },
  agents: { codeAgent },
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
});

export { runUserTask } from './agents/runner';
export { runUserTaskWorkflow } from './workflows/run-user-task';
