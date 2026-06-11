import { RealLLMClient } from "./src/llm/real.js";

async function testModel(modelName: string, key: string) {
  const client = new RealLLMClient(() => key);
  try {
    const result = await client.chat("Reply with just the word 'ok'", { model: modelName });
    console.log(`Model ${modelName} with key ${key.slice(0,8)}...: OK`, result.slice(0, 50));
  } catch (err) {
    const e = err as { status?: number; error?: { type?: string; message?: string } };
    console.log(`Model ${modelName} with key ${key.slice(0,8)}...:`);
    console.log(`  status=${e?.status} type=${e?.error?.type} message=${e?.error?.message ?? (err as Error).message}`);
  }
}

await testModel("opencode-go/glm-5.1", "fake-key-for-testing");
await testModel("opencode-go/some-invalid-model", "fake-key-for-testing");
