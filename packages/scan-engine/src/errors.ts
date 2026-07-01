export type ScanErrorCode =
  | 'PARSE_FAILED'
  | 'INVALID_TARGET'
  | 'NMAP_NOT_FOUND'
  | 'SCAN_TIMEOUT'
  | 'CVE_LOOKUP_FAILED';

export type ScanError = {
  code: ScanErrorCode;
  message: string;
  cause?: unknown;
};

export function scanError(code: ScanErrorCode, message: string, cause?: unknown): ScanError {
  return cause === undefined ? { code, message } : { code, message, cause };
}

export type CveSyncError = {
  code: 'FETCH_FAILED' | 'PARSE_FAILED' | 'DB_WRITE_FAILED';
  message: string;
};

export type AuthError = {
  code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_TOKEN';
  message: string;
};
