const fs = require('node:fs');
const path = require('node:path');

function validateLineage(input) {
  const errors = [];
  const info = input?.lineageInfo ?? input?.lineage_info;
  if (!info || typeof info !== 'object' || Array.isArray(info) ||
      typeof info.name !== 'string' || !info.name.trim() || info.name.trim().length > 200) {
    errors.push('Lineage information requires a name (1-200 characters).');
  }
  const members = input?.members;
  if (!Array.isArray(members)) return { errors: [...errors, 'members must be an array.'] };
  const byId = new Map();
  for (const member of members) {
    if (!member || typeof member !== 'object' || Array.isArray(member) || typeof member.id !== 'string' ||
        !member.id.trim() || member.id.trim().length > 200 || member.id === '-') {
      errors.push('Member has an invalid or missing string ID.');
      continue;
    }
    if (byId.has(member.id)) errors.push(`Duplicate ID: ${member.id}`);
    byId.set(member.id, member);
  }
  const relation = value => value == null || value === '' || value === '-' ? null : String(value);
  for (const member of byId.values()) {
    for (const field of ['parent_id', 'spouse_id']) {
      const id = relation(member[field]);
      if (id === member.id) errors.push(`Self ${field}: ${member.id}`);
      else if (id && !byId.has(id)) errors.push(`Missing ${field} ${id} for member ${member.id}`);
    }
  }
  const checked = new Set();
  for (const member of byId.values()) {
    const chain = new Set();
    let id = member.id;
    while (id && byId.has(id) && !checked.has(id)) {
      if (chain.has(id)) { errors.push(`Parent cycle involving member ${id}`); break; }
      chain.add(id);
      id = relation(byId.get(id).parent_id);
    }
    for (const item of chain) checked.add(item);
  }
  return { errors, snapshot: { lineageInfo: info, members }, memberCount: members.length };
}

if (require.main === module) {
  try {
    const filename = process.argv[2] || path.join(__dirname, '../data/current_lineage.json');
    const result = validateLineage(JSON.parse(fs.readFileSync(filename, 'utf8')));
    console.log(`Dry run: ${result.memberCount ?? 0} members, ${result.errors.length} validation errors. No data uploaded or modified.`);
    if (result.errors.length) {
      result.errors.slice(0, 20).forEach(error => console.error(error));
      process.exitCode = 1;
    }
  } catch {
    console.error('Could not read a valid lineage JSON file. No data uploaded or modified.');
    process.exitCode = 1;
  }
}

module.exports = { validateLineage };
