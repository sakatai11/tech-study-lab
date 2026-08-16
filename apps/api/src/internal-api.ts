import { WorkerEntrypoint } from 'cloudflare:workers'

import { createInternalApiApp } from './app'
import type { Bindings } from './env'

/** Private Service Binding entrypoint for web Server loaders. */
const internalApiApp = createInternalApiApp()

export class InternalApi extends WorkerEntrypoint<Bindings> {
  override async fetch(request: Request): Promise<Response> {
    return await internalApiApp.fetch(request, this.env, this.ctx)
  }
}
