import { type NextRequest, NextResponse } from 'next/server';
import { SESSION_FLAG_COOKIE } from '@/lib/auth/cookies';

/**
 * Sends visitors without a session to /login before any of the app loads. This is only a fast
 * path for the user experience: the API checks the access token on every request, so a forged
 * cookie gets a login page on the next API call, not data.
 */
export function middleware(request: NextRequest) {
  if (request.cookies.has(SESSION_FLAG_COOKIE)) return NextResponse.next();

  const login = new URL('/login', request.url);
  login.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/app', '/app/:path*', '/student', '/student/:path*'],
};
