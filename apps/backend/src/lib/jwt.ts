import { randomBytes } from 'node:crypto';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import * as jose from 'jose';
import type { TokenPayload } from '@kaipos/shared/types';
import { ACCESS_TOKEN_TTL } from './auth-config.js';

let cachedSecret: Uint8Array | null = null;

async function getSecret(): Promise<Uint8Array> {
  if (cachedSecret) return cachedSecret;

  const secretArn = process.env.JWT_SECRET_ARN;
  if (secretArn) {
    const sm = new SecretsManagerClient({});
    const res = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }));
    if (!res.SecretString) {
      throw new Error(`Secret ${secretArn} has no SecretString value`);
    }
    cachedSecret = new TextEncoder().encode(res.SecretString);
    return cachedSecret;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'JWT_SECRET or JWT_SECRET_ARN must be set. ' +
        'Set JWT_SECRET in .env for local dev, or JWT_SECRET_ARN for AWS prod.',
    );
  }

  cachedSecret = new TextEncoder().encode(secret);
  return cachedSecret;
}

export async function signAccessToken(payload: TokenPayload): Promise<string> {
  return new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(await getSecret());
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('hex');
}

export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  const { payload } = await jose.jwtVerify(token, await getSecret());
  return {
    userId: payload.userId as string,
    businessId: payload.businessId as string,
    role: payload.role as TokenPayload['role'],
  };
}
