// Export geometry is independent of the interactive canvas and its curved paths.
import { lifespanAge, spouseDetails, displayName } from './member-presentation.js';
import { compareSiblings } from './member-order.js';

export const A4 = Object.freeze({ w: 297 * 72 / 25.4, h: 210 * 72 / 25.4 });
export const PAGE = Object.freeze({ left: 34, right: 34, top: 88, bottom: 38, gap: 14, cardWidth: 180, connectorGap: 28, blockGap: 20 });
const known = value => {
  const text = String(value ?? '').trim();
  return /^(?:[-?–—]+|không rõ|chưa rõ|unknown|null)$/i.test(text) ? '' : text;
};
export const generation = m => Number.parseInt(m.generation, 10) || 1;
export function parentCaption(member, store, branch = '') {
  if (!member) return '';
  const parent = store.getMember(member.parent_id);
  const parentName = known(parent?.full_name) || known(member.parent_name);
  if (!parentName) return '';
  const partner = parent && store.getSpouseMember(parent.id);
  const partnerName = known(partner?.full_name) || known(parent?.spouse);
  const names = [...new Set([parentName, partnerName].filter(Boolean))].join(' - ');
  return [`Đời ${generation(member)}`, known(member.branch) || branch, `Con Ông/bà: ${names}`]
    .filter(Boolean).join(' · ');
}
export function exportFields(member, store) {
  const birth = known(member.birth_date).replace(/^SN\s*/i, '');
  const solar = known(member.death_date_solar);
  const lunar = known(member.death_date);
  const died = solar || lunar || ['Đã mất', 'Mất sớm'].includes(member.status);
  const age = lifespanAge(member);
  const spouse = spouseDetails(member, store);
  return [
    { kind: 'badge', text: `Đời ${generation(member)}${member.branch ? ' · ' + member.branch : ''}` },
    { kind: 'name', text: displayName(member) },
    ...(birth ? [{ kind: 'detail', text: `SN ${birth}` }] : []),
    ...(solar ? [{ kind: 'detail', text: `Mất ${solar} (DL)` }] : []),
    ...(lunar && !/^(?:mất sớm|đã mất|mất)$/i.test(lunar) ? [{ kind: 'detail', text: `Giỗ ${lunar.replace(/\s*(?:âm lịch|âm|ÂL)$/i, '')} (ÂL)` }] : []),
    ...(!solar && (!lunar || /^(?:mất sớm|đã mất|mất)$/i.test(lunar)) && died ? [{ kind: 'detail', text: member.status === 'Mất sớm' || /^mất sớm$/i.test(lunar) ? 'Mất sớm' : 'Mất: chưa rõ ngày' }] : []),
    ...(died ? [{ kind: 'detail', text: age === null ? 'Hưởng thọ(chưa rõ)' : `Hưởng thọ ${age} tuổi` }] : []),
    ...(spouse ? [{ kind: 'detail', text: spouse }] : []),
    ...(member.role && member.role !== 'Thành viên' ? [{ kind: /^đích tôn$/i.test(member.role.trim()) ? 'heir' : 'detail', text: member.role.replace(/phối ngẫu/gi, 'Vợ/chồng') }] : [])
  ];
}

export function scopedMembers(tree, scope = 'ALL', maxDepth = 0) {
  const store = tree.dataStore;
  let members = store.getAllMembers();
  if (scope === 'CURRENT_VIEW') {
    const ids = new Set(tree.layoutData?.positions.keys() || []);
    members = members.filter(m => ids.has(m.id));
  } else if (scope.startsWith('SUBTREE:')) {
    const root = scope.slice(8);
    if (!store.getMember(root)) return [];
    const ids = store.getDescendants(root); ids.add(root);
    // Spouse nodes carry their own dates; keep them with the selected family.
    for (const id of [...ids]) { const spouse = store.getSpouseMember(id); if (spouse) ids.add(spouse.id); }
    members = members.filter(m => ids.has(m.id));
  } else if (scope === 'Chi 1' || scope === 'Chi 2') {
    members = members.filter(m => m.branch === scope || m.branch === 'Ngành II');
  } else if (scope === 'PATERNAL_ONLY') members = members.filter(m => m.branch_type?.includes('Nội tộc'));
  else if (scope === 'MATERNAL_ONLY') members = members.filter(m => m.branch_type?.includes('Ngoại tộc'));
  if (maxDepth > 0 && members.length) {
    const first = Math.min(...members.map(generation));
    members = members.filter(m => generation(m) - first < maxDepth);
  }
  return [...members].sort((a, b) => generation(a) - generation(b) || compareSiblings(a, b));
}

