import { createAppServer } from "../server.mjs";

const appServer = createAppServer({
  env: process.env,
  fetchImpl: globalThis.fetch,
});
const requestListener = appServer.listeners("request")[0];

export default async function handler(request, response) {
  return requestListener(request, response);
}
