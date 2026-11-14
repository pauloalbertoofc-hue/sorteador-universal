import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('four starter models are available',()=>{for(const key of ['raffle100','classroom','groups','coin']){assert.match(html,new RegExp('data-starter="'+key+'"'));assert.match(html,new RegExp(key+':\\{tool:'));}});
test('only a fixed model key is shared, never entered participants or results',()=>{assert.match(html,/Object\.hasOwn\(starterModels,key\)/);assert.match(html,/url\.searchParams\.set\('modelo',activeStarter\)/);assert.doesNotMatch(html,/url\.searchParams\.set\('items'/);assert.doesNotMatch(html,/url\.searchParams\.set\('players'/);});
test('starter link can be opened, and model never auto-draws',()=>{assert.match(html,/if\(requestedStarter\)applyStarter\(requestedStarter\)/);assert.match(html,/Confira os campos antes de sortear/);assert.match(html,/shareStarterLink/);});
test('existing ads, rooms, Pro and GA4 consent are preserved',()=>{for(const name of ['adBannerSmall','adBannerLarge','roomShare','roomDraw','suSetAdsVisible','su-ga4-consent-v1','G-WLPLRWSBE6'])assert.ok(html.includes(name),name);});