export function pdfMembers(tree, scope, maxDepth) {
  const store = tree.dataStore;
  const parentIds = new Set(store.getAllMembers().map(member => member.parent_id));
  const members = scopedMembers(tree, scope, maxDepth).filter(member =>
    store.getMember(member.parent_id) || parentIds.has(member.id));
  return withoutStandaloneSpouses(members, store, scope.startsWith('SUBTREE:') ? scope.slice(8) : null);
}

function familyChildren(members) {
  const children = new Map();
  for (const member of members) {
    if (!children.has(member.parent_id)) children.set(member.parent_id, []);
    children.get(member.parent_id).push(member);
  }
  for (const siblings of children.values()) siblings.sort(compareSiblings);
  return children;
}

function familyOrder(members) {
  const children = familyChildren(members);
  const ids = new Set(members.map(member => member.id));
  const visited = new Set();
  const order = [];
  function visit(member) {
    if (visited.has(member.id)) return;
    visited.add(member.id);
    order.push(member);
    for (const child of children.get(member.id) || []) visit(child);
  }
  for (const member of members) if (!ids.has(member.parent_id)) visit(member);
  for (const member of members) visit(member);
  return order;
}

export function pdfBranchSections(members) {
  const sections = new Map();
  const byId = new Map(members.map(member => [member.id, member]));
  function branchOf(member) {
    const visited = new Set();
    for (let current = member; current && !visited.has(current.id); current = byId.get(current.parent_id)) {
      visited.add(current.id);
      const value = String(current.branch ?? '').trim();
      const number = value.match(/^chi\s*(\d+)\b|\(chi\s*(\d+)\)/i);
      if (number) return `Chi ${Number(number[1] || number[2])}`;
      if (value.toLowerCase() === 'ngành ii') return 'Ngành II';
    }
    return '';
  }
  for (const member of members) {
    const branch = branchOf(member);
    if (!sections.has(branch)) sections.set(branch, []);
    sections.get(branch).push(member);
  }
  const rank = branch => branch === 'Ngành II' ? 0 : branch ? 1 : 2;
  const branches = [...sections.keys()].sort((a, b) =>
    rank(a) - rank(b) || a.localeCompare(b, 'vi', { numeric: true }));
  if (branches.filter(branch => rank(branch) === 1).length < 2) {
    return [{ label: '', members, context: [] }];
  }
  return branches.map(branch => {
    const branchMembers = sections.get(branch);
    const ids = new Set(branchMembers.map(member => member.id));
    const parentIds = new Set(branchMembers.map(member => member.parent_id));
    const context = [...parentIds]
      .filter(id => byId.has(id) && !ids.has(id))
      .map(id => byId.get(id));
    return { label: branch || 'Chưa phân chi', members: branchMembers, context };
  });
}

