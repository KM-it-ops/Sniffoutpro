import { describe, expect, it } from 'vitest';
import { publicTrpcCorsHeaders } from './public-cors';

describe('publicTrpcCorsHeaders', () => {
  it('does not allow credentialed cookies on the wildcard origin', () => {
    expect(publicTrpcCorsHeaders['Access-Control-Allow-Credentials']).toBeUndefined();
    expect(publicTrpcCorsHeaders['Access-Control-Allow-Origin']).toBe('*');
  });
});
