import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash, randomUUID} from 'node:crypto';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {chromium, expect} from '@playwright/test';

let mf, db, server, base, browser, legacy = false;
const account = () => ({email: `${randomUUID()}@example.test`, password: randomUUID()});
const hash = token => createHash('sha256').update(token).digest('hex');
const cookieOf = response => response.headers.get('set-cookie').split(';')[0];
async function request(path, {body, cookie, origin = base} = {}) {
  return mf.dispatchFetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {origin, 'content-type': 'application/json', ...(cookie ? {cookie} : {})},
    ...(body ? {body: JSON.stringify(body)} : {})
  });
}
async function register() {
  const credentials = account();
  const response = await request('/api/register', {body: credentials});
  assert.equal(response.status, 201);
  return {...credentials, cookie: cookieOf(response), response};
}
async function newPage(t) {
  const context = await browser.newContext({reducedMotion: 'reduce'});
  t.after(() => context.close());
  // Never contact the ad provider during tests.
  await context.route('https://bauval.org/**', route => route.abort());
  const page = await context.newPage();
  await page.goto(base);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.locator('#accountGuest')).toBeVisible();
  return {context, page};
}
async function fill(page, credentials) {
  await page.locator('#accountEmail').fill(credentials.email);
  await page.locator('#accountPassword').fill(credentials.password);
}

before(async () => {
  // Real workerd + isolated, in-memory D1. Never touches production or local dev state.
  mf = new Miniflare(convertV4MiniflareOptions({
    name: 'auth-tests', modules: [{type: 'ESModule', path: 'src/worker.js'}, {type: 'ESModule', path: 'src/billing.js'}, {type: 'ESModule', path: 'src/secret-santa.js'}, {type: 'ESModule', path: 'public/amigo-secreto/engine.mjs'}],
    compatibilityDate: '2026-10-24', d1Databases: ['DB']
  }));
  await mf.ready;
  db = await mf.getD1Database('DB');
  for (const file of ['migrations/preview/0001_initial.sql', 'migrations/preview/0002_billing_safety.sql']) {
    const sql = (await readFile(file, 'utf8')).replace(/^--.*$/gm, '');
    for (const statement of sql.split(';').filter(s => s.trim())) await db.prepare(statement).run();
  }
  // Static asset server plus API proxy: browser cookies and SW run unmocked.
  server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, base);
      if (url.pathname.startsWith('/api/')) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const response = await mf.dispatchFetch(url, {
          method: req.method, headers: req.headers,
          ...(!['GET', 'HEAD'].includes(req.method) ? {body: Buffer.concat(chunks)} : {})
        });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
      const allowed = ['/index.html', '/sw.js', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];
      if (!allowed.includes(pathname)) {res.writeHead(404); res.end(); return;}
      const file = legacy && pathname === '/sw.js' ? 'tests/fixtures/legacy-sw.js' : `public${pathname}`;
      const type = pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.html') ? 'text/html' : pathname.endsWith('.svg') ? 'image/svg+xml' : pathname.endsWith('.png') ? 'image/png' : 'application/manifest+json';
      res.writeHead(200, {'content-type': type, 'cache-control': 'no-cache'});
      res.end(await readFile(file));
    } catch {res.writeHead(500); res.end();}
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({headless: true,
    ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {})});
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await mf?.dispose();
});

