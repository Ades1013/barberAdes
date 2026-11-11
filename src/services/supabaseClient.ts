import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://aytgrgqcglmeilvxyvfu.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5dGdyZ3FjZ2xtZWlsdnh5dmZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNDc1NzgsImV4cCI6MjEwODgyMzU3OH0.tIyD-ldJXkWgh1UplUN-qNBsILA59QPCn3zR7NS2kxc';

// Requisito 1: Interceptor de cabeceras en supabaseClient.ts para evitar que PostgREST rechace
// peticiones /rest/v1/ con 'TypeError: Failed to fetch' por tokens JWT sobredimensionados (>8KB)
const cleanPublicOrigin = (): string => {
  if (typeof window === 'undefined') return '';
  let origin = window.location.origin || '';
  if (origin.includes('applet-auth-bridge') || origin.includes('aistudio.google.com')) {
    try {
      const params = new URLSearchParams(window.location.search);
      const candidate = params.get('origin') || params.get('redirect_uri') || params.get('app_url');
      if (candidate && !candidate.includes('applet-auth-bridge') && !candidate.includes('aistudio.google.com')) {
        origin = new URL(candidate).origin;
      } else {
        origin = 'https://ais-pre-5h556j7spmywgm6mdcvapw-89184573351.us-west2.run.app';
      }
    } catch {
      origin = 'https://ais-pre-5h556j7spmywgm6mdcvapw-89184573351.us-west2.run.app';
    }
  }
  return origin
    .replace(/\/applet-auth-bridge.*$/i, '')
    .split('?')[0]
    .split('#')[0]
    .replace(/\/+$/, '');
};

const customFetch: typeof fetch = async (input, init) => {
  let url =
    typeof input === 'string'
      ? input
      : input instanceof Request
      ? input.url
      : String(input);

  // Asegurar que las peticiones de recuperación (/auth/v1/recover) nunca lleven applet-auth-bridge ni aistudio.google.com
  if (url.includes('/auth/v1/recover')) {
    try {
      const parsedUrl = new URL(url);
      const safeOrigin = cleanPublicOrigin();
      if (safeOrigin) {
        parsedUrl.searchParams.set('redirect_to', safeOrigin);
      }
      url = parsedUrl.toString();
      if (typeof input === 'string') {
        input = url;
      } else if (input instanceof Request) {
        input = new Request(url, input);
      }
    } catch {}
  }

  const isRestRequest = url.includes('/rest/v1/');
  let modifiedInit = init;

  if (isRestRequest) {
    if (init && init.headers) {
      if (init.headers instanceof Headers) {
        const auth = init.headers.get('Authorization') || init.headers.get('authorization');
        if (auth && auth.length > 4000) {
          const newHeaders = new Headers(init.headers);
          newHeaders.set('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);
          newHeaders.set('apikey', SUPABASE_ANON_KEY);
          modifiedInit = { ...init, headers: newHeaders };
        }
      } else if (Array.isArray(init.headers)) {
        const authEntry = init.headers.find(
          ([k]) => k.toLowerCase() === 'authorization'
        );
        if (authEntry && authEntry[1] && authEntry[1].length > 4000) {
          const newHeaders = init.headers.map(([k, v]) =>
            k.toLowerCase() === 'authorization'
              ? [k, `Bearer ${SUPABASE_ANON_KEY}`]
              : [k, v]
          ) as [string, string][];
          newHeaders.push(['apikey', SUPABASE_ANON_KEY]);
          modifiedInit = { ...init, headers: newHeaders };
        }
      } else if (typeof init.headers === 'object') {
        const headers = { ...(init.headers as Record<string, string>) };
        const authKey = Object.keys(headers).find(
          (k) => k.toLowerCase() === 'authorization'
        );
        if (authKey && headers[authKey] && headers[authKey].length > 4000) {
          headers[authKey] = `Bearer ${SUPABASE_ANON_KEY}`;
          headers['apikey'] = SUPABASE_ANON_KEY;
          modifiedInit = { ...init, headers };
        }
      }
    } else if (input instanceof Request) {
      const auth = input.headers.get('authorization');
      if (auth && auth.length > 4000) {
        const newHeaders = new Headers(input.headers);
        newHeaders.set('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);
        newHeaders.set('apikey', SUPABASE_ANON_KEY);
        input = new Request(input, { headers: newHeaders });
      }
    }
  }

  try {
    return await fetch(input, modifiedInit);
  } catch (err: any) {
    // Si la petición a /rest/v1/ falla (Failed to fetch por cabeceras), reintentar de forma segura con SUPABASE_ANON_KEY
    if (isRestRequest) {
      try {
        const safeHeaders = new Headers(
          modifiedInit?.headers || (input instanceof Request ? input.headers : {})
        );
        safeHeaders.set('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);
        safeHeaders.set('apikey', SUPABASE_ANON_KEY);
        return await fetch(input, { ...modifiedInit, headers: safeHeaders });
      } catch {
        throw err;
      }
    }
    throw err;
  }
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: customFetch,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
