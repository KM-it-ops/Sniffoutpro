import type { Queryable } from '@sniffoutpro/db';
import type { Tier } from '@sniffoutpro/types';
import type { Logger } from './logger.js';

export type ApiContext = {
  db: Queryable;
  logger: Logger;
  userId: string | null;
  tier: Tier;
  syncAuthorized: boolean;
};

export function createContext(input: ApiContext): ApiContext {
  return input;
}
