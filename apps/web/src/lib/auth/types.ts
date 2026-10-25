/** The signed-in user (apps/api AuthUserDto) */
export interface SessionUser {
  id: string;
  coachingId?: string;
  name: string;
  email: string;
  phone: string;
  roles: string[];
  permissions: string[];
  /** A temporary password is in use (a new student login): a new one must be chosen first */
  mustChangePassword?: boolean;
}

/** What the web server's /api/auth routes return to the browser; the refresh token stays in a cookie */
export interface Session {
  user: SessionUser;
  accessToken: string;
  /** Seconds until the access token expires */
  expiresIn: number;
}

export interface LoginInput {
  email: string;
  password: string;
  coachingCode?: string;
}

/** POST /coachings/register body (apps/api registerCoachingSchema) */
export interface RegisterInput {
  coachingName: string;
  phone: string;
  email: string;
  city?: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  ownerPassword: string;
}

/**
 * POST /api/auth/register reply: the new owner's session, or { signedIn: false } when the
 * institute was created but signing in afterwards failed (e.g. rate limit)
 */
export type RegisterResult = Session | { signedIn: false };
