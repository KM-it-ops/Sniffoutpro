import { z } from 'zod';

export const SeverityEnum = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type Severity = z.infer<typeof SeverityEnum>;

export const ScanIntensityEnum = z.enum(['light', 'standard', 'deep']);
export type ScanIntensity = z.infer<typeof ScanIntensityEnum>;

export const ScanStatusEnum = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']);
export type ScanStatus = z.infer<typeof ScanStatusEnum>;

export const ServiceSchema = z.object({
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(['tcp', 'udp']),
  product: z.string().optional(),
  version: z.string().optional(),
  banner: z.string().optional(),
});

export type Service = z.infer<typeof ServiceSchema>;

export const HostSchema = z.object({
  ip: z.string().ip({ version: 'v4' }).or(z.string().ip({ version: 'v6' })),
  hostname: z.string().optional(),
  mac: z.string().optional(),
  os: z.string().optional(),
  osConfidence: z.number().min(0).max(100).optional(),
  services: z.array(ServiceSchema),
});

export type Host = z.infer<typeof HostSchema>;

export const FindingSchema = z.object({
  id: z.string().uuid(),
  cveId: z.string().optional(),
  title: z.string(),
  severity: SeverityEnum,
  cvssScore: z.number().min(0).max(10).optional(),
  riskScore: z.number().min(0).max(100),
  hostIp: z.string(),
  port: z.number().int().optional(),
  description: z.string().optional(),
});

export type Finding = z.infer<typeof FindingSchema>;

export const ScanRunSchema = z.object({
  id: z.string().uuid(),
  status: ScanStatusEnum,
  targets: z.array(z.string()),
  intensity: ScanIntensityEnum,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  hosts: z.array(HostSchema),
  findings: z.array(FindingSchema),
});

export type ScanRun = z.infer<typeof ScanRunSchema>;

export const ScanProgressEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('progress'),
    percent: z.number().min(0).max(100),
    message: z.string(),
  }),
  z.object({
    type: z.literal('host_discovered'),
    host: HostSchema,
  }),
  z.object({
    type: z.literal('finding'),
    finding: FindingSchema,
  }),
  z.object({
    type: z.literal('complete'),
    scanRun: ScanRunSchema,
  }),
  z.object({
    type: z.literal('error'),
    message: z.string(),
  }),
]);

export type ScanProgressEvent = z.infer<typeof ScanProgressEventSchema>;
