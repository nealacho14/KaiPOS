import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEventV2, Context } from "aws-lambda";
import { handler } from "./health.js";

vi.mock("../db/client.js", () => ({
  getClient: vi.fn(),
}));

const { getClient } = await import("../db/client.js");
const mockedGetClient = vi.mocked(getClient);

function makeEvent(): APIGatewayProxyEventV2 {
  return {} as APIGatewayProxyEventV2;
}

function makeContext(): Context {
  return {} as Context;
}

describe("health handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with connected status when db is reachable", async () => {
    mockedGetClient.mockResolvedValue({
      db: () => ({ command: vi.fn().mockResolvedValue({ ok: 1 }) }),
    } as never);

    const result = await handler(makeEvent(), makeContext(), vi.fn());

    expect(result).toBeDefined();
    const body = JSON.parse((result as { body: string }).body);
    expect((result as { statusCode: number }).statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.database).toBe("connected");
    expect(body.data.service).toBe("kaipos-api");
  });

  it("returns error status when db is unreachable", async () => {
    mockedGetClient.mockRejectedValue(new Error("Connection failed"));

    const result = await handler(makeEvent(), makeContext(), vi.fn());

    const body = JSON.parse((result as { body: string }).body);
    expect(body.data.database).toBe("error");
    expect(body.success).toBe(true);
  });
});
