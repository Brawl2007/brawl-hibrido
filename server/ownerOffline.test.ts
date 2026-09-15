import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Request } from "express";
vi.mock("./db", () => ({ getUserByOpenId: vi.fn(() => { throw new Error("Database unavailable"); }), upsertUser: vi.fn(() => { throw new Error("Database unavailable"); }) }));
vi.mock("./_core/env", () => ({ ENV: { cookieSecret: "test-only-owner-session-signing-key-123456", appId: "brawl-hibrido", oAuthServerUrl: "https://example.invalid" } }));
import { sdk } from "./_core/sdk";
import * as db from "./db";
const original = process.env.OWNER_PASSWORD;
beforeEach(() => { process.env.OWNER_PASSWORD = "test-only-password"; vi.clearAllMocks(); });
afterEach(() => { if (original === undefined) delete process.env.OWNER_PASSWORD; else process.env.OWNER_PASSWORD = original; });
const request = (token: string) => ({ headers: { authorization: `Bearer ${token}` } }) as Request;
const token = () => sdk.signSession({ openId: "owner_local", appId: "brawl-hibrido", name: "Dono" });
it("authenticates a signed owner session without any database operation", async () => {
  expect((await sdk.authenticateRequest(request(await token()))).role).toBe("admin");
  expect(db.getUserByOpenId).not.toHaveBeenCalled();
  expect(db.upsertUser).not.toHaveBeenCalled();
});
it("rejects tampered, expired and missing sessions", async () => {
  const signed = await token();
  const parts = signed.split("."); parts[1] = Buffer.from('{"openId":"owner_local","appId":"brawl-hibrido","name":"Changed"}').toString("base64url");
  const expired = await sdk.signSession({ openId: "owner_local", appId: "brawl-hibrido", name: "Dono" }, { expiresInMs: -1000 });
  for (const invalid of [parts.join("."), expired, ""]) await expect(sdk.authenticateRequest(request(invalid))).rejects.toThrow();
});
it("rejects owner sessions if password is disabled or application differs", async () => {
  const signed = await token();
  delete process.env.OWNER_PASSWORD;
  await expect(sdk.authenticateRequest(request(signed))).rejects.toThrow();
  process.env.OWNER_PASSWORD = "test-only-password";
  const wrongApp = await sdk.signSession({ openId: "owner_local", appId: "other", name: "Dono" });
  await expect(sdk.authenticateRequest(request(wrongApp))).rejects.toThrow();
});
