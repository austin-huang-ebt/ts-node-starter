import request from 'request';
import { Response, Request, NextFunction } from 'express';

/**
 * List of API examples.
 * @route GET /api
 */
export const getApi = (req: Request, res: Response) => {
  res.status(200).json({
    route: '/api',
    method: 'GET',
  });
};
