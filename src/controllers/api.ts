import { Response, Request } from 'express';
import register from '../util/prom';

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
