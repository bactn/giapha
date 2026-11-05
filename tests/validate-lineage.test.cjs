const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateLineage } = require('../scripts/validate-lineage.cjs');

test('accepts legacy lineage_info and preserves unknown member fields', () => {
  const input = { lineage_info: { name: 'Test' }, members: [
    { id: 'P001', parent_id: '-', extra: 'retained', spouse_id: 'P002' },
    { id: 'P002', parent_id: '', spouse_id: 'P001' },
    { id: 'P003', parent_id: 'P001' }
  ] };
  const before = JSON.stringify(input);
  const result = validateLineage(input);
  assert.deepEqual(result.errors, []);
  assert.equal(result.snapshot.lineageInfo.name, 'Test');
  assert.equal(result.snapshot.members[0].extra, 'retained');
  assert.equal(JSON.stringify(input), before);
});
test('detects duplicate IDs, missing references and self relationships', () => {
  const result = validateLineage({ lineageInfo: { name: 'Test' }, members: [
    { id: 'P001' }, { id: 'P001', parent_id: 'missing', spouse_id: 'P001' }
  ] });
  assert(result.errors.some(e => e.includes('Duplicate')));
  assert(result.errors.some(e => e.includes('Missing parent')));
  assert(result.errors.some(e => e.includes('Self spouse')));
});
test('rejects ancestry cycles while allowing valid spouse pairs', () => {
  const result = validateLineage({ lineageInfo: { name: 'Test' }, members: [
    { id: 'A', parent_id: 'B', spouse_id: 'B' }, { id: 'B', parent_id: 'A', spouse_id: 'A' }
  ] });
  assert.equal(result.errors.filter(e => e.includes('cycle')).length, 1);
});
test('reports malformed snapshots without silently discarding data', () => {
  assert(validateLineage(null).errors.length > 0);
  assert(validateLineage({ lineageInfo: { name: 'Test' }, members: [{ id: 123 }] }).errors.length > 0);
});
