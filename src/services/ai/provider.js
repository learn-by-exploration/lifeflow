/**
 * Provider-Agnostic AI Abstraction Layer
 * Supports: OpenAI, Anthropic, Ollama, and any OpenAI-compatible endpoint.
 */
'use strict';

const CAPABILITIES = {
  openai:    { functionCalling: true,  streaming: true,  embeddings: true,  maxTokens: 128000 },
  anthropic: { functionCalling: true,  streaming: true,  embeddings: false, maxTokens: 200000 },
  ollama:    { functionCalling: false, streaming: true,  embeddings: true,  maxTokens: 8192  },
  custom:    { functionCalling: false, streaming: false, embeddings: false, maxTokens: 4096  },
};

const DEFAULT_URLS = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  ollama: 'http://localhost:11434',
  custom: '',
};

const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
  ollama: 'llama3:8b',
  custom: '',
};

/**
 * Build provider configuration from user settings.
 */
function buildConfig(settings) {
  const provider = settings.ai_provider || 'openai';
  return {
    provider,
    baseUrl: (settings.ai_base_url || DEFAULT_URLS[provider] || '').replace(/\/+$/, ''),
    model: settings.ai_model || DEFAULT_MODELS[provider] || '',
    apiKey: settings.ai_api_key || '',
    capabilities: CAPABILITIES[provider] || CAPABILITIES.custom,
  };
}

/**
 * Make a chat completion request to the configured provider.
 * @param {object} config - from buildConfig()
 * @param {Array} messages - [{role, content}]
 * @param {object} [opts] - {temperature, maxTokens, jsonMode, functions}
 * @returns {Promise<{content: string, usage: {prompt: number, completion: number}}>}
 */
async function chatCompletion(config, messages, opts = {}) {
  if (!config.apiKey && config.provider !== 'ollama') {
    throw new Error('No AI API key configured');
  }
  if (!config.baseUrl) throw new Error('AI base URL not configured');
  if (!config.model) throw new Error('AI model not configured');

  if (config.provider === 'anthropic') {
    return _anthropicCompletion(config, messages, opts);
  }
  if (config.provider === 'ollama') {
    return _ollamaCompletion(config, messages, opts);
  }
  // OpenAI and custom (OpenAI-compatible)
  return _openaiCompletion(config, messages, opts);
}

/* ─── OpenAI / OpenAI-compatible ─── */
async function _openaiCompletion(config, messages, opts) {
  const body = {
    model: config.model,
    messages,
    temperature: opts.temperature ?? 0.7,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.jsonMode) body.response_format = { type: 'json_object' };
  if (opts.functions && config.capabilities.functionCalling) {
    body.tools = opts.functions.map(f => ({ type: 'function', function: f }));
    body.tool_choice = opts.toolChoice || 'auto';
  }

  const resp = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeout || 60000),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => resp.statusText);
    throw new Error(`AI provider error (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error('Empty response from AI provider');

  // Handle function call responses
  if (choice.message?.tool_calls?.length) {
    const tc = choice.message.tool_calls[0];
    return {
      content: tc.function?.arguments || '{}',
      functionCall: { name: tc.function?.name, arguments: tc.function?.arguments },
      usage: { prompt: data.usage?.prompt_tokens || 0, completion: data.usage?.completion_tokens || 0 },
    };
  }

  return {
    content: choice.message?.content || '',
    usage: { prompt: data.usage?.prompt_tokens || 0, completion: data.usage?.completion_tokens || 0 },
  };
}

/* ─── Anthropic ─── */
async function _anthropicCompletion(config, messages, opts) {
  // Convert OpenAI format to Anthropic format
  let system = '';
  const formatted = [];
  for (const m of messages) {
    if (m.role === 'system') { system += (system ? '\n' : '') + m.content; continue; }
    formatted.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
  }

  const body = {
    model: config.model,
    max_tokens: opts.maxTokens || 4096,
    messages: formatted,
    temperature: opts.temperature ?? 0.7,
  };
  if (system) body.system = system;

  // Anthropic function calling via tools
  if (opts.functions && config.capabilities.functionCalling) {
    body.tools = opts.functions.map(f => ({
      name: f.name,
      description: f.description,
      input_schema: f.parameters,
    }));
  }

  const resp = await fetch(`${config.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeout || 60000),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => resp.statusText);
    throw new Error(`AI provider error (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  const textBlock = data.content?.find(b => b.type === 'text');
  const toolBlock = data.content?.find(b => b.type === 'tool_use');

  if (toolBlock) {
    return {
      content: JSON.stringify(toolBlock.input),
      functionCall: { name: toolBlock.name, arguments: JSON.stringify(toolBlock.input) },
      usage: { prompt: data.usage?.input_tokens || 0, completion: data.usage?.output_tokens || 0 },
    };
  }

  return {
    content: textBlock?.text || '',
    usage: { prompt: data.usage?.input_tokens || 0, completion: data.usage?.output_tokens || 0 },
  };
}

/* ─── Ollama ─── */
async function _ollamaCompletion(config, messages, opts) {
  const body = {
    model: config.model,
    messages,
    stream: false,
    options: { temperature: opts.temperature ?? 0.7 },
  };
  if (opts.jsonMode) body.format = 'json';

  const resp = await fetch(`${config.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeout || 120000),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => resp.statusText);
    throw new Error(`AI provider error (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  return {
    content: data.message?.content || '',
    usage: { prompt: data.prompt_eval_count || 0, completion: data.eval_count || 0 },
  };
}

/**
 * Generate embeddings (OpenAI or Ollama only).
 */
async function generateEmbedding(config, text) {
  if (!config.capabilities.embeddings) {
    throw new Error(`Provider ${config.provider} does not support embeddings`);
  }
  if (config.provider === 'ollama') return _ollamaEmbedding(config, text);
  return _openaiEmbedding(config, text);
}

async function _openaiEmbedding(config, text) {
  const resp = await fetch(`${config.baseUrl}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`Embedding error (${resp.status})`);
  const data = await resp.json();
  return data.data?.[0]?.embedding || [];
}

async function _ollamaEmbedding(config, text) {
  const resp = await fetch(`${config.baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.model, prompt: text }),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`Embedding error (${resp.status})`);
  const data = await resp.json();
  return data.embedding || [];
}

/**
 * Test provider connectivity.
 */
async function testConnection(config) {
  try {
    const start = Date.now();
    const result = await chatCompletion(config, [
      { role: 'user', content: 'Respond with exactly: OK' }
    ], { maxTokens: 10, temperature: 0 });
    return { ok: true, latency: Date.now() - start, model: config.model, provider: config.provider };
  } catch (err) {
    return { ok: false, error: err.message, provider: config.provider };
  }
}

module.exports = {
  CAPABILITIES,
  DEFAULT_URLS,
  DEFAULT_MODELS,
  buildConfig,
  chatCompletion,
  generateEmbedding,
  testConnection,
};
