/**
 * Simple configuration for the Code Agent
 */

export interface CodeAgentConfig {
  // Default paths and names
  codePath: string;
  indexName: string;
  
  // AI Model configuration
  modelProvider: 'openai';
  openaiApiKey?: string;
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined && defaultValue === undefined) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value ?? defaultValue!;
}

export const config: CodeAgentConfig = {
  codePath: getEnvVar('CODE_PATH', '.'),
  indexName: getEnvVar('INDEX_NAME', 'code_index'),
  modelProvider: 'openai',
  openaiApiKey: process.env.OPENAI_API_KEY,
};
