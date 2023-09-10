const GA_ENDPOINT = 'https://www.google-analytics.com/mp/collect'; // GA4 Measurement Protocol endpoint

// Domains to allowlist. Replace with your own!
const originAllowlist = [];
// Update me.
allowlistDomain('blog.milh.tech/');

let hot = false;
let age = Date.now();

export const config = {
  runtime: 'experimental-edge',
};

export default async function (req, event) {
  const url = new URL(req.url);
  if (req.method === 'GET' && !url.search) {
    return new Response('OK', { status: 200 });
  }

  const origin = req.headers.get('origin') || '';
  console.log(`Received ${req.method} request from, origin: ${origin}`);

  const isOriginAllowlisted =
    originAllowlist.indexOf(origin) >= 0 ||
    origin.endsWith('-milh.tech') ||
    origin.endsWith('-milh.tech');
  if (!isOriginAllowlisted) {
    console.info('Bad origin', origin);
    return new Response('Not found', { status: 404 });
  }

  let cacheControl = 'no-store';
  if (url.searchParams.get('ec') == 'noscript') {
    cacheControl = 'max-age: 30';
  }
  const headers = {
    'Access-Control-Allow-Origin': isOriginAllowlisted
      ? origin
      : originAllowlist[0],
    'Cache-Control': cacheControl,
    'x-age': `${hot}; ${Date.now() - age}`,
  };
  hot = true;

  event.waitUntil(proxyToGoogleAnalytics(req, url, await req.text()));
  return new Response('D', { status: 200, headers });
}

function allowlistDomain(domain, addWww = true) {
  const prefixes = ['https://', 'http://'];
  if (addWww) {
    prefixes.push('https://www.');
    prefixes.push('http://www.');
  }
  prefixes.forEach((prefix) => originAllowlist.push(prefix + domain));
}

async function proxyToGoogleAnalytics(req, url, body) {
  // Get GA params whether GET or POST request
  const params =
    req.method.toUpperCase() === 'GET'
      ? url.searchParams
      : new URLSearchParams(body);
  const headers = req.headers;

  // Attach other GA params, required for IP address since the client doesn't have access to it. UA and CID can be sent from the client
  params.set('ip', headers.get('x-forwarded-for') || headers.get('x-bb-ip') || ''); // IP address override
  params.set('ua', params.get('ua') || headers.get('user-agent') || ''); // User agent override
  params.set('cid', params.get('cid') || (await cid(params.get('ip', params.get('ua')))));

  const qs = params.toString();
  console.info('Proxying params:', qs);

  const reqOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: qs,
  };
  let result;
  try {
    result = await fetch(GA_ENDPOINT, reqOptions);
  } catch (e) {
    console.error('Google Analytics error!', e);
    return;
  }
  if (result.status == 200) {
    console.debug('Google Analytics request successful');
    return;
  }
  console.error('Google Analytics status code', result.status, result.statusText);
}

