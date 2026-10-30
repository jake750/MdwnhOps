/* Where the Worker lives. Local runs talk to `wrangler dev`; the published
   site talks to the deployed Worker — set its address after the first deploy. */
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export const API = LOCAL ? 'http://localhost:8787' : 'https://mdwnh-ops.REPLACE.workers.dev';
export const DEMO = LOCAL;   // shows the two demo login buttons
