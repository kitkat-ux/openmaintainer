import { z } from 'zod';
import {
  FindingCategorySchema,
  IssueCategorySchema,
  ReviewFindingSchema,
  SeveritySchema,
} from '@openmaintainer/shared';
export const ReviewResponseSchema = z.object({
  summary: z.string(),
  findings: z.array(ReviewFindingSchema),
  testing: z.string(),
});
export type ReviewResponse = z.infer<typeof ReviewResponseSchema>;
export const TriageResponseSchema = z.object({
  category: IssueCategorySchema,
  summary: z.string(),
  suggestedLabels: z.array(z.string()),
  missingInformation: z.array(z.string()),
  isSecuritySensitive: z.boolean(),
  possibleDuplicate: z.boolean(),
});
export const DuplicateResponseSchema = z.array(
  z.object({
    number: z.number().int().positive(),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
  }),
);
export const ReleaseResponseSchema = z.array(
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
    text: z.string(),
    reference: z.string(),
  }),
);
export const ProviderFindingSchema = z.object({
  category: FindingCategorySchema,
  severity: SeveritySchema,
});
