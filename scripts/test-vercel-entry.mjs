process.env.VERCEL = "1";
process.env.NODE_ENV = "production";
process.env.DISABLE_MANUS_RUNTIME = "1";
const module = await import("../dist/index.js");
if (!module.default || typeof module.default !== "function") {
  throw new Error("dist/index.js não exporta o app Express esperado.");
}
console.log("[vercel] bundle dist/index.js exporta o app Express.");
