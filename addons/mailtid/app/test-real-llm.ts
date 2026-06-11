import { RealLLMClient } from "./src/llm/real.js";

const client = new RealLLMClient(() => "fake-key-for-testing");

// Simulate a real LLM call. This will fail because the API key is fake.
try {
  const result = await client.chat("test prompt", { model: "opencode-go/glm-5.1" });
  console.log("Got result:", result.slice(0, 200));
} catch (err) {
  console.log("Error type:", err?.constructor?.name);
  console.log("Error message:", (err as Error).message);
  console.log("Error status:", (err as { status?: number }).status);
  console.log("Full error:", err);
}
