import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DataStore } from '../public/js/data-store.js';
import { AutoLayout } from '../public/js/auto-layout.js';
import { Exporter } from '../public/js/export.js';
import { A4, PAGE, planA4, exportFields, scopedMembers, wrapText, withoutStandaloneSpouses, measureCard } from '../public/js/export-layout.js';
import { ExcelParser } from '../public/js/excel-parser.js';
const measure=(text,style)=>[...text].length*style.size*.62;
const storeFor=members=>{const s=new DataStore();s.loadState({lineageInfo:{name:'Dòng họ thử'},members});return s;};
const member=(id,gen,parent_id='',extra={})=>({id,full_name:'Trần Ngọc '+id,generation:gen,parent_id,gender:'Nam',...extra});
function checkGeometry(pages) {
  for (const page of pages) {
    for(const n of page.nodes) {
      assert(n.x>=PAGE.left-.001);assert(n.x+n.width<=A4.w-PAGE.right+.001);
      assert(n.y>=PAGE.top);assert(n.y+n.height<=A4.h-PAGE.bottom+.001);
      for(const line of n.lines) {
        assert(measure(line.text,line)<=line.maxWidth+.001);
        assert(line.y-line.size>=0);assert(line.y<n.height);
        if(line.anchor==='middle') {assert(line.x-line.maxWidth/2>=12-.001);assert(line.x+line.maxWidth/2<=n.width-12+.001);}
        else {assert.equal(line.x,12);assert(line.x+line.maxWidth<=n.width-12+.001);}
      }
    }
    for(const path of page.paths) {
      assert(page.nodes.some(n=>n.member.id===path.parentId));assert(page.nodes.some(n=>n.member.id===path.childId));
      path.points.forEach(([x,y],i)=>{assert(x>=PAGE.left && x<=A4.w-PAGE.right);assert(y>=PAGE.top&&y<=A4.h-PAGE.bottom);if(i){const p=path.points[i-1];assert(x===p[0]||y===p[1]);}});
    }
    for(let i=0;i<page.nodes.length;i++)for(let j=i+1;j<page.nodes.length;j++){
      const a=page.nodes[i],b=page.nodes[j];assert(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'cards overlap');
    }
  }
}
test('A4 overlaps successive pairs, repeats parents for continuation, covers every member and edge without overflowing',()=>{
  const members=[member('ROOT',1),member('SPOUSE',1,'',{gender:'Nữ',spouse_id:'ROOT'}),member('OTHER',1)];
  for(let i=0;i<31;i++) {
    members.push(member('C'+i,2,'ROOT',{sibling_order:30-i,christian_name:'Phanxicô Xaviê',birth_date:'12/08/1955',death_date_solar:'2020-09-10',death_date:'15/08 Âm',lifespan_override:'70',status:'Đã mất'}));
    members.push(member('G'+i,3,'C'+i));
  }
  members.push(member('LAST',4,'G0'),member('ISOLATED',4,'missing',{full_name:'Một người tên rất dài '+ 'Ngọc '.repeat(15)}));
  const store=storeFor(members),pages=planA4(members,store,measure);
  checkGeometry(pages);assert(pages.length>10);
  const ids=new Set(pages.flatMap(p=>p.nodes.map(n=>n.member.id)));assert.equal(ids.size,members.length);
  const pairs=pages.map(p=>p.pair.join('-'));assert(pairs.indexOf('1-2')<pairs.indexOf('2-3'));assert(pairs.indexOf('2-3')<pairs.indexOf('3-4'));
  const edges=pages.flatMap(p=>p.paths.map(e=>e.parentId+':'+e.childId));assert.equal(new Set(edges).size,63);assert.equal(edges.length,63);
  const childOrder=pages.flatMap(p=>p.paths.filter(e=>e.parentId==='ROOT').map(e=>e.childId));assert.deepEqual(childOrder,Array.from({length:31},(_,i)=>'C'+(30-i)));
  assert(pages.some(p=>p.nodes.some(n=>n.member.id==='ROOT'&&n.continued)));
});
test('PDF scopes omit represented standalone spouses while full image scopes keep all records',()=>{
  const s=storeFor([member('A',1,'',{spouse_id:'B',branch:'Chi 1'}),member('B',1,'',{gender:'Nữ',branch:'Chi 1'}),member('C',2,'A',{branch:'Chi 1'}),member('D',3,'C',{branch:'Chi 1'}),member('E',1,'',{branch:'Chi 2'})]);
  const tree={dataStore:s,layout:new AutoLayout(),layoutData:{positions:new Map([['E',{}]])}};
  assert.deepEqual(scopedMembers(tree,'SUBTREE:A',2).map(m=>m.id),['A','B','C']);
  assert.deepEqual(scopedMembers(tree,'CURRENT_VIEW').map(m=>m.id),['E']);
  for(const template of ['card','table']) {
    const pages=Exporter.a4Pages(tree,'Chi 1',template,2);
    const ids=new Set(template==='card'?pages.flatMap(p=>p.nodes.map(n=>n.member.id)):pages.flatMap(p=>p.rows.map(r=>r.member.id)));
    assert.deepEqual([...ids].sort(),['A','C']);
  }
  assert.deepEqual([...Exporter.getExportLayout(tree,'Chi 1',2).positions.keys()].sort(),['A','B','C']);
  assert.equal(scopedMembers(tree,'SUBTREE:missing').length,0);
});
test('content preserves Christian name, separate calendars, manual age, missing dates and escaped text',()=>{
  const m=member('A',1,'',{christian_name:'Giuse',full_name:'A <script>',birth_date:'1930',death_date_solar:'2010',death_date:'20/03 Âm',status:'Đã mất',lifespan_override:85});
  const s=storeFor([m,member('child',2,'A')]); const texts=exportFields(m,s).map(f=>f.text);
  assert(texts.includes('[Giuse] A <script>'));assert(texts.includes('SN 1930'));assert(texts.includes('Mất 2010 (DL)'));assert(texts.includes('Giỗ 20/03 (ÂL)'));assert(texts.includes('Hưởng thọ 85 tuổi'));
  const page=Exporter.a4Pages({dataStore:s},'ALL')[0];const svg=Exporter.a4PageSVG({dataStore:s},page,1,1);
  assert(svg.includes('&lt;script&gt;'));assert(!svg.includes('<script>'));
  assert(exportFields(member('B',1,'',{status:'Đã mất'}),s).some(f=>f.text==='Hưởng thọ chưa rõ'));
  assert(!exportFields(member('C',1),s).some(f=>f.text.startsWith('Hưởng thọ')));
});
test('wrapping preserves all characters without ellipsis, including oversized single words',()=>{
  for(const text of ['Tên thánh và họ tên rất dài','X'.repeat(200)]) {
    const lines=wrapText(text,80,s=>s.length*6);
    assert(lines.every(s=>s.length*6<=80));assert.equal(lines.join('').replace(/\s/g,''),text.replace(/\s/g,''));
  }
});
test('CSV preserves raw dates, independent age override, spouse IDs and sibling order on import',async()=>{
  const s=storeFor([member('A',1,'',{christian_name:'Giuse',spouse_id:'B',spouse:'Trần Thị B',birth_date:'1930',death_date:'20/03 Âm',death_date_solar:'2010',lifespan_override:'',sibling_order:2,notes:'"Một", hai\nba'}),member('B',1)]);
  let blob;const old=Exporter.downloadBlob;Exporter.downloadBlob=value=>blob=value;
  try {Exporter.exportCSV({dataStore:s});}finally{Exporter.downloadBlob=old;}
  const text=await blob.text(),parsed=ExcelParser.parseGenealogyData(text);
  assert(parsed.success);const m=parsed.members[0];
  assert.equal(m.death_date,'20/03 Âm');assert.equal(m.death_date_solar,'2010');assert.equal(m.lifespan_override,'');assert.equal(m.spouse_id,'B');assert.equal(m.sibling_order,2);assert.equal(m.notes,'"Một", hai\nba');
  assert(text.includes('80')); // computed age exported without freezing it as manual input
});
test('PDF xref offsets and page transforms use A4 points rather than per-pixel scale',async()=>{
  const blob=Exporter.createMultiPagePdfBlob(Array.from({length:3},()=>({dataUrl:'data:image/jpeg;base64,/9j/2Q==',width:3508,height:2481})),A4);
  const text=await blob.text();assert.match(text,/\/Count 3/);assert.match(text,/841\.\d+ 0 0 595\.\d+/);
  const lines=text.slice(text.indexOf('xref\n')).split('\n');
  const bytes=new Uint8Array(await blob.arrayBuffer());const decode=new TextDecoder();
  for(let i=1;i<12;i++) {const offset=Number(lines[2+i].slice(0,10));assert(decode.decode(bytes.slice(offset,offset+20)).startsWith(`${i} 0 obj`));}
  assert.equal((text.match(/\/Type \/Page /g)||[]).length,3);
});
test('print and PDF consume identical A4 pages; print popup opens before awaiting fonts',async()=>{
  const store=storeFor([member('A',1),member('B',2,'A'),member('C',3,'B')]),tree={dataStore:store};
  const original={window:globalThis.window,document:globalThis.document,ready:Exporter.ready};
  const events=[];const printed={head:{append(){}},body:{innerHTML:''},write(){},close(){},createElement(){return {};}};
  const win={document:printed,focus(){},print(){events.push('print');},close(){events.push('close');}};
  globalThis.window={open(){events.push('open');return win;}};
  Exporter.ready=async()=>{events.push('fonts');};
  try {
    const count=await Exporter.printA4(tree);
    assert.equal(count,1);assert.deepEqual(events,['open','fonts','print']);
    const pages=Exporter.a4Pages(tree);
    const expected=pages.map((p,i)=>`<section class="a4-page">${Exporter.a4PageSVG(tree,p,i+1,pages.length)}</section>`).join('');
    assert.equal(printed.body.innerHTML,expected);
  }finally{Exporter.ready=original.ready;if(original.window===undefined)delete globalThis.window;else globalThis.window=original.window;if(original.document===undefined)delete globalThis.document;else globalThis.document=original.document;}
});
test('346 members with many roots, spouses and eight generations retain complete coverage and bounded geometry',()=>{
  const members=Array.from({length:346},(_,i)=>{
    const parent=i<6?'':String(Math.floor((i-6)/3));
    const gen=i<6?1:i<24?2:i<78?3:i<240?4:5;
    return member(String(i),gen,parent,{christian_name:i%2?'Maria':'Giuse',gender:i%2?'Nữ':'Nam',birth_date:'1940',death_date_solar:i%3?'':'2010',branch:'Chi '+(i%2+1)});
  });
  // Deepen a separate path, preserving direct parent references.
  members[0].spouse_id='1';members[1].spouse_id='0';
  for(let i=339;i<346;i++){members[i].parent_id=String(i===339?0:i-1);members[i].generation=i-337;}
  const store=storeFor(members),pages=planA4(scopedMembers({dataStore:store}),store,measure);
  checkGeometry(pages);
  assert.equal(new Set(pages.flatMap(p=>p.nodes.map(n=>n.member.id))).size,346);
  assert.equal(pages.flatMap(p=>p.paths).length,340);
});
test('printed nodes hide identifiers, combine saint/name and include complete spouse dates with symmetric content padding',()=>{
  const store=storeFor([member('P001',1,'',{christian_name:'Giuse',spouse_id:'P002'}),member('child',2,'P001'),member('P002',1,'',{christian_name:'Maria',gender:'Nữ',birth_date:'1935',death_date_solar:'2015',status:'Đã mất'})]);
  const fields=exportFields(store.getMember('P001'),store);
  assert(fields.some(f=>f.kind==='name'&&f.text==='[Giuse] Trần Ngọc P001'));
  assert(!fields.find(f=>f.kind==='badge').text.includes('P001'));
  assert(fields.some(f=>f.text==='Vợ: [Maria] Trần Ngọc P002 · SN 1935 - Mất 2015'));
  const pages=Exporter.a4Pages({dataStore:store});
  const card=pages[0].nodes.find(n=>n.member.id==='P001');
  assert(card.lines.every(l=>measure(l.text,l)<=card.width-24));
  const table=Exporter.a4Pages({dataStore:store},'ALL','table');
  assert.equal(table[0].headings[0],'Đời');assert(!table[0].rows[0].cells[0].join('').includes('P001'));
});
test('A4 fits four child cards per row, centers header text beside the avatar and retains readable type',()=>{
  const store=storeFor([member('A',1,'',{christian_name:'Giuse',branch:'Chi 1'}),...Array.from({length:9},(_,i)=>member('C'+i,2,'A',{christian_name:'Maria',birth_date:'1990'}))]);
  const pages=Exporter.a4Pages({dataStore:store});checkGeometry(pages);
  const blocks=pages.flatMap(p=>p.blocks).filter(b=>b.parent?.member.id==='A');
  assert.deepEqual(blocks.map(b=>b.children.length),[4,4,1]);
  assert.deepEqual(pages.flatMap(p=>p.paths.map(p=>p.childId)),Array.from({length:9},(_,i)=>'C'+i));
  const card=pages[0].nodes[0],heading=card.lines.filter(l=>['badge','name'].includes(l.kind));
  assert(heading.every(l=>l.anchor==='middle' && l.x>card.avatar.x+card.avatar.size));
  assert.equal(card.avatar.y+card.avatar.size/2,12+card.headerHeight/2);
  const lastBadge=heading.filter(l=>l.kind==='badge').at(-1),firstName=heading.find(l=>l.kind==='name');
  assert(firstName.y-firstName.size-lastBadge.y>=6);
  assert(card.lines.filter(l=>l.kind==='name').every(l=>l.size===12));
});
test('PDF omits standalone records and retains spouse details and ancestors',()=>{
  const members=[member('A',1,'',{spouse_id:'B',christian_name:'Giuse'}),member('B',1,'',{spouse_id:'A',christian_name:'Maria',gender:'Nữ',birth_date:'1930',death_date_solar:'2010'}),member('C',2,'A'),member('OTHER',1)];
  const store=storeFor(members),before=JSON.stringify(store.getAllMembers());
  const pdf=withoutStandaloneSpouses(scopedMembers({dataStore:store}),store);
  assert.deepEqual(pdf.map(m=>m.id),['A','OTHER','C']);
  const pages=Exporter.a4Pages({dataStore:store});assert(!pages.some(p=>p.nodes.some(n=>n.member.id==='B')));
  const a=pages.flatMap(p=>p.nodes).find(n=>n.member.id==='A');
  assert(a.lines.filter(l=>l.kind==='detail').map(l=>l.text).join(' ').includes('Vợ: [Maria] Trần Ngọc B · SN 1930 - Mất 2010'));
  assert.deepEqual([...Exporter.getExportLayout({dataStore:store},'ALL',0,true).positions.keys()].sort(),['A','C']);
  assert.deepEqual([...Exporter.getExportLayout({dataStore:store}).positions.keys()].sort(),['A','B','C','OTHER']);
  const selected=Exporter.a4Pages({dataStore:store},'SUBTREE:B');assert(!selected.some(p=>p.nodes.some(n=>n.member.id==='B')));
  assert.equal(JSON.stringify(store.getAllMembers()),before);
  const withChild=storeFor([...members,member('D',2,'B')]);assert(withoutStandaloneSpouses(withChild.getAllMembers(),withChild).some(m=>m.id==='B'));
  const withParent=storeFor(members.map(m=>m.id==='B'?{...m,parent_id:'OTHER'}:m));assert(withoutStandaloneSpouses(withParent.getAllMembers(),withParent).some(m=>m.id==='B'));
});
test('isolated reciprocal or legacy one-way spouse pairs retain one card, never drop both',()=>{
  for(const links of [{a:'B',b:'A'},{a:'',b:'A'},{a:'B',b:''}]){
    const store=storeFor([member('A',1,'',{spouse_id:links.a}),member('B',1,'',{spouse_id:links.b})]);
    const kept=withoutStandaloneSpouses(store.getAllMembers(),store);
    assert.equal(kept.length,1);assert(store.getSpouseMember(kept[0].id));
  }
  const alone=storeFor([member('B',1,'',{spouse_id:'missing'})]);assert.equal(withoutStandaloneSpouses(alone.getAllMembers(),alone).length,1);
});
test('very long headers/details use fewer columns when needed without shrinking text or clipping',()=>{
  const store=storeFor([member('A',1,'',{full_name:'Trần '+ 'Tên '.repeat(30),spouse:'Maria '+ 'Phối '.repeat(25)}),...Array.from({length:4},(_,i)=>member('C'+i,2,'A',{full_name:'Trần '+ 'Ngọc '.repeat(30)}))]);
  const pages=Exporter.a4Pages({dataStore:store});checkGeometry(pages);
  const blocks=pages.flatMap(p=>p.blocks);assert(blocks[0].children.length<4);
  assert(new Set(pages.flatMap(p=>p.nodes.map(n=>n.member.id))).size===5);
  assert(pages.flatMap(p=>p.nodes).every(n=>n.lines.filter(l=>l.kind==='name').every(l=>l.size===12)));
});

