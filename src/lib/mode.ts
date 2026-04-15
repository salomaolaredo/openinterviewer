// Deployment mode detection.
// Hosted mode has been removed — the app is always standalone.
// These helpers remain as constants so existing imports continue to type-check.

export type DeploymentMode = 'standalone';

export function getDeploymentMode(): DeploymentMode {
  return 'standalone';
}

export function isHostedMode(): boolean {
  return false;
}

export function isStandaloneMode(): boolean {
  return true;
}
