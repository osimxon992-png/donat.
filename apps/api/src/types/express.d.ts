import type { Permission } from '@donat/shared';

declare global {
  namespace Express {
    interface AuthContext {
      userId: string;
      sessionId: string;
      email: string;
      name: string;
      role: string;
      permissions: Permission[];
    }

    interface Request {
      auth?: AuthContext;
      authError?: unknown;
      requestId?: string;
    }
  }
}

export {};
