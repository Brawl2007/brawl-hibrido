import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getConfigByTaskUid: vi.fn(),
  getCounterConfigByTaskUid: vi.fn(),
  syncRankedData: vi.fn(),
  syncCounterData: vi.fn(),
}));

vi.mock("./_core/sdk", () => ({
  sdk: { authenticateRequest: mocks.authenticateRequest },
}));
vi.mock("./db", () => ({
  getRankedSyncConfigByTaskUid: mocks.getConfigByTaskUid,
  getCounterSyncConfigByTaskUid: mocks.getCounterConfigByTaskUid,
}));
vi.mock("./rankedSync", () => ({
  syncRankedData: mocks.syncRankedData,
}));
vi.mock("./counterSync", () => ({
  syncCounterData: mocks.syncCounterData,
}));

import { handleCounterSyncScheduled, handleRankedSyncScheduled } from "./scheduled";

function createResponse() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response & { body?: unknown };
  response.status.mockReturnValue(response);
  response.json.mockImplementation((body: unknown) => {
    response.body = body;
    return response;
  });
  return response;
}

describe("handleRankedSyncScheduled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a request without a valid cron session", async () => {
    mocks.authenticateRequest.mockRejectedValueOnce(new Error("missing session"));
    const response = createResponse();

    await handleRankedSyncScheduled({ path: "/api/scheduled/rankedSync" } as Request, response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.body).toEqual({ error: "cron-only" });
  });

  it("returns a successful no-op for an orphaned cron task", async () => {
    mocks.authenticateRequest.mockResolvedValueOnce({ isCron: true, taskUid: "task-orphan" });
    mocks.getConfigByTaskUid.mockResolvedValueOnce(undefined);
    const response = createResponse();

    await handleRankedSyncScheduled({ path: "/api/scheduled/rankedSync" } as Request, response);

    expect(response.status).not.toHaveBeenCalled();
    expect(response.body).toEqual({ ok: true, skipped: "orphan" });
    expect(mocks.syncRankedData).not.toHaveBeenCalled();
  });
});

describe("handleCounterSyncScheduled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a request without a valid cron session", async () => {
    mocks.authenticateRequest.mockRejectedValueOnce(new Error("missing session"));
    const response = createResponse();

    await handleCounterSyncScheduled({ path: "/api/scheduled/counterSync" } as Request, response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.body).toEqual({ error: "cron-only" });
  });

  it("returns a no-op for a removed counter task", async () => {
    mocks.authenticateRequest.mockResolvedValueOnce({ isCron: true, taskUid: "counter-orphan" });
    mocks.getCounterConfigByTaskUid.mockResolvedValueOnce(undefined);
    const response = createResponse();

    await handleCounterSyncScheduled({ path: "/api/scheduled/counterSync" } as Request, response);

    expect(response.body).toEqual({ ok: true, skipped: "orphan" });
    expect(mocks.syncCounterData).not.toHaveBeenCalled();
  });

  it("executes the counter sync only for the registered cron task", async () => {
    mocks.authenticateRequest.mockResolvedValueOnce({ isCron: true, taskUid: "counter-hourly" });
    mocks.getCounterConfigByTaskUid.mockResolvedValueOnce({ taskUid: "counter-hourly" });
    mocks.syncCounterData.mockResolvedValueOnce({ ok: true, version: "counter-123", relationCount: 912 });
    const response = createResponse();

    await handleCounterSyncScheduled({ path: "/api/scheduled/counterSync" } as Request, response);

    expect(mocks.syncCounterData).toHaveBeenCalledWith("scheduled");
    expect(response.body).toEqual({ ok: true, trigger: "scheduled", version: "counter-123", relationCount: 912 });
  });
});