test('register persists SHA-256 session hash, millisecond expiry and secure cookie', async () => {
  const user = await register();
  const setCookie = user.response.headers.get('set-cookie');
  for (const attribute of ['Path=/api', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=2592000']) assert.ok(setCookie.includes(attribute));
  assert.equal(user.response.headers.get('cache-control'), 'no-store');
  const token = user.cookie.split('=')[1];
  assert.match(token, /^[a-f0-9]{64}$/);
  const row = await db.prepare('SELECT * FROM sessions WHERE token_hash=?').bind(hash(token)).first();
  assert.ok(row);
  assert.notEqual(row.token_hash, token);
  assert.ok(Math.abs(row.expires_at - Date.now() - 30 * 86400000) < 10000);
  assert.equal(typeof row.expires_at, 'number');
  const savedUser = await db.prepare('SELECT password_hash FROM users WHERE id=?').bind(row.user_id).first();
  assert.match(savedUser.password_hash, /^pbkdf2\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
  const me = await (await request('/api/me', {cookie: user.cookie})).json();
  assert.equal(me.user.email, user.email);
  assert.equal(me.subscription.active, false);
});

test('valid login persists across requests; incorrect password rejected without cookie', async () => {
  const user = await register();
  let response = await request('/api/login', {body: {...user, password: 'incorrect-password'}});
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('set-cookie'), null);
  response = await request('/api/login', {body: {email: user.email.toUpperCase(), password: user.password}});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {ok: true});
  for (let i = 0; i < 3; i++) {
    const me = await (await request('/api/me', {cookie: cookieOf(response)})).json();
    assert.equal(me.user.email, user.email);
  }
});

test('duplicate registration is 409 and invalid input is 400', async () => {
  const user = await register();
  assert.equal((await request('/api/register', {body: user})).status, 409);
  assert.equal((await request('/api/register', {body: {email: 'invalid', password: 'short'}})).status, 400);
});

test('missing, unknown, truncated, appended and prefixed cookies are anonymous', async () => {
  const user = await register();
  for (const cookie of [undefined, 'su_session=invalid', `su_session=${'f'.repeat(64)}`, user.cookie.slice(0, -1), user.cookie + 'a', 'other_' + user.cookie]) {
    const response = await request('/api/me', {cookie});
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {user: null, subscription: {active: false}});
  }
  const me = await (await request('/api/me', {cookie: `other=1; ${user.cookie}; another=2`})).json();
  assert.equal(me.user.email, user.email);
});

test('expired session is rejected without deleting other sessions', async () => {
  const user = await register();
  const tokenHash = hash(user.cookie.split('=')[1]);
  await db.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').bind(Date.now() - 1, tokenHash).run();
  const me = await (await request('/api/me', {cookie: user.cookie})).json();
  assert.equal(me.user, null);
  assert.ok(await db.prepare('SELECT token_hash FROM sessions WHERE token_hash=?').bind(tokenHash).first());
});

test('logout invalidates the current session and expires cookie, retaining other sessions', async () => {
  const user = await register();
  const login = await request('/api/login', {body: user});
  const secondCookie = cookieOf(login);
  const logout = await request('/api/logout', {cookie: user.cookie, body: {}});
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /su_session=; Path=\/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0/);
  assert.equal((await (await request('/api/me', {cookie: user.cookie})).json()).user, null);
  assert.equal((await (await request('/api/me', {cookie: secondCookie})).json()).user.email, user.email);
  assert.equal((await request('/api/logout', {body: {}})).status, 200);
});

test('cross-origin writes are rejected and free accounts get no Pro or checkout', async () => {
  const user = await register();
  assert.equal((await request('/api/login', {body: user, origin: 'https://other.example'})).status, 403);
  assert.equal((await request('/api/lists', {cookie: user.cookie})).status, 403);
  assert.equal((await request('/api/checkout', {cookie: user.cookie, body: {}})).status, 503);
});

test('browser: registration, reload, logout, incorrect and correct login with real cookies and SW', async t => {
  const {context, page} = await newPage(t);
  const user = account();
  await fill(page, user);
  await page.locator('#accountRegister').click();
  await expect(page.locator('#accountMember')).toBeVisible();
  await expect(page.locator('#accountMessage')).toHaveText('Conta criada. Você está conectado.');
  await expect(page.locator('#accountPassword')).toHaveValue('');
  const cookie = (await context.cookies()).find(c => c.name === 'su_session');
  assert.ok(cookie.httpOnly && cookie.secure);
  assert.equal(cookie.sameSite, 'Strict');
  assert.equal(cookie.path, '/api');
  assert.equal(await page.evaluate(() => document.cookie.includes('su_session')), false);
  await page.reload();
  await expect(page.locator('#accountIdentity')).toHaveText(user.email);
  await expect(page.locator('#adArea')).toBeVisible();
  await expect(page.locator('#proStudio')).toBeHidden();
  await page.locator('#accountLogout').click();
  await expect(page.locator('#accountGuest')).toBeVisible();
  await expect(page.locator('#accountMessage')).toHaveText('Você saiu da sua conta.');
  assert.equal((await context.cookies()).some(c => c.name === 'su_session'), false);
  await fill(page, {...user, password: 'wrong-password'});
  await page.locator('#accountLogin').click();
  await expect(page.locator('#accountMessage')).toHaveText('Credenciais inválidas');
  await expect(page.locator('#accountPassword')).toHaveValue('wrong-password');
  await fill(page, user);
  await page.locator('#accountLogin').click();
  await expect(page.locator('#accountMember')).toBeVisible();
  await expect(page.locator('#accountMessage')).toHaveText('Login realizado com sucesso.');
  assert.equal(await page.evaluate(async () => !!await caches.match('/api/me')), false);
});

