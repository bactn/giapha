import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotChanges, describeError } from '../public/js/services/genealogy.js';
import { DataStore } from '../public/js/data-store.js';
import { escapeHTML } from '../public/js/html.js';

test('snapshot diff includes new fields and info changes without derived statistics noise', () => {
  const before = { lineageInfo: { name: 'Family', total_members: 1 }, members: [{ id: 'A', full_name: 'Old' }] };
  const after = { lineageInfo: { name: 'Family', total_members: 2, generations: 3 }, members: [{ id: 'A', full_name: 'New', occupation: 'Teacher' }, { id: 'B', parent_id: 'A' }] };
  const changes = snapshotChanges(before, after);
  assert.equal(changes.length, 2);
  assert.deepEqual({ ...changes[0].new_value }, { full_name: 'New', occupation: 'Teacher' });
  assert.equal(changes[1].type, 'add_member');
  after.lineageInfo.name = 'Renamed';
  assert.equal(snapshotChanges(before, after).at(-1).type, 'update_info');
});
test('edits made during an asynchronous save remain dirty against the saved snapshot', () => {
  const store = new DataStore();
  store.loadState({ members: [{ id: 'A', full_name: 'Initial' }] });
  store.initializeTracking();
  store.updateMember('A', { full_name: 'Captured for save' });
  const captured = JSON.parse(JSON.stringify(store.getAllMembers()));
  store.updateMember('A', { full_name: 'Typed while saving' });
  store.initializeTracking(captured);
  assert.equal(store.getTrackedChanges()[0].new_value.full_name, 'Typed while saving');
});
test('viewer mutation attempts do not modify graph or undo history', () => {
  const store = new DataStore();
  store.loadState({ members: [{ id: 'A', full_name: 'Read only' }] });
  store.readOnly = true;
  assert.throws(() => store.updateMember('A', { full_name: 'Forbidden' }), /quyền xem/);
  assert.throws(() => store.addMember({ id: 'B' }), /quyền xem/);
  assert.equal(store.getMember('A').full_name, 'Read only');
  assert.equal(store.undo(), false);
  assert.equal(store.history.length, 0);
});
test('untrusted text is escaped for HTML and quoted attributes', () => {
  const text = '<img src=x onerror="alert(1)"> & \'quoted\'';
  const escaped = escapeHTML(text);
  assert(!escaped.includes('<'));
  assert(!escaped.includes('"'));
  assert(escaped.includes('&quot;'));
  assert(escaped.includes('&#39;'));
});
test('business conflicts instruct users to keep drafts and reconcile', () => {
  assert.match(describeError({ code: 'PT409' }), /Bản nháp vẫn được giữ/);
  assert.match(describeError({ code: '40001' }), /đối chiếu/);
});
