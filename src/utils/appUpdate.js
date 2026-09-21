import { App } from '@capacitor/app';

const RELEASES_API = 'https://api.github.com/repos/uncleburu1-web/gssandriod/releases/latest';

// GitHub release tags look like "v42" — the same integer this build's
// versionCode was stamped with in CI (see .github/workflows/build-android.yml
// and android/app/build.gradle). Comparing versionCode integers rather than
// the human-readable "1.42" versionName avoids any string-vs-number or
// semver-parsing edge cases for what is, underneath, just a build counter.
function parseVersionCode(tagName) {
  const match = /(\d+)/.exec(tagName || '');
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Compares the installed app's own build number against the latest
 * published release. Resolves to null on any failure (offline, rate
 * limited, first release not published yet) rather than throwing —
 * "couldn't check" should never interrupt someone trying to use the till.
 * Resolves to { available: false } when already current, or
 * { available: true, version, downloadUrl } when a newer build exists.
 */
export async function checkForUpdate() {
  try {
    const info = await App.getInfo();
    const installedCode = parseInt(info.build, 10);

    const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    const release = await res.json();
    const latestCode = parseVersionCode(release.tag_name);
    if (!latestCode || !installedCode || latestCode <= installedCode) {
      return { available: false };
    }

    const asset = (release.assets || []).find((a) => a.name === 'gss-android.apk');
    return {
      available: true,
      version: release.name || release.tag_name,
      downloadUrl: asset ? asset.browser_download_url : release.html_url,
    };
  } catch {
    return null;
  }
}
