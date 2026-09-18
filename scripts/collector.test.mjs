import {test} from 'node:test';
import assert from 'node:assert/strict';
const listeners={}; let stored={}; let nextId=1; const tabs=new Map(); let scriptResult; let executions=0;
globalThis.chrome={
  storage:{local:{get:async key=>({[key]:structuredClone(stored[key])}),set:async data=>Object.assign(stored,structuredClone(data))}},
  alarms:{create:async()=>{},clear:async()=>{},onAlarm:{addListener:fn=>listeners.alarm=fn}},
  tabs:{onUpdated:{addListener:fn=>listeners.updated=fn},create:async({url})=>{const tab={id:nextId++,url,status:'complete'};tabs.set(tab.id,tab);return {...tab};},get:async id=>{if(!tabs.has(id))throw Error('closed');return {...tabs.get(id)};},update:async(id,update)=>{Object.assign(tabs.get(id),update);return {...tabs.get(id)};}},
  action:{onClicked:{addListener:fn=>listeners.action=fn}},
  runtime:{id:'fixture',getURL:path=>'chrome-extension://fixture/'+path,onStartup:{addListener:fn=>listeners.startup=fn},onMessage:{addListener:fn=>listeners.message=fn}},
  scripting:{executeScript:async()=>{executions++;return [{result:await scriptResult()}];}},
};
await import('../client/public/brawlscope-helper/worker.js');
const send=message=>new Promise(resolve=>listeners.message(message,{id:'fixture',url:'chrome-extension://fixture/panel.html'},resolve));
const state=()=>stored['brawl-v54-queue'];
const flush=()=>new Promise(resolve=>setTimeout(resolve,10));
const tick=async()=>{listeners.alarm({name:'brawl-v54-next'});await flush();};
const urls=['https://brawlscope.com/counters/bibi','https://brawlscope.com/counters/lou'];
async function reset(){stored={};tabs.clear();executions=0;await send({action:'load',queue:{format:'brawlhibrido-queue-v1',urls}});}
test('durable queue captures one profile, advances and can resume after restart',async()=>{
  await reset();scriptResult=async()=>({profile:{brawler:'Bibi',view:'overall',rows:[]}});
  await send({action:'start'});await tick();assert.equal(executions,0);await tick();
  assert.equal(state().cursor,1);assert.equal(Object.keys(state().profiles).length,1);assert.equal(tabs.get(state().tabId).url,urls[1]);
  await listeners.startup();assert.equal(state().running,false);assert.equal(state().cursor,1);
  await send({action:'start'});scriptResult=async()=>({profile:{brawler:'Lou',view:'overall',rows:[]}});await tick();await tick();
  assert.equal(state().running,false);assert.equal(state().cursor,2);assert.equal(Object.keys(state().profiles).length,2);
});
/**
 * Uma verificação da fonte é um "agora não", e não o fim da recolha.
 *
 * Antes parava tudo à primeira. Numa fila de 27 páginas isso significou parar
 * na terceira e não recolher mais nada nessa sessão, com a recolha à espera de
 * alguém voltar ao computador.
 *
 * O que NÃO pode mudar, e é o que este teste guarda: depois de um bloqueio
 * nunca se passa à página seguinte, nunca se navega para outro lado, e não se
 * tenta outra vez já a seguir. Espera-se.
 */
test('403 waits on the same page instead of advancing or navigating away',async()=>{
  await reset();await send({action:'start'});await tick();scriptResult=async()=>({blocked:true,sinal:'just a moment',error:'403'});await tick();
  // Não avançou, não mudou de página, e registou o sinal exato.
  assert.equal(state().cursor,0);
  assert.equal(tabs.get(state().tabId).url,urls[0]);
  assert.equal(state().ultimoBloqueio.sinal,'just a moment');
  // Fica à espera, em vez de desistir — e a espera é real.
  assert.equal(state().running,true);
  assert.ok(state().esperarAte>Date.now()+60000,'a espera tem de ser de minutos, não de segundos');
  // E enquanto espera não bate outra vez à porta.
  const antes=executions; await tick(); await tick();
  assert.equal(executions,antes,'tentou de novo durante a espera');
  await send({action:'pause'});
});

/** Três recusas seguidas são para levar a sério: aí sim, a recolha para. */
test('repeated blocks eventually stop the run instead of retrying forever',async()=>{
  await reset();await send({action:'start'});await tick();
  scriptResult=async()=>({blocked:true,sinal:'just a moment',error:'403'});
  // Cada ciclo de bloqueio gasta dois ticks: um para recarregar a página, outro
  // para a ler. Adianta-se o relógio da espera para não esperar minutos a sério.
  let ciclos=0;
  while(state().running && ciclos++<20){
    const s=state();
    if(s.esperarAte){stored['brawl-v54-queue']={...s,esperarAte:Date.now()-1};}
    await tick();
  }
  assert.ok(ciclos<20,'a recolha nunca parou');
  assert.equal(state().running,false);
  assert.equal(state().cursor,0);
  assert.match(state().message,/Exporta o que já foi recolhido/);
});
test('pause during capture prevents committing or starting next page',async()=>{
  await reset();await send({action:'start'});await tick();let finish;scriptResult=()=>new Promise(resolve=>finish=resolve);
  listeners.alarm({name:'brawl-v54-next'});await flush();await send({action:'pause'});finish({profile:{brawler:'Bibi'}});await flush();
  assert.equal(state().running,false);assert.equal(state().cursor,0);assert.equal(Object.keys(state().profiles).length,0);
});
test('unexpected redirect pauses rather than navigating around it',async()=>{
  await reset();await send({action:'start'});await tick();tabs.get(state().tabId).url='https://brawlscope.com/challenge';await tick();assert.equal(state().running,false);assert.equal(executions,0);
});

/**
 * O que este teste quer provar: uma página que acaba de carregar acorda a
 * recolha SEM esperar pelo alarme de 30 segundos.
 *
 * Media-o contando execuções e exigindo exatamente uma ao fim de 2,2 segundos.
 * Isso nunca podia funcionar: a pausa entre páginas são 250 ms, por isso a
 * recolha avança legitimamente para a página seguinte muito antes disso, e a
 * segunda execução é a página 2 — comportamento certo, contado como falha.
 *
 * Confirmei-o instrumentando o capturador: as duas execuções visitam páginas
 * diferentes, a primeira e a segunda da fila. Não havia captura repetida.
 *
 * Agora mede-se o que interessa: quanto TEMPO passou até a recolha avançar. Se
 * tivesse esperado pelo alarme, teria demorado 30 segundos.
 */
test('completed page wakes collection without waiting for an alarm',async()=>{
  await reset(); scriptResult=async()=>({profile:{brawler:'Bibi',view:'overall',rows:[]}});
  await send({action:'start'}); await tick();
  const comecou=Date.now();
  listeners.updated(state().tabId,{status:'complete'});
  await new Promise(resolve=>setTimeout(resolve,600));
  assert.ok(state().cursor>=1,`a recolha não avançou: cursor ${state().cursor}`);
  assert.ok(Date.now()-comecou<5000,'avançou, mas só depois de esperar pelo alarme');
  // E nenhuma página foi capturada duas vezes: uma execução por página visitada.
  assert.ok(executions<=state().cursor+1,`execuções a mais: ${executions} para cursor ${state().cursor}`);
  await send({action:'pause'});
});