test('PDF finishes each branch before the next and keeps links from shared parents', () => {
  const store = storeFor([
    member('root', 1, '', { branch: 'Ngành II' }),
    member('b2', 2, 'root', { branch: 'Chi 2' }),
    member('a2', 2, 'root', { branch: 'Chi 1' }),
    member('a3', 3, 'a2', { branch: 'Chi 1' }),
    member('b3', 3, 'b2', { branch: 'Hạ Chi (Chi 2)' }),
    member('other', 2, '', { branch: 'Dữ liệu chi chưa chuẩn hóa' })
  ]);
  const tree = { dataStore: store };
  const pages = Exporter.a4Pages(tree);
  assert.deepEqual(pages.map(page => page.branch), ['Ngành II', 'Chi 1', 'Chi 2']);
  assert.deepEqual(pages.flatMap(page => page.paths.map(path => [path.parentId, path.childId])),
    [['root', 'a2'], ['a2', 'a3'], ['root', 'b2'], ['b2', 'b3']]);
  checkGeometry(pages);
  assert.match(Exporter.a4PageSVG(tree, pages[1], 2, pages.length), /Chi 1 · Đời 1–3/);
  const table = Exporter.a4Pages(tree, 'ALL', 'table');
  assert.deepEqual(table.flatMap(page => page.rows.map(row => row.member.id)),
    ['root', 'a2', 'a3', 'b2', 'b3']);
  const { svg } = Exporter.fullTreeSVG(tree, 'ALL', 0, true);
  const markers = ['a2', 'a3', 'b2', 'b3'].map(id => svg.indexOf('data-member-id="' + id + '"'));
  assert(markers.every(value => value >= 0));
  assert(Math.max(...markers.slice(0, 2)) < Math.min(...markers.slice(2)));
});

