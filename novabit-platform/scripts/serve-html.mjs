import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { createServer, request as createProxyRequest } from 'node:http';
import { fileURLToPath } from 'node:url';

const host = process.env.HTML_HOST || '::';
const port = Number(process.env.HTML_PORT || 8080);
const apiPort = Number(process.env.HTML_API_PORT || 4000);
const scriptDirectory = resolve(fileURLToPath(new URL('.', import.meta.url)));
const workspaceRoot = resolve(scriptDirectory, '..', '..');
const siteRoot = resolve(scriptDirectory, '..', '..', 'novabitwebdev');
const mirroredAssetRoots = new Set([
  'cdn.gtranslate.net',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'code.jquery.com',
  'images',
  'translate.google.com',
  'unpkg.com',
  'videos',
]);
const mirroredAssetFiles = new Set([
  'apng-test.png',
  'backblue.gif',
  'fade.gif',
  'latestwithdrawer.css',
]);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function resolveCandidatePaths(urlPathname) {
  const withoutQuery = urlPathname.split('?')[0].split('#')[0];
  const normalized = normalize(decodeURIComponent(withoutQuery));
  const candidate =
    normalized === '/' || normalized === '.'
      ? 'index.html'
      : normalized.replace(/^([/\\])+/, '');

  const sitePath = resolve(siteRoot, candidate);

  if (!sitePath.startsWith(siteRoot)) {
    return null;
  }

  const candidatePaths = [sitePath];
  const [firstSegment] = candidate.split(/[\\/]+/).filter(Boolean);

  if (
    firstSegment &&
    (mirroredAssetRoots.has(firstSegment) || mirroredAssetFiles.has(firstSegment))
  ) {
    const mirroredPath = resolve(workspaceRoot, candidate);

    if (mirroredPath.startsWith(workspaceRoot)) {
      candidatePaths.push(mirroredPath);
    }
  }

  return candidatePaths;
}

function resolveExistingPath(candidatePaths) {
  for (const candidatePath of candidatePaths) {
    let resolvedPath = candidatePath;

    if (existsSync(resolvedPath) && statSync(resolvedPath).isDirectory()) {
      resolvedPath = join(resolvedPath, 'index.html');
    }

    if (existsSync(resolvedPath)) {
      return resolvedPath;
    }
  }

  return null;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function serveFile(filePath, response) {
  const extension = extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] || 'application/octet-stream';

  response.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  });

  createReadStream(filePath).pipe(response);
}

function resolveApiOrigin(request) {
  const configuredOrigin = process.env.HTML_API_ORIGIN?.trim();

  if (configuredOrigin) {
    return new URL(configuredOrigin);
  }

  const requestHost = request.headers.host || `localhost:${port}`;
  const requestUrl = new URL(`http://${requestHost}`);
  return new URL(`http://${requestUrl.hostname}:${apiPort}`);
}

function formatListenerHost(value) {
  if (value === '::' || value === '0.0.0.0') {
    return 'localhost';
  }

  return value.includes(':') ? `[${value}]` : value;
}

function proxyApiRequest(clientRequest, clientResponse) {
  const upstreamUrl = new URL(clientRequest.url || '/', resolveApiOrigin(clientRequest));
  const upstreamRequest = createProxyRequest(
    upstreamUrl,
    {
      method: clientRequest.method,
      headers: {
        ...clientRequest.headers,
        host: upstreamUrl.host,
      },
    },
    (upstreamResponse) => {
      clientResponse.writeHead(
        upstreamResponse.statusCode || 502,
        upstreamResponse.headers,
      );
      upstreamResponse.pipe(clientResponse);
    },
  );

  upstreamRequest.on('error', () => {
    sendJson(clientResponse, 502, {
      error: `Novabit API is unavailable at ${upstreamUrl.origin}.`,
    });
  });

  clientRequest.pipe(upstreamRequest);
}

const server = createServer((request, response) => {
  if ((request.url || '').startsWith('/api/')) {
    proxyApiRequest(request, response);
    return;
  }

  const candidatePaths = resolveCandidatePaths(request.url || '/');

  if (!candidatePaths) {
    sendJson(response, 400, { error: 'Invalid path.' });
    return;
  }

  const filePath = resolveExistingPath(candidatePaths);

  if (!filePath) {
    const notFoundPage = resolve(siteRoot, '404.html');
    if (existsSync(notFoundPage)) {
      response.writeHead(404, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      createReadStream(notFoundPage).pipe(response);
      return;
    }

    sendJson(response, 404, { error: 'File not found.' });
    return;
  }

  serveFile(filePath, response);
});

server.listen(port, host, () => {
  const rootUrl = `http://${formatListenerHost(host)}:${port}/`;
  process.stdout.write(
    `Novabit HTML frontend is serving ${siteRoot} at ${rootUrl}\n`,
  );
});
