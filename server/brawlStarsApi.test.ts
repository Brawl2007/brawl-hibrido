import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOfficialBrawlers } from "./brawlStarsApi";

describe("Brawl Stars Official API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends the official bearer token to the brawlers endpoint", async () => {
    vi.stubEnv("BRAWL_STARS_API_KEY", "test-secret-token");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [{ id: 1, name: "Shelly" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const brawlers = await fetchOfficialBrawlers();

    expect(brawlers).toEqual([{ id: 1, name: "Shelly" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.brawlstars.com/v1/brawlers",
      expect.objectContaining({
        headers: { Authorization: "Bearer test-secret-token" },
      }),
    );
  });

  it("falls back to an empty list when the official endpoint rejects the request", async () => {
    vi.stubEnv("BRAWL_STARS_API_KEY", "test-secret-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Forbidden", { status: 403, statusText: "Forbidden" })),
    );

    await expect(fetchOfficialBrawlers()).resolves.toEqual([]);
  });
});