test('browser: login success without confirmed session preserves password and explains failure', async t => {
  const {context, page} = await newPage(t);
  const user = account();
  await context.route('**/api/login', route => route.fulfill({json: {ok: true}}));
  await fill(page, user);
  await page.locator('#accountLogin').click();
  await expect(page.locator('#accountMessage')).toContainText('Verifique se os cookies estão permitidos');
  await expect(page.locator('#accountPassword')).toHaveValue(user.password);
  await expect(page.locator('#accountGuest')).toBeVisible();
});

test('browser: API outage after login is visible and keeps password; no Pro granted', async t => {
  const {context, page} = await newPage(t);
  const user = await register();
  await context.route('**/api/me', route => route.fulfill({status: 503, json: {error: 'Serviço temporariamente indisponível'}}));
  await fill(page, user);
  await page.locator('#accountLogin').click();
  await expect(page.locator('#accountMessage')).toContainText('Serviço temporariamente indisponível');
  await expect(page.locator('#accountPassword')).toHaveValue(user.password);
  await expect(page.locator('#adArea')).toBeVisible();
  await expect(page.locator('#proStudio')).toBeHidden();
});

test('browser: upgrading an installed legacy SW clears stale account cache', async t => {
  legacy = true;
  t.after(() => {legacy = false;});
  const {context, page} = await newPage(t);
  const user = account();
  await expect.poll(() => page.evaluate(async () => !!await caches.match('/api/me'))).toBe(true);
  await fill(page, user);
  await page.locator('#accountRegister').click();
  await expect(page.locator('#accountMessage')).toContainText('Não foi possível confirmar a sessão');
  assert.ok((await context.cookies()).some(c => c.name === 'su_session'));
  // Exact original defect: server sees session; SW returns cached anonymous response.
  assert.equal((await (await context.request.get(base + '/api/me')).json()).user.email, user.email);
  assert.equal(await page.evaluate(async () => (await (await fetch('/api/me')).json()).user), null);
  legacy = false;
  await page.evaluate(async () => {
    const changed = new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once: true}));
    await (await navigator.serviceWorker.ready).update();
    await changed;
  });
  await page.reload();
  await expect(page.locator('#accountIdentity')).toHaveText(user.email);
  assert.equal(await page.evaluate(async () => !!await caches.match('/api/me')), false);
  assert.equal(await page.evaluate(async () => (await caches.keys()).includes('sorteador-universal-v2-0-2')), false);
});

test('browser: offline PWA retains free draws and history, never replays authenticated API', async t => {
  const {context, page} = await newPage(t);
  await fill(page, account());
  await page.locator('#accountRegister').click();
  await expect(page.locator('#accountMember')).toBeVisible();
  await context.setOffline(true);
  assert.equal(await page.evaluate(async () => {try {await fetch('/api/me'); return false;} catch {return true;}}), true);
  await page.reload();
  await expect(page.locator('#accountGuest')).toBeVisible();
  await expect(page.locator('#adArea')).toBeVisible();
  await page.locator('#draw').click();
  await expect(page.locator('#result .chip')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('#history')).toContainText('Sortear números');
});

test('browser: numbers, names, wheel, teams, dice and ad entitlement remain functional', async t => {
  const {page} = await newPage(t);
  await page.locator('#draw').click();
  await expect(page.locator('#result .chip')).toHaveCount(1);
  await page.locator('[data-tab="names"]').click();
  await page.locator('#items').fill('Ana\nBruno\nCarla\nDiego');
  await page.locator('#draw').click();
  await expect(page.locator('#result .chip')).toHaveCount(1);
  await page.locator('#spin').click();
  await expect(page.locator('#wheelNote')).toContainText('Resultado:');
  await page.locator('[data-tab="teams"]').click();
  await page.locator('#players').fill('Ana\nBruno\nCarla\nDiego');
  await page.locator('#draw').click();
  await expect(page.locator('#result .team')).toHaveCount(2);
  await page.locator('[data-tab="dice"]').click();
  await page.locator('#draw').click();
  await expect(page.locator('#result .chip')).toHaveCount(2);
  await expect(page.locator('#adArea')).toBeVisible();
  await expect(page.locator('#proStudio')).toBeHidden();
});

