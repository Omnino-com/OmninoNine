#!/usr/bin/env node
// Calls a local Companion instance's API, the same way its web UI does.
//
//   node tools/companion-rpc.js mutation instances.surfaces.add '{"moduleId":"x","label":"x","versionId":"dev"}'
//   node tools/companion-rpc.js sub surfaces.watchSurfaces '{}' 2
//
// For a subscription, the last argument is how many seconds to listen for.
// Set COMPANION_URL to change the target (default ws://127.0.0.1:8123/trpc).

const url = process.env.COMPANION_URL || 'ws://127.0.0.1:8123/trpc';
const [method, path, inputJson = 'null', listenSeconds = '2'] = process.argv.slice(2);

const methods = { mutation: 'mutation', query: 'query', sub: 'subscription' };
if (!methods[method] || !path) {
  console.error('usage: companion-rpc.js <query|mutation|sub> <path> [json-input] [seconds]');
  process.exit(2);
}

const input = JSON.parse(inputJson);
const socket = new WebSocket(url);
let done = false;

function finish(code) {
  if (done) return;
  done = true;
  socket.close();
  process.exit(code);
}

socket.addEventListener('open', () => {
  socket.send(JSON.stringify({
    id: 1,
    jsonrpc: '2.0',
    method: methods[method],
    params: { path, ...(input === null ? {} : { input }) },
  }));
  if (method === 'sub') setTimeout(() => finish(0), Number(listenSeconds) * 1000);
});

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id !== 1) return;
  if (message.error) {
    console.log(`ERROR ${JSON.stringify(message.error).slice(0, 600)}`);
    finish(1);
    return;
  }
  if (message.result?.type === 'started' || message.result?.type === 'stopped') return;
  console.log(JSON.stringify(message.result?.data ?? message.result));
  if (method !== 'sub') finish(0);
});

socket.addEventListener('error', (event) => {
  console.log(`SOCKET_ERROR ${event.message || 'could not connect'}`);
  finish(1);
});

setTimeout(() => {
  console.log('TIMEOUT');
  finish(1);
}, 15000 + Number(listenSeconds) * 1000);