test('late-added descendants follow their parent branch and the last generation fits below it', () => {
  const dataStore = storeFor([
    member('P001', 7),
    member('P002', 8, 'P001', { full_name: 'Trần Ngọc Hạnh' }),
    member('P003', 8, 'P001'),
    member('P004', 9, 'P003'),
    member('P999', 9, 'P002', { full_name: 'Trần Ngọc Hiền' }),
    member('P998', 9)
  ]);
  const tree = { dataStore };
  const pages = Exporter.a4Pages(tree);
  checkGeometry(pages);
  const page = pages.find(p => p.paths.some(path => path.childId === 'P999'));
  const parentRow = page.blocks.find(block => block.children.some(card => card.member.id === 'P002'));
  const finalRow = page.blocks.find(block => block.children.some(card => card.member.id === 'P999'));
  assert(finalRow.y > parentRow.y);
  assert.deepEqual(page.pair, [7, 9]);
  const paths = pages.flatMap(p => p.paths);
  assert(paths.findIndex(path => path.childId === 'P999') < paths.findIndex(path => path.childId === 'P004'));
  assert(!pages.some(p => p.nodes.some(card => card.member.id === 'P998')));
  const rows = Exporter.a4Pages(tree, 'ALL', 'table').flatMap(p => p.rows);
  assert.deepEqual(rows.map(row => row.member.id), ['P001', 'P002', 'P999', 'P003', 'P004']);
  assert(!Exporter.fullTreeSVG(tree, 'ALL', 0, true).svg.includes('data-member-id="P998"'));
});

test('new members use the Trần Ngọc default and children inherit the parent chi', () => {
  const dataStore = storeFor([member('P001', 7, '', { branch: 'Chi 2' })]);
  const child = dataStore.addMember({ parent_id: 'P001' });
  assert.equal(child.full_name, 'Trần Ngọc');
  assert.equal(child.generation, '8');
  assert.equal(child.branch, 'Chi 2');
  const partner = dataStore.addSpouseAsMember(child.id);
  assert.equal(partner.full_name, 'Trần Ngọc');
  assert.equal(partner.role, 'Vợ/chồng');
  assert.equal(dataStore.addMember({}).full_name, 'Trần Ngọc');
});