test('browser: late anonymous startup response cannot replace authenticated account', async t => {
  const context = await browser.newContext();
  t.after(() => context.close());
  await context.route('https://bauval.org/**', route => route.abort());
  let release, intercepted;
  const held = new Promise(resolve => {release = resolve;});
  const ready = new Promise(resolve => {intercepted = resolve;});
  let first = true;
  await context.route('**/api/me', async route => {
    if (!first) return route.continue();
    first = false;
    intercepted();
    await held;
    await route.fulfill({json: {user: null, subscription: {active: false}}});
  });
  const page = await context.newPage();
  await page.goto(base);
  await ready;
  await fill(page, account());
  await page.locator('#accountRegister').click();
  await expect(page.locator('#accountMember')).toBeVisible();
  release();
  // Browser request completes before checking the state preserved by the version guard.
  await page.waitForResponse(response => response.url() === base + '/api/me');
  await expect(page.locator('#accountMember')).toBeVisible();
  await expect(page.locator('#accountMessage')).toHaveText('Conta criada. Você está conectado.');
});

test('browser: successful logout clears member UI even if the confirmation request fails', async t => {
  const {context, page} = await newPage(t);
  await fill(page, account());
  await page.locator('#accountRegister').click();
  await expect(page.locator('#accountMember')).toBeVisible();
  await context.route('**/api/me', route => route.fulfill({status: 503, json: {error: 'Conta temporariamente indisponível'}}));
  await page.locator('#accountLogout').click();
  await expect(page.locator('#accountGuest')).toBeVisible();
  await expect(page.locator('#accountMember')).toBeHidden();
  await expect(page.locator('#accountMessage')).toHaveText('Conta temporariamente indisponível');
  assert.equal((await context.cookies()).some(cookie => cookie.name === 'su_session'), false);
});

test('browser: only an authenticated, active Pro response hides ads', async t => {
  const context = await browser.newContext();
  t.after(() => context.close());
  await context.route('https://bauval.org/**', route => route.abort());
  let payload = {user: {id: 'fixture', email: 'pro@example.test'}, subscription: {active: true}};
  // UI contract fixture only: no provider requests, charges or real entitlement changes.
  await context.route('**/api/me', route => route.fulfill({json: payload}));
  const page = await context.newPage();
  await page.goto(base);
  await expect(page.locator('#adArea')).toBeHidden();
  await expect(page.locator('#proStudio')).toBeVisible();
  payload = {user: null, subscription: {active: true}};
  await page.reload();
  await expect(page.locator('#adArea')).toBeVisible();
  await expect(page.locator('#proStudio')).toBeHidden();
  payload = {user: {id: 'fixture', email: 'free@example.test'}, subscription: {active: false}};
  await page.reload();
  await expect(page.locator('#adArea')).toBeVisible();
  await expect(page.locator('#proStudio')).toBeHidden();
});

