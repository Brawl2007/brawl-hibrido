import { createServer } from "node:http";

process.env.VERCEL = "1";
process.env.NODE_ENV = "production";
process.env.DISABLE_MANUS_RUNTIME = "1";

const { default: app } = await import("../server/_core/index.ts");
const server = createServer(app);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

async function check(path, expected) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  const text = await response.text();
  if (response.status !== expected) {
    throw new Error(`${path}: esperado HTTP ${expected}, recebido ${response.status}: ${text.slice(0, 200)}`);
  }
  console.log(`${path}: HTTP ${response.status}`);
}

try {
  await check("/", 200);
  await check("/api/realtime/status", 200);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
