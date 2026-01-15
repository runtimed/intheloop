import { HonoRequest } from "hono";

export function getBearerToken(req: HonoRequest): string {
  return req.header("Authorization")?.replace("Bearer ", "") || "";
}
