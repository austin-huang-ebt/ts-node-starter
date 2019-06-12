import request from "request";
import { Response, Request, NextFunction } from "express";


/**
 * GET /api
 * List of API examples.
 */
export let getApi = (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json;charset=utf-8');
  res.send({
    status: '200',
    data: [
      {
        route: '/api',
        method: 'GET'
      },
    ],
  });
};
