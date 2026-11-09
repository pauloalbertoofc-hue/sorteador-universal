import assert from 'node:assert/strict';

// Run only against the dedicated, already deployed preview Worker.
const base='https://sorteador-universal-rooms-preview.paulo-alberto-ofc.workers.dev';
const host=new URL(base).hostname;
assert.equal(host,'sorteador-universal-rooms-preview.paulo-alberto-ofc.workers.dev');
const request=async(path,{method='GET',body,token}={})=>{
 const res=await fetch(base+path,{method,headers:{origin:base,'content-type':'application/json',...(token?{'x-room-admin-token':token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const json=await res.json();return {status:res.status,json};
};
for(const path of ['/api/me','/api/lists','/api/webhooks/mercadopago']){
 const res=await request(path);assert.equal(res.status,404,path+' should be inaccessible in preview');
}
const title='Homologacao automatizada '+Date.now();
const created=await request('/api/rooms',{method:'POST',body:{title,maxEntries:2}});
assert.equal(created.status,201,'room creation');
const {id,adminToken}=created.json;
assert.match(id,/^[a-f0-9]{32}$/);assert.match(adminToken,/^[a-f0-9]{64}$/);
const invite=await request('/api/rooms/'+id);assert.equal(invite.status,200);
assert.equal(JSON.stringify(invite.json).includes(adminToken),false,'admin token must not be exposed');
const joined=await request('/api/rooms/'+id+'/join',{method:'POST',body:{name:'Participante QA'}});
assert.equal(joined.status,201,'join');
const current=await request('/api/rooms/'+id);assert.equal(current.status,200);
assert.ok(current.json.entries.includes('Participante QA'),'participant appears');
const duplicate=await request('/api/rooms/'+id+'/join',{method:'POST',body:{name:'participante qa'}});
assert.equal(duplicate.status,409,'case-insensitive duplicate name rejected');
const second=await request('/api/rooms/'+id+'/join',{method:'POST',body:{name:'Segundo participante'}});
assert.equal(second.status,201,'second participant admitted');
const full=await request('/api/rooms/'+id+'/join',{method:'POST',body:{name:'Terceiro participante'}});
assert.equal(full.status,409,'capacity of two enforced');
const fullRoom=await request('/api/rooms/'+id);
assert.equal(fullRoom.json.entries.length,2,'room never exceeds capacity');
const noOrigin=await fetch(base+'/api/rooms/'+id+'/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Sem origem'})});
assert.equal(noOrigin.status,403,'cross-origin protection rejects missing origin');
const foreignOrigin=await fetch(base+'/api/rooms/'+id+'/join',{method:'POST',headers:{origin:'https://untrusted.example','content-type':'application/json'},body:JSON.stringify({name:'Origem externa'})});
assert.equal(foreignOrigin.status,403,'cross-origin writes must be rejected');
const malformed=await request('/api/rooms/'+id+'/join',{method:'POST',body:{name:'<script>alert(1)</script>'}});
assert.equal(malformed.status,400,'HTML-like participant names must be rejected');
const leaked=await request('/api/rooms/'+id);
assert.equal(JSON.stringify(leaked.json).includes(adminToken),false,'room reads must never reveal admin credentials');
const rejected=await request('/api/rooms/'+id+'/close',{method:'POST',body:{},token:'invalid'});
assert.equal(rejected.status,403,'invalid admin token rejected');
const closed=await request('/api/rooms/'+id+'/close',{method:'POST',body:{},token:adminToken});
assert.equal(closed.status,200,'admin close');
const after=await request('/api/rooms/'+id+'/join',{method:'POST',body:{name:'Participante tardio'}});
assert.equal(after.status,409,'closed room rejects joins');
console.log('Preview HTTP smoke checks passed: isolation, create, join, duplicate, capacity, origin, input validation, token privacy, read, authorization, close, blocked join');
