export { LOG4J_CVE_FIXTURE } from './fixtures/log4j.js';
export * from './errors.js';
export { parseNmapXml } from './nmap/parse-xml.js';
export {
  correlateCves,
  hostsToServiceContexts,
  type CveCacheEntry,
  type CveAffectedProduct,
  type ServiceContext,
} from './cve/correlate.js';
export { scoreRisk, type RiskInput } from './risk/score.js';
export { diffScanRuns, type ScanDiffSummary } from './diff/scan-diff.js';
