import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const classic=readFileSync(new URL('../public/amigo-secreto/index.html',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/amigo-secreto/novo/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/amigo-secreto/novo/app.mjs',import.meta.url),'utf8');
const api=readFileSync(new URL('../src/secret-santa.js',import.meta.url),'utf8');

test('new group UI separates organizer privacy from participant sign-in',()=>{
 assert.match(html,/value="private"/);
 assert.match(html,/value="supervised"/);
 assert.match(html,/value="guest"/);
 assert.match(html,/value="account"/);
 assert.match(html,/id="close"/);
 assert.match(html,/id="draw"/);
 assert.match(html,/id="checkResult"/);
});
test('group invitation and participant claim are independent fragment secrets',()=>{
 assert.match(app,/new URLSearchParams\(location.hash.slice\(1\)\)/);
 assert.match(app,/privateUrl\(activeEvent.id,'invite',activeEvent.inviteToken\)/);
 assert.match(app,/privateUrl\(activeClaim.id,'claim',activeClaim.token\)/);
 assert.match(app,/claim-reveal/);
 assert.doesNotMatch(html,/adsbygoogle|googlesyndication/);
 assert.match(html,/no-referrer/);
});
test('new group UI does not reveal results in the organizer response',()=>{
 assert.match(app,/account\/events\//);
 assert.match(app,/\/draw'/);
 assert.match(app,/data.participants/);
 const drawHandler=app.split("$('draw').addEventListener")[1]?.split("$('enroll').addEventListener")[0];
 assert.ok(drawHandler,'draw handler must exist');
 assert.doesNotMatch(drawHandler,/data.assignments|data.pairings/);
 assert.match(api,/return reply\(\{id:draw\[1\],status:'drawn',participants:members.length,privacy:event.privacy_mode\}\)/);
});
test('enrollment waits for validated invitation and retains private credentials',()=>{
 assert.match(app,/\$\('enrollButton'\).disabled=true/);
 assert.match(app,/invite-info/);
 assert.match(app,/secret.test\(data.claimToken/);
 assert.match(app,/history.replaceState/);
 assert.match(app,/credentials:'same-origin'/);
});

test('supervised audit requires event owner and is forbidden for private draws',()=>{
 assert.match(api,/audit=path.match/);
 assert.match(api,/owner_user_id=\?/);
 assert.match(api,/event.privacy_mode!=='supervised'/);
 assert.match(api,/event.status!=='drawn'/);
 assert.match(html,/id="audit" class="hidden"/);
 assert.match(app,/activeEvent.privacy==='supervised'/);
 assert.match(app,/document.createElement\('li'\)/);
 assert.doesNotMatch(app,/innerHTML/);
});

test('saved account result link reopens participant view without guest credential',()=>{
 assert.match(app,/if\(eventId\|\|inviteToken\|\|claimToken\|\|accountResult\)/);
 assert.match(app,/else if\(accountResult\)/);
 assert.match(app,/hide\('copyClaim'\)/);
 assert.match(app,/my-result/);
});
test('recovered organizer controls follow closed and drawn event state',()=>{
 assert.match(app,/const closed=data.enrollmentClosed\|\|data.status!=='draft'/);
 assert.match(app,/\$\('close'\).disabled=closed/);
 assert.match(app,/\$\('draw'\).disabled=data.status!=='draft'\|\|!data.enrollmentClosed/);
 assert.match(app,/\$\('rotateInvite'\).disabled=closed/);
 assert.match(app,/data.status==='drawn'&&data.privacy==='supervised'/);
 assert.match(app,/hide\('auditResults'\)/);
});

test('classic secret santa links to the optional group flow without replacing legacy creation',()=>{
 assert.match(classic,/href="\/amigo-secreto\/novo\/"/);
 assert.match(classic,/id="createForm"/);
 assert.match(classic,/id="linksSection"/);
 assert.match(classic,/\.\/app\.mjs/);
 assert.match(classic,/modalidade clássica/);
});

test('group page restricts scripts, network and embedded third parties',()=>{
 assert.match(html,/http-equiv="Content-Security-Policy"/);
 assert.match(html,/default-src 'none'/);
 assert.match(html,/script-src 'self'/);
 assert.match(html,/connect-src 'self'/);
 assert.match(html,/base-uri 'none'/);
 assert.match(html,/object-src 'none'/);
 assert.match(html,/name="referrer" content="no-referrer"/);
 assert.doesNotMatch(html,/<script[^>]*src="https?:/);
});

test('participant must acknowledge organizer visibility before enrollment',()=>{
 assert.match(html,/id="privacyNotice"/);
 assert.match(html,/id="privacyConsent" type="checkbox" required/);
 assert.match(app,/organizador poderá consultar a lista completa/);
 assert.match(app,/organizador não poderá consultar a lista completa/);
 assert.match(html,/input:not\(\[type="checkbox"\]\)/);
});

test('existing-account sign-in stays on invitation page',()=>{
 assert.match(html,/id="signInForm"/);
 assert.match(html,/autocomplete="current-password"/);
 assert.match(app,/fetch\('\/api\/login'/);
 assert.match(app,/credentials:'same-origin'/);
 assert.match(app,/\$\('signInPassword'\)\.value=''/);
 assert.match(app,/hide\('signIn'\)/);
 assert.doesNotMatch(app,/location\.href\s*=\s*['"]\//);
});

test('group rate limits allow a shared Wi-Fi without removing abuse protection',()=>{
 assert.match(api,/groupEvent\?\(groupEvent\[1\]==='enroll'\?120:240\)/);
 assert.match(api,/groupOwner\?60:10/);
 assert.match(api,/rateLimit\('secret-santa-enroll-event',requester\+':'\+enroll\[1\],120,3600000\)/);
 assert.match(api,/groupEvent\?'secret-santa-group-'/);
});

test('account access is session-bound while guest access warns about bearer links',()=>{
 assert.match(html,/id="claimAccessNotice"/);
 assert.match(app,/message\('claimAccessNotice','Seu resultado está protegido pela sua conta/);
 assert.match(app,/message\('claimAccessNotice','Este endereço contém sua credencial individual/);
 assert.match(app,/privateUrl\(eventId,'account','1'\)/);
 assert.match(app,/privateUrl\(eventId,'claim',data.claimToken\)/);
 assert.match(app,/hide\('copyClaim'\)/);
 assert.match(app,/\$\('signInPassword'\)\.value='';\$\('signInButton'\)\.disabled=false/);
});
