async function testModels(key: string) {
  const res = await fetch("https://opencode.ai/zen/go/v1/models", {
    headers: {
      authorization: `Bearer ${key}`,
      accept: "application/json",
    },
  });
  console.log("Status:", res.status);
  if (res.ok) {
    const body = await res.json();
    console.log("Models count:", body.data?.length);
    if (body.data) {
      const glmModels = body.data.filter((m: { id: string }) => m.id.includes("glm"));
      console.log("GLM models:", glmModels.map((m: { id: string; endpoint?: string }) => `${m.id} (${m.endpoint ?? "no endpoint"})`));
      // Check the first few
      console.log("First 3 models:");
      for (const m of body.data.slice(0, 3)) {
        console.log(`  ${m.id} endpoint=${m.endpoint}`);
      }
    }
  } else {
    const text = await res.text();
    console.log("Error:", text);
  }
}

await testModels("fake-key-for-testing");
