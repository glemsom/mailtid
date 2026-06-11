async function testModels() {
  const res = await fetch("https://opencode.ai/zen/go/v1/models", {
    headers: {
      accept: "application/json",
    },
  });
  console.log("Status:", res.status);
  if (res.ok) {
    const body = await res.json();
    console.log("All models:");
    for (const m of body.data) {
      console.log(`  id="${m.id}" endpoint=${JSON.stringify(m.endpoint)} display_name=${m.display_name} owned_by=${m.owned_by}`);
    }
  }
}
await testModels();
