import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PendingEdits, inlineRename } from '../public/js/input-editing.js';
import { DataStore } from '../public/js/data-store.js';
import { AutoLayout } from '../public/js/auto-layout.js';
import { TreeCanvas } from '../public/js/tree-canvas.js';
import { MindNodeTextEditor } from '../public/js/mindnode-text.js';
import { SupabaseController } from '../public/js/supabase-controller.js';

test('rapid typing coalesces to one update and save captures the final unexpired draft for its original member',()=>{
  const store=new DataStore();store.loadState({members:[{id:'A',full_name:'Old'},{id:'B',full_name:'Other'}]});
  const edits=new PendingEdits(10000);let events=0;store.subscribe(e=>{if(e==='update')events++;});
  for(const text of ['T','Tr','Trần','Trần An']) edits.queue('name',()=>store.updateMember('A',{full_name:text}));
  assert.equal(events,0);store.selectedMemberId='B';
  const c=new SupabaseController({dataStore:store,flushInspectorEdits:()=>edits.flush()});
  assert.equal(c.capture().members[0].full_name,'Trần An');assert.equal(events,1);assert.equal(store.history.length,1);
  assert.equal(store.getMember('B').full_name,'Other');edits.flush();assert.equal(events,1);
  store.updateMember('A',{full_name:'Trần An'});assert.equal(events,1);
});
test('composition drafts stay queued until composition ends or save explicitly flushes',async()=>{
  const edits=new PendingEdits(5);let value='';
  edits.queue('name',()=>{value='Trần';},false);
  await new Promise(resolve=>setTimeout(resolve,20));assert.equal(value,'');
  edits.queue('name',()=>{value='Trần Ngọc';});
  await new Promise(resolve=>setTimeout(resolve,20));assert.equal(value,'Trần Ngọc');edits.clear();
});
test('inline rename ignores IME Enter, stops bubbling, commits once and restores the label before notifying',()=>{
  const events=[],input={value:'Trần An',addEventListener(){},focus(){},select(){}};
  inlineRename(input,'Old',value=>events.push('saved '+value),()=>events.push('restored'));
  const key=(key,isComposing=false)=>({key,isComposing,stopPropagation(){events.push('stopped');},preventDefault(){}});
  input.onkeydown(key('Enter',true));assert.deepEqual(events,['stopped']);
  input.onkeydown(key('Enter'));input.onkeydown(key('Enter'));
  assert.deepEqual(events,['stopped','stopped','restored','saved Trần An','stopped']);assert.equal(input.onblur,null);
});
test('cancel restores the original label and blur never saves the cancelled value',()=>{
  const input={value:'New',addEventListener(){},focus(){},select(){}};let saved=0,restored=0;
  inlineRename(input,'Old',()=>saved++,()=>restored++);
  input.onkeydown({key:'Escape',stopPropagation(){},preventDefault(){}});
  assert.equal(restored,1);assert.equal(saved,0);assert.equal(input.onblur,null);
});
test('renaming among 346 nodes patches labels without rebuilding layout or outline; structural edits still rebuild',()=>{
  const savedWindow=globalThis.window;globalThis.window={addEventListener(){}};
  try {
    const store=new DataStore();store.loadState({members:Array.from({length:346},(_,i)=>({id:String(i),full_name:'Name '+i,generation:i?2:1,parent_id:i?'0':''}))});
    const counts={layout:0,outline:0,card:0,label:0};
    const canvas=Object.create(TreeCanvas.prototype);Object.assign(canvas,{dataStore:store,setupPanAndZoom(){},setupTouchGestures(){},render(){counts.layout++;},refreshMember(){counts.card++;}});canvas.init();
    const outline=Object.create(MindNodeTextEditor.prototype);Object.assign(outline,{dataStore:store,render(){counts.outline++;},refreshMemberLabels(){counts.label++;}});outline.init();
    store.updateMember('200',{full_name:'Trần Ngọc An'});
    assert.deepEqual(counts,{layout:0,outline:0,card:1,label:1});
    store.updateMember('200',{generation:'3'});
    assert.deepEqual(counts,{layout:1,outline:1,card:1,label:1});
  }finally{if(savedWindow===undefined)delete globalThis.window;else globalThis.window=savedWindow;}
});
test('interactive tree supports compact orthogonal paths in both orientations and optional curved paths',()=>{
  const layout=new AutoLayout(),link={source:{x:0,y:0},target:{x:400,y:300}};
  assert(!layout.generatePath(link).path.includes(' C '));assert.match(layout.generatePath(link).path,/ V .* H /);
  layout.orientation='HORIZONTAL';assert.match(layout.generatePath(link).path,/ H .* V /);
  layout.connectionStyle='CURVED';assert(layout.generatePath(link).path.includes(' C '));
});
