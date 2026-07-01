import log4jData from '../../fixtures/log4j-service.json' with { type: 'json' };
import type { CveCacheEntry } from '../cve/correlate.js';

export const LOG4J_CVE_FIXTURE: CveCacheEntry[] = log4jData.cveEntries;
