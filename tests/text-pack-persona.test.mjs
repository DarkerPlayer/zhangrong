import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreState} from '../src/state.mjs';
import {importTextPackEntries} from '../src/text-pack-import.mjs';
import {addPersonaCorpus, getActivePersona} from '../src/persona-state.mjs';

const pack={id:'test-pack',title:'雨天',sourceName:'雨天.txt'};
const entry=(id='line-1',text='慢慢来，我在听。')=>({id,text,kind:'dialogue',category:'comfort',speaker:'小雨',source:{chapter:'第一章',paragraph:2,page:1}});

test('selected book entries attach to the specified persona with durable provenance and no new memories',()=>{
  const state=restoreState(null),id=state.activePersonaId,other=Object.keys(state.personas).find(key=>key!==id);
  const result=importTextPackEntries(state,id,{pack,entries:[entry()]});
  assert.equal(result.added,1);
  assert.deepEqual(result.state.personaThreads,state.personaThreads);
  assert.deepEqual(result.state.personas[other],state.personas[other]);
  const saved=restoreState(JSON.stringify(result.state)).personas[id].customCorpora[0];
  assert.equal(saved.sourcePack.id,pack.id);
  assert.equal(saved.sourcePack.entryId,'line-1');
  assert.equal(saved.sourcePack.chapter,'第一章');
  assert.equal(saved.sourcePack.speaker,'小雨');
  assert.equal(saved.text,entry().text);
  assert.equal(saved.category,'comfort');
});

test('reimport and within-batch duplicates do not consume capacity',()=>{
  const state=restoreState(null),id=state.activePersonaId;
  const once=importTextPackEntries(state,id,{pack,entries:[entry(),entry('line-2')]});
  assert.equal(once.added,1);assert.equal(once.duplicates,1);
  const again=importTextPackEntries(once.state,id,{pack,entries:[entry()]});
  assert.equal(again.added,0);assert.equal(again.state,once.state);
});

test('portable dotted entry IDs retain provenance when attached to a persona',()=>{
  const state=restoreState(null),id=state.activePersonaId;
  const result=importTextPackEntries(state,id,{pack,entries:[entry('chapter.1-line.2')]});
  assert.equal(result.state.personas[id].customCorpora[0].sourcePack.entryId,'chapter.1-line.2');
});

test('full persona rejects a batch atomically without evicting old entries',()=>{
  let state=restoreState(null);const id=state.activePersonaId;
  for(let i=0;i<40;i++)state=addPersonaCorpus(state,id,`原有语料${i}`);
  const before=JSON.stringify(state);
  assert.throws(()=>importTextPackEntries(state,id,{pack,entries:[entry()]}),/40|容量/);
  assert.equal(JSON.stringify(state),before);
  assert.equal(getActivePersona(state).customCorpora.length,40);
});

test('invalid or oversized entries and deleted target persona cannot partially import',()=>{
  const state=restoreState(null),id=state.activePersonaId;
  assert.throws(()=>importTextPackEntries(state,'gone',{pack,entries:[entry()]}),/角色/);
  assert.throws(()=>importTextPackEntries(state,id,{pack,entries:[entry(),entry('bad','长'.repeat(241))]}),/240/);
  assert.throws(()=>importTextPackEntries(state,id,{pack,entries:[entry('bad','{unknown}')]}),/占位符/);
  assert.equal(getActivePersona(state).customCorpora.length,0);
});
