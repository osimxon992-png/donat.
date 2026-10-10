import { errors as joseErrors, jwtVerify, SignJWT } from 'jose';
import type { Env } from '../../config/env';
import { AppError, unauthorized } from '../../lib/errors';

export interface AccessTokenClaims {
  sub: string;
  sid: string;
}

export class TokenService {
  private readonly key: Uint8Array;

  constructor(private readonly env: Env) {
    this.key = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
  }

  async signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return new SignJWT({ sid: claims.sid })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(claims.sub)
      .setIssuer(this.env.JWT_ISSUER)
      .setAudience(this.env.JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.env.ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.key);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        issuer: this.env.JWT_ISSUER,
        audience: this.env.JWT_AUDIENCE,
        clockTolerance: 5,
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') throw unauthorized('Invalid token');
      return { sub: payload.sub, sid: payload.sid };
    } catch (err) {
      if (err instanceof joseErrors.JWTExpired) throw new AppError(401, 'TOKEN_EXPIRED', 'Access token expired');
      if (err instanceof AppError) throw err;
      throw unauthorized('Invalid token');
    }
  }
}
