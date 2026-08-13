import { WorkerEntrypoint } from 'cloudflare:workers'

import type { AppEnv } from './env'
import { createInternalApiApp } from './index'

/** Private Service Binding entrypoint for web Server loaders. */
export class InternalApi extends WorkerEntrypoint<AppEnv> {
  override async fetch(request: Request): Promise<Response> {
    return await createInternalApiApp().fetch(request, this.env, this.ctx)
  }
}
