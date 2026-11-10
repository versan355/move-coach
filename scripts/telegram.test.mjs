import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../lib/telegram.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {validateInitData,constantEqual}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const now=1800000000000,token='test-token-for-unit-tests';
function signed(overrides={}){const p=new URLSearchParams({auth_date:String(now/1000),query_id:'test-query',user:JSON.stringify({id:123456789,first_name:'Анна'}),...overrides});const data=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');const secret=createHmac('sha256','WebAppData').update(token).digest();p.set('hash',createHmac('sha256',secret).update(data).digest('hex'));return p.toString()}
test('valid Telegram data yields a stable server-side identity',async()=>assert.deepEqual(await validateInitData(signed(),token,now),{owner:'tg:123456789',name:'Анна',telegramId:'123456789'}));
test('tampered identity is rejected',async()=>{const p=new URLSearchParams(signed());p.set('user',JSON.stringify({id:1,first_name:'Fake'}));await assert.rejects(()=>validateInitData(p.toString(),token,now),e=>e.status===401)});
test('expired and future-dated sessions are rejected',async()=>{await assert.rejects(()=>validateInitData(signed({auth_date:String(now/1000-3601)}),token,now));await assert.rejects(()=>validateInitData(signed({auth_date:String(now/1000+31)}),token,now))});
test('duplicate fields cannot override a signed identity',async()=>assert.rejects(()=>validateInitData(signed()+'&user=%7B%7D',token,now)));
test('missing user and invalid signature are rejected',async()=>{await assert.rejects(()=>validateInitData(signed({user:'null'}),token,now));await assert.rejects(()=>validateInitData(signed(),'wrong-token',now));await assert.rejects(()=>validateInitData('',token,now))});
test('comparison handles different lengths and content',()=>{assert.equal(constantEqual('abc','abc'),true);assert.equal(constantEqual('abc','abcd'),false);assert.equal(constantEqual('abc','abd'),false)});
