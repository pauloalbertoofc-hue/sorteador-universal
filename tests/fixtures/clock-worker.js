// Test entrypoint only. Never imported by src/worker.js or deployed by Wrangler.
import worker from '../../src/worker.js';
export default {
  fetch(req, env, ctx) {
    const now = Number(req.headers.get('x-test-clock'));
    if (!Number.isSafeInteger(now) || now <= 0) throw Error('Missing controlled test clock');
    Date.now = () => now;
    return worker.fetch(req, env, ctx);
  }
};
