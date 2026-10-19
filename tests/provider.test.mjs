import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { validateEndpoint, chatCompletion } from '../electron/provider.mjs';
test('rejects unencrypted remote URLs and credentials embedded in endpoints',()=>{
  assert.equal(validateEndpoint('http://127.0.0.1:1234/v1/'),'http://127.0.0.1:1234/v1');
  assert.throws(()=>validateEndpoint('http://example.com/v1'));assert.throws(()=>validateEndpoint('https://key:secret@example.com/v1'));assert.throws(()=>validateEndpoint('file:///etc/passwd'));
});
test('compatible API sends model and messages; errors do not expose server bodies',async t=>{
  let received;let fail=false;
  const server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;received={url:req.url,headers:req.headers,body:JSON.parse(body)};
    if(fail){res.writeHead(401);res.end('secret-provider-response');return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'CẢNH 1 — Biển'}}]}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const args={baseUrl:`http://127.0.0.1:${server.address().port}/v1`,key:'test-key',model:'test-model',messages:[{role:'user',content:'Viết phim'}]};
  assert.equal(await chatCompletion(args),'CẢNH 1 — Biển');assert.equal(received.url,'/v1/chat/completions');assert.equal(received.headers.authorization,'Bearer test-key');assert.equal(received.body.model,'test-model');
  fail=true;await assert.rejects(chatCompletion(args),error=>error.message.includes('401')&&!error.message.includes('secret-provider-response'));
});
