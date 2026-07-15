/**
 * LLM Adapter Validation Tests — P1-T05
 * Run: npx tsx src/test-adapters.ts
 *
 * Requires env vars:
 *   OPENAI_API_KEY, ANTHROPIC_API_KEY, DIFY_API_KEY
 */

import {
  createAdapter,
  validateAdapters,
  type LLMCallOptions,
} from './index.js';

async function testOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('⏭️  OpenAI: SKIP (no API key)');
    return;
  }

  const adapter = createAdapter('openai', {
    provider: 'openai',
    apiKey,
    defaultModel: 'gpt-4o-mini',
  });

  console.log('🔵 Testing OpenAI...');
  const valid = await adapter.validateConfig();
  console.log(`  Config valid: ${valid.valid}${valid.error ? ` — ${valid.error}` : ''}`);

  if (!valid.valid) return;

  const ping = await adapter.ping();
  console.log(`  API ping: ${ping ? '✅' : '❌'}`);

  // Streaming test
  console.log('  Streaming test:');
  const options: LLMCallOptions = {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Say "hello" in one word' }],
    temperature: 0,
    maxTokens: 20,
  };

  let fullContent = '';
  await adapter.completeStream(options, (chunk) => {
    process.stdout.write(chunk.delta);
    fullContent += chunk.delta;
  });
  console.log('\n');
  console.log(`  Full response: "${fullContent.trim()}"`);
}

async function testAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('⏭️  Anthropic: SKIP (no API key)');
    return;
  }

  const adapter = createAdapter('anthropic', {
    provider: 'anthropic',
    apiKey,
    defaultModel: 'claude-3-5-haiku-latest',
  });

  console.log('🟣 Testing Anthropic...');
  const valid = await adapter.validateConfig();
  console.log(`  Config valid: ${valid.valid}${valid.error ? ` — ${valid.error}` : ''}`);

  if (!valid.valid) return;

  const ping = await adapter.ping();
  console.log(`  API ping: ${ping ? '✅' : '❌'}`);

  console.log('  Streaming test:');
  const options: LLMCallOptions = {
    model: 'claude-3-5-haiku-latest',
    messages: [{ role: 'user', content: 'Say "hello" in one word' }],
    temperature: 0,
    maxTokens: 20,
  };

  let fullContent = '';
  await adapter.completeStream(options, (chunk) => {
    process.stdout.write(chunk.delta);
    fullContent += chunk.delta;
  });
  console.log('\n');
  console.log(`  Full response: "${fullContent.trim()}"`);
}

async function testDify() {
  const apiKey = process.env.DIFY_API_KEY;
  const baseUrl = process.env.DIFY_BASE_URL;
  if (!apiKey || !baseUrl) {
    console.log('⏭️  Dify: SKIP (no API key or base URL)');
    return;
  }

  const adapter = createAdapter('dify', {
    provider: 'dify',
    apiKey,
    baseUrl,
  });

  console.log('🟢 Testing Dify...');
  const valid = await adapter.validateConfig();
  console.log(`  Config valid: ${valid.valid}${valid.error ? ` — ${valid.error}` : ''}`);

  if (!valid.valid) return;

  const ping = await adapter.ping();
  console.log(`  API ping: ${ping ? '✅' : '❌'}`);
}

async function main() {
  console.log('═'.repeat(50));
  console.log('LLM Adapter Validation Tests');
  console.log('═'.repeat(50));
  console.log('');

  await testOpenAI();
  console.log('');
  await testAnthropic();
  console.log('');
  await testDify();

  console.log('');
  console.log('═'.repeat(50));
  console.log('All tests complete');
}

main().catch(console.error);
