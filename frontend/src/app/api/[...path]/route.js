import logger from '@/lib/logger';

// Ensure this route uses Node.js runtime (not edge runtime)
export const runtime = 'nodejs';

/** Base origin for Django (no trailing slash, no /api suffix — we add /api/ when proxying). */
function resolveBackendOrigin() {
  let base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').trim();
  base = base.replace(/\/$/, '');
  // Misconfig: NEXT_PUBLIC_API_URL=http://host:8000/api → would produce /api/api/... and 404 on Django
  if (base.endsWith('/api')) {
    base = base.slice(0, -4);
  }
  return base;
}

export async function GET(request, { params }) {
  const path = params.path.join('/');
  const url = new URL(request.url);
  const searchParams = url.searchParams.toString();

  const backendUrl = resolveBackendOrigin();
  const targetUrl = `${backendUrl}/api/${path}${searchParams ? `?${searchParams}` : ''}`;

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(request.headers.get('authorization') && {
          'Authorization': request.headers.get('authorization')
        }),
        ...(request.headers.get('cookie') && {
          'Cookie': request.headers.get('cookie')
        })
      },
    });

    const data = await response.json();

    // Print sucess log
    logger.info({ route: path, method: 'GET', status: response.status }, 'Proxy GET request');

    return Response.json(data, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    // Print error log
    logger.error({ route: path, method: 'GET', error: String(error) }, 'API proxy error');
    return Response.json(
      { error: 'Failed to fetch data from backend' },
      { status: 500 }
    );
  }
}

export async function POST(request, { params }) {
  const path = params.path.join('/');
  const contentType = request.headers.get('content-type') || '';

  const backendUrl = resolveBackendOrigin();
  const targetUrl = `${backendUrl}/api/${path}`;

  try {
    const outgoingHeaders = {
      ...(request.headers.get('authorization') && {
        'Authorization': request.headers.get('authorization')
      }),
      ...(request.headers.get('cookie') && {
        'Cookie': request.headers.get('cookie')
      }),
      ...(contentType && { 'Content-Type': contentType }),
    };

    // Stream the original body to preserve multipart boundaries and binary data
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: outgoingHeaders,
      body: request.body,
    });

    const data = await response.json();

    // Print sucess log
    logger.info({ route: path, method: 'POST', status: response.status }, 'Proxy POST request');

    return Response.json(data, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    // Print error log
    logger.error({ route: path, method: 'POST', error: String(error) }, 'API proxy error');
    return Response.json(
      { error: 'Failed to send data to backend' },
      { status: 500 }
    );
  }
}