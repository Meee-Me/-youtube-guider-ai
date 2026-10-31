import coreHandler from '../../channel-core.js';

export const handler = async (event) => {
  const params = event.queryStringParameters || {};
  const headers = {};
  let statusCode = 200;
  let body = '';
  const res = {
    setHeader(name, value) { headers[name] = value; },
    status(code) { statusCode = code; return this; },
    json(value) { body = JSON.stringify(value); return this; }
  };
  const req = { method: event.httpMethod || 'GET', query: params };
  try {
    await coreHandler(req, res);
  } catch (error) {
    statusCode = 502;
    body = JSON.stringify({ error: error?.message || 'Channel lookup failed.' });
  }
  return { statusCode, headers: { 'Content-Type': 'application/json', ...headers }, body };
};


