# Code Agent

A TypeScript-based code analysis agent built with [Mastra AI](https://mastra.ai). It can collect, index, and search through your codebase using AI.

## 🚀 Features

- **Code Collection**: Scan and index files from any project
- **Smart Search**: Find code using text search with context
- **AI Agent**: Ask questions about your codebase
- **Multi-language**: Java, Python, JavaScript, TypeScript, and more

## 📋 Requirements

- Node.js >= 20.9.0
- OpenAI API key (for AI features)

## 🛠️ Installation

```bash
# Clone and install
git clone <repo-url>
cd local_code_agent
npm install

# Set up environment
cp .env.example .env
# Add your OPENAI_API_KEY to .env
```

## 🚀 Usage

### Quick Test
```bash
# Test with the included Python files
npm test

# Test with a specific project
npm run test-path ./path/to/your/project
```

### Using the Mastra Agent
```bash
# Start the Mastra development server
npm run dev
# Then visit http://localhost:3000 to interact with the agent
```

### Programmatic Usage
```typescript
import { mastra } from './src/mastra/index.js';

// Collect code files
const workflow = mastra.getWorkflow('codeIngestWorkflow');
const result = await workflow.execute({
  root: './my-project',
  framework: 'auto'
});

// Ask the agent questions  
const agent = mastra.getAgent('codeAgent');
const response = await agent.stream([{
  role: 'user', 
  content: 'What functions are defined in this codebase?'
}]);
```

## 🏗️ Architecture

### Components
- **`collectCodeTool`**: Scans filesystem and indexes code files
- **`codeSearchTool`**: Searches through indexed code with filters
- **`codeAgent`**: AI agent that can use the tools to answer questions
- **`codeIngestWorkflow`**: Automated workflow for code collection

### Supported File Types
- Source code: `.java`, `.py`, `.js`, `.ts`  
- Config files: `.yml`, `.yaml`, `.json`, `.properties`
- Build files: `pom.xml`, `build.gradle`, `package.json`
- Documentation: `.md`, `README` files

## 📁 Project Structure

```
src/
├── mastra/
│   ├── index.ts              # Main Mastra configuration
│   ├── config.ts             # Environment configuration  
│   ├── agents/
│   │   └── code-agent.ts     # AI code analysis agent
│   ├── tools/
│   │   ├── code-collector.ts # File collection tool
│   │   └── code-search.ts    # Code search tool
│   └── workflows/
│       └── code-ingest.ts    # Code collection workflow
└── test.ts                   # Simple test runner
```

## ⚙️ Configuration

Environment variables in `.env`:

```bash
# Required for AI features
OPENAI_API_KEY=your_openai_api_key_here

# Optional settings
CODE_PATH=.                   # Default path to scan
INDEX_NAME=code_index         # Name for the index files  
```

## 🧪 Testing

The test will:
1. Scan the specified directory for code files
2. Index them into a searchable format
3. Perform a sample search to verify everything works

```bash
# Test with included Python backup files
npm test

# Test with your own project
npm run test-path /path/to/your/code
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch  
3. Make your changes
4. Test with `npm test`
5. Submit a pull request

## 📝 License

MIT License

---

**Note**: This project was converted from a Python/Agno implementation. The original Python code is preserved in the `backup/` directory.
