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
/**
 * Um mapa que saiu da rotação não pode parar a recolha inteira.
 *
 * Aconteceu: o Beach Ball saiu, a fila tinha sido exportada antes de o site
 * saber disso, e a página dele passou a redireccionar. A recolha parou aos 22
 * de 27 — com 21 mapas bons já lidos e cinco por ler — por causa de um mapa que
 * já não existe.
 *
 * E não foi azar: é o que TEM de acontecer sempre que a rotação muda, porque a
 * fila é exportada antes de a rotação nova ser conhecida.
 */
test('a same-origin redirect skips that page and keeps going',async()=>{
  await reset();await send({action:'start'});await tick();
  // A fonte manda-nos para outro sítio do MESMO site: o mapa saiu.
  tabs.get(state().tabId).url='https://brawlscope.com/counters';
  await tick();
  assert.equal(state().running,true,'parou por causa de um mapa que saiu');
  assert.equal(state().cursor,1,'não avançou para a página seguinte');
  assert.match(Object.values(state().errors)[0],/saiu da rotação/);
  await send({action:'pause'});
});

/**
 * Sair do site é outra coisa — um desafio, uma página de entrada — e aí pára-se
 * como sempre. Nunca se navega por cima de um desvio para fora.
 */
test('a cross-origin redirect still pauses instead of navigating around it',async()=>{
  await reset();await send({action:'start'});await tick();
  tabs.get(state().tabId).url='https://outro-sitio.example/challenge';
  await tick();
  assert.equal(state().running,false);
  assert.equal(executions,0);
  assert.equal(state().cursor,0,'avançou apesar do desvio para fora');
});

/** Três redireccionamentos seguidos deixam de ser mapas que saíram. */
test('three redirects in a row stop the run',async()=>{
  // Precisa de uma fila mais longa do que três: com duas páginas a recolha
  // chegaria ao fim antes de acumular os três seguidos, e o teste mediria o fim
  // da fila em vez da regra que quer verificar.
  stored={};tabs.clear();executions=0;
  await send({action:'load',queue:{format:'brawlhibrido-queue-v1',urls:[
    'https://brawlscope.com/counters/bibi','https://brawlscope.com/counters/lou',
    'https://brawlscope.com/counters/gus','https://brawlscope.com/counters/nita',
    'https://brawlscope.com/counters/piper',
  ]}});
  await send({action:'start'});await tick();
  let ciclos=0;
  while(state().running && ciclos++<12){
    const tab=tabs.get(state().tabId);
    if(tab) tab.url='https://brawlscope.com/counters';
    await tick();
  }
  assert.equal(state().running,false);
  assert.match(state().message,/Três páginas seguidas redireccionaram/);
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

/**
 * Um mapa que ENTROU na rotação é recolhido na mesma corrida.
 *
 * O outro lado da moeda do Beach Ball, e o que aconteceu a seguir: a rotação
 * nova entrou no site, certinha, e os dois mapas novos ficaram sem uma única
 * linha do TopBrawl. Só tinham os números do BrawlPlanet, que vêm por outro
 * caminho.
 *
 * A razão é a ordem das coisas. A fila é construída pelo site a partir da
 * rotação que ele CONHECE, e ele só a conhece depois de alguém lha importar.
 * No dia em que a rotação muda, a fila pede os mapas que saíram e não pede os
 * que entraram — sempre, por construção.
 *
 * Isso obrigava a duas corridas. A segunda não se faz: a primeira já disse
 * "Recolha concluída", e quem está ao computador foi à sua vida.
 *
 * O índice vai à frente da fila. Quando é lido, a extensão já sabe quais são os
 * mapas de agora — e é aí que os acrescenta à sua própria fila.
 */
test('a map that entered the rotation is collected in the same run',async()=>{
  stored={};tabs.clear();executions=0;
  // A fila que o site exportou: o índice, e um mapa que já lá estava.
  await send({action:'load',queue:{format:'brawlhibrido-queue-v1',urls:[
    'https://topbrawl.com/rankeds',
    'https://topbrawl.com/rankeds/15000007?rows=106',
  ]}});
  assert.equal(state().urls.length,2);
  await send({action:'start'});await tick();
  // O índice responde com dois mapas que a fila não pedia.
  scriptResult=async()=>({rankedRotation:{url:'https://topbrawl.com/rankeds',capturedAt:new Date().toISOString(),
    html:'<a href="/rankeds/15000007">Velho</a><a href="/rankeds/15000031">Novo A</a><a href="/rankeds/15000032">Novo B</a>'}});
  await tick();
  // Os dois novos entraram na fila; o que já lá estava não foi duplicado.
  assert.equal(state().urls.length,4,`fila ficou com ${state().urls.length}`);
  assert.ok(state().urls.includes('https://topbrawl.com/rankeds/15000031?rows=106'),'o mapa novo não entrou na fila');
  assert.ok(state().urls.includes('https://topbrawl.com/rankeds/15000032?rows=106'),'o segundo mapa novo não entrou na fila');
  assert.equal(state().urls.filter(u=>u.includes('15000007')).length,1,'duplicou um mapa que já lá estava');
  assert.match(state().message,/2 mapa\(s\)/);
  await send({action:'pause'});
});

/** Se a fila já pedia tudo, não se acrescenta nada — e diz-se isso. */
test('an unchanged rotation adds nothing to the queue',async()=>{
  stored={};tabs.clear();executions=0;
  await send({action:'load',queue:{format:'brawlhibrido-queue-v1',urls:[
    'https://topbrawl.com/rankeds',
    'https://topbrawl.com/rankeds/15000007?rows=106',
  ]}});
  await send({action:'start'});await tick();
  scriptResult=async()=>({rankedRotation:{url:'https://topbrawl.com/rankeds',capturedAt:new Date().toISOString(),
    html:'<a href="/rankeds/15000007">Velho</a>'}});
  await tick();
  assert.equal(state().urls.length,2,'acrescentou um mapa que a fila já pedia');
  assert.match(state().message,/já pedia todos/);
  await send({action:'pause'});
});
