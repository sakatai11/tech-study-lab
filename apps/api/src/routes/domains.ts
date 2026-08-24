import { zValidator } from '@hono/zod-validator'
import { type DomainsResponse, domainsRequestSchema } from '@tsl/shared'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'

import { createDomainsDeps } from '../dal/domains-repository'
import type { AppEnv } from '../env'
import { getDomains } from '../services/domains-service'

export const domainsRoute = new Hono<AppEnv>().get(
  '/',
  zValidator('query', domainsRequestSchema),
  async (c) => {
    const result = await getDomains(createDomainsDeps(drizzle(c.env.DB)), {
      userId: c.get('userId'),
    })

    return c.json(result satisfies DomainsResponse)
  },
)