export function wrapText(text, width, measure) {
  const lines = []; let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const candidate = line ? line + ' ' + word : word;
    if (measure(candidate) <= width) { line = candidate; continue; }
    if (line) { lines.push(line); line = ''; }
    for (const char of word) {
      if (line && measure(line + char) > width) { lines.push(line); line = ''; }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines;
}
export const fontFor = kind => kind === 'name' ? { size: 12, weight: 'bold', line: 15 } : kind === 'badge' ? { size: 8, weight: 'bold', line: 11 } : { size: 9, weight: ['saint', 'heir'].includes(kind) ? 'bold' : 'normal', line: 12 };
export function measureCard(member, store, width, measure) {
  const padding = 12, avatarSize = 34, avatarGap = 10, headingGap = 6, detailGap = 10;
  const headerX = padding + avatarSize + avatarGap;
  const headerWidth = width - headerX - padding;
  const fields = exportFields(member, store);
  const wrap = (field, maxWidth) => {
    const style = fontFor(field.kind);
    return wrapText(field.text, maxWidth, text => measure(text, style)).map(text => ({ text, kind: field.kind, ...style, maxWidth }));
  };
  const badges = fields.filter(f => f.kind === 'badge').flatMap(f => wrap(f, headerWidth));
  const names = fields.filter(f => f.kind === 'name').flatMap(f => wrap(f, headerWidth));
  const headingHeight = badges.reduce((h,l) => h+l.line, 0) + headingGap + names.reduce((h,l) => h+l.line, 0);
  const headerHeight = Math.max(avatarSize, headingHeight);
  let cursor = padding + (headerHeight - headingHeight) / 2;
  const lines = [];
  for (const line of badges) { lines.push({ ...line, x: headerX + headerWidth / 2, y: cursor + line.size, anchor: 'middle' }); cursor += line.line; }
  cursor += headingGap;
  for (const line of names) { lines.push({ ...line, x: headerX + headerWidth / 2, y: cursor + line.size, anchor: 'middle' }); cursor += line.line; }
  cursor = padding + headerHeight + detailGap;
  const details = fields.filter(f => !['badge','name'].includes(f.kind)).flatMap(f => wrap(f, width - padding * 2));
  for (const line of details) {
    const lineHeight = 14;
    lines.push({ ...line, line: lineHeight, x: padding, y: cursor + line.size, anchor: 'start' }); cursor += lineHeight;
  }
  return { member, width, height: Math.max(94, cursor + padding), lines,
    avatar: { x: padding, y: padding + (headerHeight - avatarSize) / 2, size: avatarSize }, headerHeight };
}

// Omit only isolated spouse cards whose details appear in a retained partner's
// card. Keep people with their own parent/children, unrelated roots, and the
// explicitly selected subtree root. CSV/JSON and the editable tree are untouched.
export function withoutStandaloneSpouses(members, store, keepId = null) {
  const ids = new Set(members.map(m => m.id));
  const parents = new Set(members.map(m => m.parent_id).filter(id => ids.has(id)));
  const connected = m => m.id === keepId || ids.has(m.parent_id) || parents.has(m.id);
  const order = new Map(members.map((m,i) => [m.id,i]));
  const omitted = new Set();
  for (const member of members) {
    if (connected(member)) continue;
    const represented = members.some(owner => owner.id !== member.id && !omitted.has(owner.id)
      && store.getSpouseMember(owner.id)?.id === member.id
      && (connected(owner) || store.getSpouseMember(member.id)?.id !== owner.id || order.get(owner.id) < order.get(member.id)));
    if (represented) omitted.add(member.id);
  }
  return members.filter(m => !omitted.has(m.id));
}

// Each block is one parent and at most one row of children. Repeating the parent
// on subsequent rows/pages prevents connectors running through earlier rows.
export function planA4(members, store, measure, context = []) {
  if (!members.length) return [];
  const parents = [...context, ...members];
  const usableW = A4.w - PAGE.left - PAGE.right;
  const maxColumns = Math.min(4, Math.floor((usableW + PAGE.gap) / (PAGE.cardWidth + PAGE.gap)));
  const usableH = A4.h - PAGE.top - PAGE.bottom;
  // Try four cards first. Long names/spouse details can require wider cards;
  // reduce the column count rather than shrink the type or clip the content.
  let columns = maxColumns, cardW, cards;
  for (; columns >= 1; columns--) {
    cardW = (usableW - (columns - 1) * PAGE.gap) / columns;
    cards = new Map(parents.map(m => [m.id, measureCard(m, store, cardW, measure)]));
    const fits = members.every(m => {
      const card = cards.get(m.id), parent = cards.get(m.parent_id);
      return card.height + (parent ? parent.height + PAGE.connectorGap : 0) <= usableH;
    });
    if (fits || columns === 1) break;
  }
  const childrenByParent = familyChildren(members);
  const parentIds = new Set(parents.map(member => member.id));
  const visited = new Set();
  const blocks = [];
  function visit(parent) {
    if (visited.has(parent.id)) return;
    visited.add(parent.id);
    const children = childrenByParent.get(parent.id) || [];
    for (const childGen of [...new Set(children.map(generation))].sort((a, b) => a - b)) {
      const siblings = children.filter(child => generation(child) === childGen);
      for (let i = 0; i < siblings.length; i += columns) {
        const row = siblings.slice(i, i + columns);
        blocks.push({
          pair: [generation(parent), childGen],
          parent: cards.get(parent.id),
          children: row.map(child => cards.get(child.id)),
          continued: i > 0,
          repeated: parentIds.has(parent.parent_id),
          endsBranch: row.every(child => !childrenByParent.has(child.id))
        });
        for (const child of row) visit(child);
      }
    }
  }
  for (const parent of parents) if (!parentIds.has(parent.parent_id)) visit(parent);
  for (const parent of parents) visit(parent);
  for (const member of members) {
    if (!parentIds.has(member.parent_id) && !childrenByParent.has(member.id)) {
      const gen = generation(member);
      blocks.push({ pair: [gen, gen], children: [cards.get(member.id)] });
    }
  }
  const pages = [];
  let page;
  let cursor;
  let previous;
  for (const block of blocks) {
    const rowH = Math.max(...block.children.map(c => c.height));
    const height = (block.parent ? block.parent.height + PAGE.connectorGap : 0) + rowH;
    if (height > A4.h - PAGE.bottom - PAGE.top) throw new Error(`Thông tin của ${block.parent?.member.full_name || block.children[0].member.full_name} quá dài cho một cây A4. Hãy rút gọn nội dung hoặc xuất SVG.`);
    const samePair = previous?.pair.join(':') === block.pair.join(':');
    const parentId = block.parent?.member.id;
    const lastChildren = block.endsBranch && previous &&
      (previous.parent?.member.id === parentId || previous.children.some(card => card.member.id === parentId));
    if (!page || (!samePair && !lastChildren) || cursor + height > A4.h - PAGE.bottom) {
      page = { pair: [...block.pair], blocks: [], nodes: [], paths: [] };
      pages.push(page);
      cursor = PAGE.top;
    } else {
      const generations = [...page.pair, ...block.pair];
      page.pair = [Math.min(...generations), Math.max(...generations)];
    }
    previous = block;
    const rowW = block.children.length * cardW + (block.children.length - 1) * PAGE.gap;
    const startX = (A4.w - rowW) / 2;
    let childY = cursor;
    const nodes = [];
    if (block.parent) {
      const parent = { ...block.parent, x: (A4.w - cardW) / 2, y: cursor, continued: block.continued, repeated: block.repeated };
      nodes.push(parent); childY += parent.height + PAGE.connectorGap;
      for (let i = 0; i < block.children.length; i++) {
        const cx = startX + i * (cardW + PAGE.gap) + cardW / 2;
        const sx = parent.x + cardW / 2, sy = parent.y + parent.height, mid = sy + PAGE.connectorGap / 2;
        page.paths.push({ parentId: parent.member.id, childId: block.children[i].member.id, points: [[sx,sy],[sx,mid],[cx,mid],[cx,childY]] });
      }
    }
    block.children.forEach((card, i) => nodes.push({ ...card, x: startX + i * (cardW + PAGE.gap), y: childY }));
    page.blocks.push({ ...block, y: cursor, height }); page.nodes.push(...nodes);
    cursor += height + PAGE.blockGap;
  }
  return pages;
}

export function planTable(members, store, measure) {
  const widths = [42, 188, 180, 128, 130, A4.w - PAGE.left - PAGE.right - 668];
  const headings = ['Đời', 'Tên thánh / Họ tên', 'Ngày sinh / Ngày mất', 'Hưởng thọ', 'Vợ / Chồng', 'Chi / Vai trò'];
  const pages = []; let page; let y;
  for (const member of familyOrder(members)) {
    const fields = exportFields(member, store);
    const lifespan = fields.find(field => field.text.startsWith('Hưởng thọ'))?.text || '';
    const lifespanCell = lifespan.replace(/^Hưởng thọ /, '');
    const texts = [fields.filter(f => f.kind === 'badge').map(f => `Đ${generation(member)}`).join(''), fields.filter(f => ['saint','name'].includes(f.kind)).map(f=>f.text).join('\n'), fields.filter(f => f.kind === 'detail' && /^(?:SN |Mất|Giỗ )/.test(f.text)).map(f=>f.text).join('\n'), lifespanCell, fields.find(f=>/^(?:Vợ|Chồng)/.test(f.text))?.text || '', [member.branch, member.role?.replace(/phối ngẫu/gi, 'Vợ/chồng')].filter(Boolean).join('\n')];
    const cells = texts.map((text,i) => text.split('\n').flatMap(t => wrapText(t,widths[i]-12,s=>measure(s,{size:9,weight:'normal'}))));
    const height = Math.max(34, 12 + Math.max(...cells.map(c=>c.length))*12);
    if (height > A4.h - PAGE.top - PAGE.bottom - 28) throw new Error(`Thông tin của ${member.full_name} quá dài cho một hàng A4. Hãy rút gọn nội dung hoặc xuất SVG.`);
    if (!page || y + height > A4.h - PAGE.bottom) {page={headings,widths,rows:[]};pages.push(page);y=PAGE.top+28;}
    page.rows.push({member,cells,y,height}); y += height;
  }
  return pages;
}
