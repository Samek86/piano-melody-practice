import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAdminLocation } from './adminPath.ts';

test('admin opens from /admin and #admin only', () => {
  assert.equal(isAdminLocation({ pathname: '/admin', hash: '' }), true);
  assert.equal(isAdminLocation({ pathname: '/admin/', hash: '' }), true);
  assert.equal(isAdminLocation({ pathname: '/', hash: '#admin' }), true);
  assert.equal(isAdminLocation({ pathname: '/', hash: '#/admin' }), true);
  assert.equal(isAdminLocation({ pathname: '/', hash: '' }), false);
  assert.equal(isAdminLocation({ pathname: '/administrator', hash: '' }), false);
  assert.equal(isAdminLocation({ pathname: '/practice', hash: '#settings' }), false);
});
