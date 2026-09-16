import { z } from 'zod';
import {
  FindingCategorySchema,
  IssueCategorySchema,
  ReviewFindingSchema,
  SeveritySchema,
} from '@openmaintainer/shared';
export const ReviewResponseSchema = z.object({
  summary: z.string().min(1).max(4000),
  findings: z.array(ReviewFindingSchema).max(100),
  testing: z.string().max(3000),
});
export type ReviewResponse = z.infer<typeof ReviewResponseSchema>;
export const TriageResponseSchema = z.object({
  category: IssueCategorySchema,
  summary: z.string().min(1).max(4000),
  suggestedLabels: z.array(z.string().min(1).max(300)).max(20),
  missingInformation: z.array(z.string().min(1).max(300)).max(20),
  isSecuritySensitive: z.boolean(),
  possibleDuplicate: z.boolean(),
});
export const DuplicateResponseSchema = z
  .array(
    z.object({
      number: z.number().int().positive(),
      confidence: z.number().min(0).max(1),
      reason: z.string().min(1).max(2000),
    }),
  )
  .max(200);
export const ReleaseResponseSchema = z
  .array(
    z.object({
      category: z.enum([
        'Added',
        'Changed',
        'Fixed',
        'Performance',
        'Security',
        'Documentation',
        'Dependencies',
        'Other',
      ]),
      text: z.string().min(1).max(2000),
      reference: z
        .string()
        .regex(/^#[1-9][0-9]*$/)
        .max(30),
    }),
  )
  .max(200);
export const ProviderFindingSchema = z.object({
  category: FindingCategorySchema,
  severity: SeveritySchema,
});
