import { env } from 'cloudflare:workers'

export async function getCloudflareContext(_options?: { async: true }): Promise<{
  env: CloudflareEnv
}> {
  return { env: env as unknown as CloudflareEnv }
}
