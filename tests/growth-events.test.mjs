import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('analytics events require explicit consent and top-level page',()=>{assert.match(html,/window\.suTrackEvent=function/);assert.match(html,/window\.self!==window\.top\|\|localStorage\.getItem\(key\)!=='accepted'/);assert.match(html,/!window\.__suGa4Loaded/);assert.match(html,/\['tool_selected','draw_completed','share_clicked'\]/);});
test('only fixed event dimensions are transmitted, not participant data',()=>{assert.match(html,/safe\.tool=params\.tool/);assert.match(html,/safe\.method=params\.method/);assert.doesNotMatch(html,/gtag\('event',name,params\)/);assert.match(html,/window\.gtag\('event',name,safe\)/);});
test('tool selection, completed draw, wheel and sharing instrumented',()=>{assert.match(html,/suTrackEvent\?\.\('tool_selected'/);assert.match(html,/suTrackEvent\?\.\('draw_completed',\{tool:mode,method:'draw'\}\)/);assert.match(html,/suTrackEvent\?\.\('draw_completed',\{tool:'names',method:'wheel'\}\)/);assert.match(html,/suTrackEvent\?\.\('share_clicked'/);});
test('sharing links contain only tool mode and no participants',()=>{assert.match(html,/id="shareToolLink"/);assert.match(html,/new URL\('\/',location\.origin\)/);assert.match(html,/url\.searchParams\.set\('ferramenta',mode\)/);assert.match(html,/navigator\.clipboard\.writeText\(url\.href\)/);});
test('ads, rooms and Pro suppression remain present',()=>{for(const id of ['adBannerSmall','adBannerLarge','roomDraw','roomShare'])assert.ok(html.includes('id="'+id+'"'));assert.match(html,/window\.suSetAdsVisible=update/);assert.match(html,/window\.suSetAdsVisible\?\.\(!active\)/);});
