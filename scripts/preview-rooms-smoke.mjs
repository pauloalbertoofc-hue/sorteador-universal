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
assert.equal(joined.status,200,'join');
const current=await request('/api/rooms/'+id);assert.equal(current.status,200);
assert.ok(current.json.entries.some(x=>x.name==='Participante QA'),'participant appears');
const rejected=await request('/api/rooms/'+id+'/close',{method:'POST',body:{},token:'invalid'});
assert.equal(rejected.status,403,'invalid admin token rejected');
const closed=await request('/api/rooms/'+id+'/close',{method:'POST',body:{},token:adminToken});
assert.equal(closed.status,200,'admin close');
const after=await request('/api/rooms/'+id+'/join',{method:'POST',body:{name:'Participante tardio'}});
assert.equal(after.status,409,'closed room rejects joins');
console.log('Preview HTTP smoke checks passed: isolation, create, join, read, authorization, close, blocked join');
