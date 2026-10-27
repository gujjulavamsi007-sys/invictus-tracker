import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_UPDATE_DOWNLOAD_URL,
  isNewerVersion,
  parseUpdateManifest
} from '../src/appUpdates.mjs';

const validManifest = {
  versionCode: 42,
  versionName: '1.0.42',
  downloadUrl: APP_UPDATE_DOWNLOAD_URL,
  releaseUrl: 'https://github.com/gujjulavamsi007-sys/invictus-tracker/releases/tag/v1.0.42',
  whatsNew: ['Improved trip reports', 'Updated app icon']
};

test('parses the published version and release notes', () => {
  assert.deepEqual(parseUpdateManifest(validManifest), validManifest);
});

test('rejects an APK hosted outside the official latest GitHub release URL', () => {
  assert.throws(
    () => parseUpdateManifest({ ...validManifest, downloadUrl: 'https://example.com/app.apk' }),
    /not trusted/
  );
});

test('rejects a missing or invalid Android version code', () => {
  assert.throws(
    () => parseUpdateManifest({ ...validManifest, versionCode: 0 }),
    /version is not valid/
  );
});

test('compares Android build numbers without relying on version-name text', () => {
  assert.equal(isNewerVersion('41', 42), true);
  assert.equal(isNewerVersion('42', 42), false);
  assert.equal(isNewerVersion('43', 42), false);
  assert.equal(isNewerVersion('unknown', 42), false);
});
