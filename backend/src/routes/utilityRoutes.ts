/**
 * Utility Routes
 *
 * Public utility endpoints for frontend support.
 */

import { Router, Request, Response } from 'express';
import { validationPatternService } from '@/services/validationPatternService';
import { getAvailableVariables } from '@/services/prefillService';

const router = Router();

/**
 * GET /api/util/validation-patterns
 * Get all available validation patterns for text fields
 */
router.get('/validation-patterns', (_req: Request, res: Response) => {
  const patterns = validationPatternService.getAllPatterns();

  // Group by category for easier frontend consumption
  const byCategory = patterns.reduce(
    (acc, pattern) => {
      const category = pattern.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category]!.push(pattern);
      return acc;
    },
    {} as Record<string, typeof patterns>
  );

  res.json({
    patterns,
    byCategory,
  });
});

/**
 * GET /api/util/template-variables
 * Get all available template variables for pre-filled fields
 */
router.get('/template-variables', (_req: Request, res: Response) => {
  const variables = getAvailableVariables();
  res.json({ variables });
});

/**
 * POST /api/util/validate-regex
 * Validate a custom regex pattern
 */
router.post('/validate-regex', (req: Request, res: Response) => {
  const { pattern } = req.body;

  if (!pattern || typeof pattern !== 'string') {
    res.status(400).json({
      valid: false,
      message: 'Pattern is required',
    });
    return;
  }

  const isValid = validationPatternService.isValidRegex(pattern);

  res.json({
    valid: isValid,
    message: isValid ? 'Valid regex pattern' : 'Invalid regex pattern',
  });
});

/**
 * POST /api/util/test-validation
 * Test a value against a validation pattern
 */
router.post('/test-validation', (req: Request, res: Response) => {
  const { value, patternId, customRegex } = req.body;

  if (!value || typeof value !== 'string') {
    res.status(400).json({
      valid: false,
      message: 'Value is required',
    });
    return;
  }

  if (!patternId || typeof patternId !== 'string') {
    res.status(400).json({
      valid: false,
      message: 'Pattern ID is required',
    });
    return;
  }

  const result = validationPatternService.validateValue(value, patternId as any, customRegex);
  res.json(result);
});

export default router;
