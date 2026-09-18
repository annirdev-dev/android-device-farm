import jwt from "jsonwebtoken";
import { loadEnv } from "@devicefarm/config";

export interface JwtPayload {
  userId: string;
  email: string;
}

export function signToken(payload: JwtPayload): string {
  const env = loadEnv();
  // JWT_EXPIRES_IN is a free-form env string (e.g. "7d"); jsonwebtoken's types
  // want its branded `StringValue` type from `ms`, so a plain string needs a cast here.
  const options: jwt.SignOptions = { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyToken(token: string): JwtPayload {
  const env = loadEnv();
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
