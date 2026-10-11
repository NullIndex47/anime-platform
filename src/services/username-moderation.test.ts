import { test } from 'node:test';
import assert from 'node:assert/strict';
import rules from '../data/username-moderation.json';
import { isUsernameAllowed, MODERATION_MESSAGE } from './username-moderation';
import { validateUsername } from './profiles';

import { blockedNames, allowedNames } from './username-moderation.fixtures';

test('Moderation covers bilingual categories, repeats, leet, separators and bounded padding', () => {
  for (const name of blockedNames) assert.equal(isUsernameAllowed(name), false, name);
  for (const term of Object.values(rules.groups).flat()) {
    assert.equal(isUsernameAllowed(term.toUpperCase()), false, term);
    assert.equal(isUsernameAllowed(term.split('').join('_')), false, term);
    assert.equal(isUsernameAllowed(term + '123'), false, term);
    assert.equal(isUsernameAllowed([...term].map(letter => letter.repeat(3)).join('')), false, term);
  }
});

test('Legitimate names containing fragments are allowed; no broad substring or fuzzy matching', () => {
  for (const name of allowedNames) assert.equal(validateUsername(name), null, name);
});

test('Moderation feedback is generic and does not repeat the submitted name', () => {
  for (const name of blockedNames) {
    const message = validateUsername(name);
    assert.ok(message, name);
    assert.ok(message === MODERATION_MESSAGE || /reservado/.test(message), name);
    assert.ok(!message.toLowerCase().includes(name.toLowerCase()), name);
  }
});
