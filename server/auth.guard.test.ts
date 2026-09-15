import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("protected update routes", () => {
  it("rejects ranked refresh when there is no authenticated user", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: {
        protocol: "https",
        headers: {},
      } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };

    const caller = appRouter.createCaller(ctx);

    await expect(caller.rankedSync.refresh()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Please login (10001)",
    });
  });
});
