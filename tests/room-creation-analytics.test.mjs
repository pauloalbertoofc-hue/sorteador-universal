import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('room creation is measured only after successful room loading and without IDs',()=>{
 assert.ok(html.includes("'room_created'].includes(name)"));
 assert.ok(html.includes("['live','classic'].includes(params.mode)"));
 assert.ok(html.includes("await loadRoom(data.id);startRoomPolling();window.suTrackEvent?.('room_created',{mode:data.drawMode})"));
 assert.ok(html.includes("localStorage.getItem(key)!=='accepted'"));
 assert.ok(html.includes("window.self!==window.top"));
});
