/**
 * Utility Routes
 *
 * Utility endpoints for frontend support. The GET endpoints are public
 * (static preset data); the POST endpoint that compiles an
 * attacker-suppliable regex requires authentication.
 *
 * Gate 4/item-1 note: `POST /test-validation` (which also *executed* an
 * attacker-suppliable regex against an attacker-suppliable value via
 * `validationPatternService.validateValue`) has been removed - it had no
 * client (see `useTestValidation` in the frontend, now orphaned) and was the
 * only reachable path to `.test()`-ing a user-controlled regex.
 */

import { Router, Request, Response } from 'express';
import {
  validationPatternService,
  RegexValidationRejectedError,
} from '@/services/validationPatternService';
import { getAvailableVariables } from '@/services/prefillService';
import { authenticate } from '@/middleware/auth';

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
 *
 * Requires authentication: compiling and testing an attacker-supplied
 * regex is exactly the shape of a ReDoS primitive, so this can no longer
 * be reached anonymously (see validationPatternService's length/nested-
 * quantifier guards, which are the part that actually can't be bypassed).
 */
router.post('/validate-regex', authenticate, (req: Request, res: Response) => {
  const { pattern } = req.body;

  if (!pattern || typeof pattern !== 'string') {
    res.status(400).json({
      valid: false,
      message: 'Pattern is required',
    });
    return;
  }

  try {
    const isValid = validationPatternService.isValidRegex(pattern);

    res.json({
      valid: isValid,
      message: isValid ? 'Valid regex pattern' : 'Invalid regex pattern',
    });
  } catch (error) {
    if (error instanceof RegexValidationRejectedError) {
      res.status(400).json({
        valid: false,
        message: error.message,
      });
      return;
    }
    throw error;
  }
});

export default router;
