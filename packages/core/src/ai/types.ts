/**
 * AI Client Types
 * Unified interface for AI providers (OpenRouter, Ollama, etc.)
 */

/**
 * Message format for AI conversations
 */
export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Stream handler for real-time token output
 */
export interface AIStreamHandler {
  onToken?: (token: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Unified AI client interface
 * All providers must implement this interface
 */
export interface AIClient {
  /**
   * Get the current model being used
   */
  getModel(): string;

  /**
   * Set a different model
   */
  setModel(model: string): void;

  /**
   * Get the provider name
   */
  getProvider(): string;

  /**
   * Check if the client is connected and ready
   */
  isReady(): Promise<boolean>;

  /**
   * Chat completion (non-streaming)
   */
  chat(messages: AIMessage[], systemPrompt?: string): Promise<string>;

  /**
   * Chat completion with streaming
   */
  chatStream(
    messages: AIMessage[],
    systemPrompt?: string,
    handler?: AIStreamHandler
  ): Promise<string>;

  /**
   * Simple completion (single prompt)
   */
  complete(prompt: string, handler?: AIStreamHandler): Promise<string>;
}

/**
 * Model information with capabilities
 */
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  maxOutput: number;
  supportsStreaming: boolean;
  supportsSystemPrompt: boolean;
  costPer1kInput?: number;  // USD per 1k input tokens (for cloud)
  costPer1kOutput?: number; // USD per 1k output tokens (for cloud)
  recommended?: boolean;
  description?: string;
  bestFor?: string[];
}

/**
 * Recommended models for code editing tasks
 */
export const RECOMMENDED_MODELS: Record<string, ModelInfo> = {
  // === OpenRouter (Cloud) ===

  // Best overall for code editing
  'claude-sonnet-4-5': {
    id: 'anthropic/claude-sonnet-4-5-20250514',
    name: 'Claude Sonnet 4.5',
    provider: 'openrouter',
    contextWindow: 200000,
    maxOutput: 128000,
    supportsStreaming: true,
    supportsSystemPrompt: true,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    recommended: true,
    description: 'Best balance of speed, quality, and cost for code editing',
    bestFor: ['code-editing', 'refactoring', 'debugging', 'general'],
  },

  // Premium option for complex tasks
  'claude-opus-4': {
    id: 'anthropic/claude-opus-4-20250514',
    name: 'Claude Opus 4',
    provider: 'openrouter',
    contextWindow: 200000,
    maxOutput: 128000,
    supportsStreaming: true,
    supportsSystemPrompt: true,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
    recommended: true,
    description: 'Most capable model for complex architectural decisions',
    bestFor: ['architecture', 'complex-refactoring', 'code-review'],
  },

  // Fast and cheap for simple tasks
  'gpt-4o-mini': {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openrouter',
    contextWindow: 128000,
    maxOutput: 16384,
    supportsStreaming: true,
    supportsSystemPrompt: true,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
    recommended: true,
    description: 'Fast and cheap for simple edits and quick questions',
    bestFor: ['quick-edits', 'simple-questions', 'formatting'],
  },

  // Good alternative
  'gpt-4o': {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'openrouter',
    contextWindow: 128000,
    maxOutput: 16384,
    supportsStreaming: true,
    supportsSystemPrompt: true,
    costPer1kInput: 0.0025,
    costPer1kOutput: 0.01,
    description: 'Strong general-purpose model',
    bestFor: ['code-editing', 'general'],
  },

  // DeepSeek V3 - excellent for code, very cheap
  'deepseek-coder': {
    id: 'deepseek/deepseek-chat-v3-0324',
    name: 'DeepSeek V3',
    provider: 'openrouter',
    contextWindow: 128000,
    maxOutput: 8192,
    supportsStreaming: true,
    supportsSystemPrompt: true,
    costPer1kInput: 0.0003,
    costPer1kOutput: 0.0009,
    recommended: true,
    description: 'Excellent code model at very low cost',
    bestFor: ['code-editing', 'code-completion', 'debugging'],
  },

  // === Ollama (Local) ===

  // Best local coding model
  'qwen2.5-coder:32b': {
    id: 'qwen2.5-coder:32b',
    name: 'Qwen 2.5 Coder 32B',
    provider: 'ollama',
    contextWindow: 32768,
    maxOutput: 8192,
    supportsStreaming: true,
    supportsSystemPrompt: true,
    recommended: true,
    description: 'Best local model for code editing (requires 24GB+ VRAM)',
    bestFor: ['code-editing', 'refactoring', 'debugging'],
  },

  // Good balance of size and capability
  'qwen2.5-coder:14b': {
    id: 'qwen2.5-coder:14b',
    name: 'Qwen 2.5 Coder 14B',
    provider: 'ollama',
    contextWindow: 32768,
    maxOutput: 8192,
    supportsStreaming: true,
    supportsSystemPrompt: true,
    recommended: true,
    description: 'Great local coding model (requires 12GB+ VRAM)',
    bestFor: ['code-editing', 'code-completion'],
  },

  // Lightweight option
  'qwen2.5-coder:7b': {
    id: 'qwen2.5-coder:7b',
    name: 'Qwen 2.5 Coder 7B',
    provider: 'ollama',
    contextWindow: 32768,
    maxOutput: 8192,
    supportsStreaming: true,
    supportsSystemPrompt: true,
    description: 'Lightweight local coding model (requires 8GB+ VRAM)',
    bestFor: ['quick-edits', 'code-completion'],
  },

  // DeepSeek Coder local
  'deepseek-coder-v2:16b': {
    id: 'deepseek-coder-v2:16b',
    name: 'DeepSeek Coder V2 16B',
    provider: 'ollama',
    contextWindow: 65536,
    maxOutput: 8192,
    supportsStreaming: true,
    supportsSystemPrompt: true,
    recommended: true,
    description: 'Strong local coding model with long context',
    bestFor: ['code-editing', 'large-files'],
  },

  // CodeLlama for those who prefer Meta models
  'codellama:34b': {
    id: 'codellama:34b',
    name: 'CodeLlama 34B',
    provider: 'ollama',
    contextWindow: 16384,
    maxOutput: 4096,
    supportsStreaming: true,
    supportsSystemPrompt: true,
    description: 'Meta\'s coding model (requires 24GB+ VRAM)',
    bestFor: ['code-editing', 'code-completion'],
  },

  // Llama 3.1 for general tasks
  'llama3.1:70b': {
    id: 'llama3.1:70b',
    name: 'Llama 3.1 70B',
    provider: 'ollama',
    contextWindow: 128000,
    maxOutput: 8192,
    supportsStreaming: true,
    supportsSystemPrompt: true,
    description: 'Strong general model with long context (requires 48GB+ VRAM)',
    bestFor: ['architecture', 'complex-refactoring'],
  },

  // Smaller Llama for quick tasks
  'llama3.1:8b': {
    id: 'llama3.1:8b',
    name: 'Llama 3.1 8B',
    provider: 'ollama',
    contextWindow: 128000,
    maxOutput: 8192,
    supportsStreaming: true,
    supportsSystemPrompt: true,
    description: 'Fast local model (requires 8GB+ VRAM)',
    bestFor: ['quick-edits', 'simple-questions'],
  },
};

/**
 * Get recommended models by provider
 */
export function getRecommendedModels(provider?: 'openrouter' | 'ollama'): ModelInfo[] {
  return Object.values(RECOMMENDED_MODELS)
    .filter(m => m.recommended && (!provider || m.provider === provider));
}

/**
 * Get model info by ID or alias
 */
export function getModelInfo(modelId: string): ModelInfo | undefined {
  return RECOMMENDED_MODELS[modelId];
}

/**
 * Get all models for a provider
 */
export function getModelsByProvider(provider: 'openrouter' | 'ollama'): ModelInfo[] {
  return Object.values(RECOMMENDED_MODELS).filter(m => m.provider === provider);
}
