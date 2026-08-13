import { WorkerEntrypoint } from 'cloudflare:workers'

import type { AppEnv } from './env'
import { createInternalApiApp } from './index'

/** Private Service Binding entrypoint for web Server loaders. */
const internalApiApp = createInternalApiApp()

export class InternalApi extends WorkerEntrypoint<AppEnv> {
  override async fetch(request: Request): Promise<Response> {
    return await internalApiApp.fetch(request, this.env, this.ctx)
  }
}
