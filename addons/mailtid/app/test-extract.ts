import { extractJsonObject } from "./src/llm/response.js";

// Common LLM deviations to test
const inputs = [
  // JSON-encoded string
  '"{\\"title\\":\\"Foo\\",\\"description\\":\\"Bar\\"}"',
  // Just a number
  "42",
  // null
  "null",
  // Boolean
  "true",
  // Markdown heading + JSON
  "## Recipe\n\n```json\n{\"a\":1}\n```",
  // No JSON but mentions a recipe
  "I cannot provide a recipe at this time.",
  // Truncated JSON
  '{"title":"Foo","description":"Bar","ingredients":[',
  // Empty JSON object
  "{}",
  // JSON with extra fields
  '{"title":"Foo","description":"Bar","extra":"field","ingredients":[],"steps":[],"time_minutes":30}',
];

for (const input of inputs) {
  console.log(`\n--- input: ${JSON.stringify(input).slice(0, 80)} ---`);
  try {
    const result = extractJsonObject(input);
    console.log(`  parsed: ${JSON.stringify(result).slice(0, 100)}`);
  } catch (err) {
    console.log(`  THREW: ${(err as Error).message}`);
  }
}
