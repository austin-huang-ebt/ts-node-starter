import express from 'express';
import compression from 'compression'; // compresses requests
import bodyParser from 'body-parser';
import lusca from 'lusca';
import cors from 'cors';
import path from 'path';
import winston from 'winston';
import expressWinston from 'express-winston';
import { winstonCombinedFormat } from './util/logger';

// Controllers (route handlers)
import * as apiController from './controllers/api';

import logger from './util/logger';
import dotenv from 'dotenv';
import fs from 'fs';

if (fs.existsSync('.env')) {
  logger.debug('Using .env file to supply config environment variables');
  dotenv.config({ path: '.env' });
}

// Create Express server
const app = express();

// Express configuration
app.set('port', process.env.PORT || 3000);
app.use(lusca.xframe('SAMEORIGIN'));
app.use(lusca.xssProtection(true));

const corsOptions = {
  origin: process.env.CORS_ORIGIN_ALLOWED,
  optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
};
app.use(cors(corsOptions));
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  express.static(path.join(__dirname, 'public'), { maxAge: 31557600000 }),
);

const router = express.Router();

/**
 * Primary app routes.
 */
router.get('/api', apiController.getApi);
router.get('/metrics', apiController.getMetrics);
router.post(
  '/travelers/claim/api-orch/v1/fnol',
  apiController.postTravelersClaimFNOL,
);
router.post(
  '/travelers/claim/api-orch/v1/payment',
  apiController.postTravelersClaimPayment,
);

app.use(
  expressWinston.logger({
    transports: [new winston.transports.Console()],
    format: winstonCombinedFormat,
    meta: true, // optional: control whether you want to log the meta data about the request (default to true)
    msg: 'HTTP {{req.method}} {{req.url}}', // optional: customize the default logging message. E.g. "{{res.statusCode}} {{req.method}} {{res.responseTime}}ms {{req.url}}"
    expressFormat: true, // Use the default Express/morgan request formatting. Enabling this will override any msg if true. Will only output colors with colorize set to true
    colorize: false, // Color the text and status code, using the Express/morgan color palette (text: gray, status: default green, 3XX cyan, 4XX yellow, 5XX red).
    ignoreRoute: function (_req, _res) {
      return false;
    }, // optional: allows to skip some log messages based on request and/or response
  }),
);

app.use(router);

app.use(
  expressWinston.errorLogger({
    transports: [new winston.transports.Console()],
    format: winstonCombinedFormat,
  }),
);

export default app;
