import { Response, Request } from 'express';
import register from '../util/prom';
import logger from '../util/logger';
import { createFNOL } from './travelers-claim';

/**
 * List of API examples.
 * @route GET /api
 */
export const getApi = (req: Request, res: Response): void => {
  res.status(200).json({
    route: '/api',
    method: 'GET',
  });
};

/**
 * Prometheus endpoint
 * @route GET /metrics
 */
export const getMetrics = async (
  req: Request,
  res: Response,
): Promise<void> => {
  // Return all metrics the Prometheus exposition format
  res.setHeader('Content-Type', register.contentType);
  const m = await register.metrics();
  res.end(m);
};

/**
 * Travelers Claim FNOL
 * @route POST /travelers-claim/fnol
 */
export const postTravelersClaimFNOL = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const fnol = await createFNOL(req.body);
    res.status(200).json(fnol);
  } catch (error) {
    logger.error('Error during FNOL process:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
