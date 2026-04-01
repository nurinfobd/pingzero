import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  const pathname = request.nextUrl.pathname;

  const isInstallPage = pathname.startsWith('/install');
  const isInstallApi = pathname.startsWith('/api/install');
  const isPublicSettingsApi = pathname === '/api/settings/public';
  const isAuthApi = pathname.startsWith('/api/auth/');
  const isLoginPage = pathname.startsWith('/login');

  if (isInstallPage || isInstallApi || isPublicSettingsApi) {
    return NextResponse.next();
  }

  let installed = true;
  try {
    const statusUrl = new URL('/api/install/status', request.nextUrl.origin);
    const res = await fetch(statusUrl, { cache: 'no-store' });
    if (res.ok) {
      const data: any = await res.json();
      installed = Boolean(data?.installed);
    }
  } catch (err) {
    installed = true;
  }

  if (!installed) {
    return NextResponse.redirect(new URL('/install', request.url));
  }

  // If not logged in and not on login page, redirect to login
  if (!token && !isLoginPage) {
    // Protect API routes
    if (pathname.startsWith('/api/') && !isAuthApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Redirect to login page for non-API routes
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If logged in and trying to access login page, redirect to dashboard
  if (token && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Apply middleware to all routes except Next.js internals, static files, and public images
  matcher: ['/((?!_next/static|_next/image|favicon.ico|pingzero.png|pingzero-small.png).*)'],
};
