// lib/auth.ts
import jwt from "jsonwebtoken";

type JwtPayload = {
  userId?: number;
  email?: string;
  [key: string]: any;
};

export function getUserFromToken(req: Request): JwtPayload | null {
  try {
    const auth = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!auth) return null;
    const parts = auth.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") return null;
    const token = parts[1];
    if (!process.env.JWT_SECRET) {
      console.error("Missing JWT_SECRET environment variable");
      return null;
    }
    const payload = jwt.verify(token, process.env.JWT_SECRET) as JwtPayload;
    return payload;
  } catch (err) {
    console.error("getUserFromToken error:", err);
    return null;
  }
}