test('browser: checkout return preserves login and never treats a success URL as payment', async t => {
  const {context, page} = await newPage(t), credentials = account();
  await fill(page, credentials); await page.locator('#accountRegister').click();
  await expect(page.locator('#accountMember')).toBeVisible();
  const direct = await context.request.get(base + '/api/me'), real = await direct.json();
  await context.route('**/api/me', route => route.fulfill({json: {...real, billing: {configured: true}, subscription: {active: false, status: 'free'}}}));
  await page.locator('#accountRefresh').click();
  await expect(page.locator('#accountCheckout')).toBeEnabled();
  await context.route('**/api/checkout', route => route.fulfill({json: {checkout_url: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=synthetic'}}));
  await context.route('https://www.mercadopago.com.br/subscriptions/checkout?*', route => route.fulfill({contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(base + '/?billing=return&status=approved')})</script>`}));
  await page.locator('#accountCheckout').click();
  await expect(page.locator('#accountIdentity')).toHaveText(credentials.email);
  await expect(page.locator('#accountGuest')).toBeHidden();
  await expect(page.locator('#proStudio')).toBeHidden();
  await expect(page.locator('#adArea')).toBeVisible();
  const serverMe = await context.request.get(base + '/api/me');
  assert.equal((await serverMe.json()).user.email, credentials.email);
});

test('browser: checkout prevents concurrent clicks and exposes provider failure', async t => {
  const {context, page} = await newPage(t);
  await fill(page, account()); await page.locator('#accountRegister').click();
  await expect(page.locator('#accountMember')).toBeVisible();
  const real = await (await context.request.get(base + '/api/me')).json();
  await context.route('**/api/me', route => route.fulfill({json: {...real, billing: {configured: true}, subscription: {active: false, status: 'free'}}}));
  await page.locator('#accountRefresh').click(); await expect(page.locator('#accountCheckout')).toBeEnabled();
  let release, calls = 0;
  await context.route('**/api/checkout', async route => {
    calls++; await new Promise(resolve => {release = resolve;});
    await route.fulfill({status: 502, json: {error: 'Mercado Pago temporariamente indisponível'}});
  });
  await page.locator('#accountCheckout').click();
  await expect(page.locator('#accountCheckout')).toBeDisabled();
  await expect.poll(() => calls).toBe(1); release();
  await expect(page.locator('#accountMessage')).toContainText('Mercado Pago temporariamente indisponível');
  await expect(page.locator('#accountCheckout')).toBeEnabled();
  await expect(page.locator('#proStudio')).toBeHidden();
});

test('browser: cancelling renewal preserves Pro and hidden ads across reload, with an explicit paid deadline', async t => {
  const {context, page} = await newPage(t);
  await fill(page, account()); await page.locator('#accountRegister').click();
  await expect(page.locator('#accountMember')).toBeVisible();
  const real = await (await context.request.get(base + '/api/me')).json();
  const now = Date.now(), until = new Date(now + 86400000).toISOString();
  let sub = {active: true, status: 'authorized', renewal_status: 'active', access_status: 'pro_active', access_until: until, verified_at: now, can_cancel: true};
  let holdNext=false,release;
  await context.route('**/api/me', async route => {
    const snapshot=structuredClone(sub);
    if(holdNext){holdNext=false;await new Promise(resolve=>{release=resolve})}
    return route.fulfill({json: {...real, subscription:snapshot, billing: {configured: false}}});
  });
  await context.route('**/api/subscription/cancel', route => {
    sub = {...sub, status: 'cancelled', renewal_status: 'cancelled', access_status: 'pro_cancelled', can_cancel: false};
    return route.fulfill({json: {ok: true, subscription: sub}});
  });
  await page.locator('#accountRefresh').click();
  await expect(page.locator('#proStudio')).toBeVisible();
  await page.clock.install({time:new Date(now)});
  await page.clock.fastForward(20000);
  holdNext=true;
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(()=>!!release).toBe(true);
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#accountCancel').click();
  await expect(page.locator('#accountMessage')).toContainText('Você continuará com acesso Pro até');
  await expect(page.locator('#billingState')).toContainText('Não haverá renovação automática');
  await expect(page.locator('#subscriptionState')).toHaveText('Pro disponível — renovação cancelada');
  const late=page.waitForResponse(response=>response.url()===base+'/api/me');
  release();await late;
  await expect(page.locator('#subscriptionState')).toHaveText('Pro disponível — renovação cancelada');
  await expect(page.locator('#adArea')).toBeHidden();
  await expect(page.locator('#accountCancel')).toBeHidden();
  await expect(page.locator('#accountCheckout')).toBeDisabled();
  await page.reload();
  await expect(page.locator('#proStudio')).toBeVisible();
  await expect(page.locator('#adArea')).toBeHidden();
  await expect(page.locator('#subscriptionState')).toHaveText('Pro disponível — renovação cancelada');
  await expect(page.locator('#billingState')).toContainText(new Date(until).toLocaleDateString('pt-BR'));
});

test('browser: controlled expiry closes Pro and restores ads without a page reload', async t => {
  const {context, page} = await newPage(t);
  await fill(page, account()); await page.locator('#accountRegister').click();
  await expect(page.locator('#accountMember')).toBeVisible();
  const real = await (await context.request.get(base + '/api/me')).json();
  const now = Date.parse('2026-01-15T12:00:00Z'), until = new Date(now + 60000).toISOString();
  await page.clock.install({time: new Date(now)}); await page.clock.pauseAt(new Date(now + 1000));
  let sub = {active: true, status: 'cancelled', renewal_status: 'cancelled', access_status: 'pro_cancelled', access_until: until, verified_at: now, can_cancel: false};
  await context.route('**/api/me', route => route.fulfill({json: {...real, subscription: sub, billing: {configured: false}}}));
  await page.locator('#accountRefresh').click();
  await expect(page.locator('#proStudio')).toBeVisible();
  await expect(page.locator('#adArea')).toBeHidden();
  await page.clock.fastForward(59999);
  await expect(page.locator('#proStudio')).toBeVisible();
  sub = {...sub, active: false, access_status: 'expired', verified_at: now + 60000};
  await page.clock.fastForward(1);
  await expect(page.locator('#proStudio')).toBeHidden();
  await expect(page.locator('#adArea')).toBeVisible();
  await expect(page.locator('#subscriptionState')).toHaveText('Período Pro encerrado — renovação cancelada');
});
