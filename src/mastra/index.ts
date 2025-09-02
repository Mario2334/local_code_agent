import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { codeIngestWorkflow } from './workflows/code-ingest';
import { codeAgent } from './agents/code-agent';

export const mastra = new Mastra({
  workflows: { codeIngestWorkflow },
  agents: { codeAgent },
  storage: new LibSQLStore({
    url: "file:../mastra.db",
  }),
  logger: new PinoLogger({
    name: 'Code Agent',
    level: 'info',
  }),
});
