export const APP_UPDATE_MANIFEST_URL =
  'https://raw.githubusercontent.com/gujjulavamsi007-sys/invictus-tracker/main/app-update.json';

export const APP_UPDATE_DOWNLOAD_URL =
  'https://github.com/gujjulavamsi007-sys/invictus-tracker/releases/latest/download/trip-petrol-expense-tracker.apk';

export function parseUpdateManifest(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('Update information is not valid.');
  }

  const versionCode = Number(candidate.versionCode);
  if (!Number.isSafeInteger(versionCode) || versionCode < 1) {
    throw new Error('Update version is not valid.');
  }

  if (typeof candidate.versionName !== 'string' || !candidate.versionName.trim()) {
    throw new Error('Update version name is missing.');
  }

  if (candidate.downloadUrl !== APP_UPDATE_DOWNLOAD_URL) {
    throw new Error('Update download location is not trusted.');
  }

  const whatsNew = Array.isArray(candidate.whatsNew)
    ? candidate.whatsNew.filter(item => typeof item === 'string' && item.trim())
    : typeof candidate.whatsNew === 'string' && candidate.whatsNew.trim()
      ? candidate.whatsNew.split(/\r?\n/).filter(line => line.trim())
      : [];

  return {
    versionCode,
    versionName: candidate.versionName.trim(),
    downloadUrl: candidate.downloadUrl,
    releaseUrl: typeof candidate.releaseUrl === 'string' ? candidate.releaseUrl : '',
    whatsNew: whatsNew.length ? whatsNew : ['Bug fixes and improvements']
  };
}

export function isNewerVersion(installedBuild, latestVersionCode) {
  const installed = Number(installedBuild);
  const latest = Number(latestVersionCode);
  return Number.isSafeInteger(installed) && installed >= 0 &&
    Number.isSafeInteger(latest) && latest > installed;
}
