import express from 'express';
import compression from 'compression'; // compresses requests
import session from 'express-session';
import bodyParser from 'body-parser';
import lusca from 'lusca';
import cors from 'cors';
import path from 'path';
import { SESSION_SECRET } from './util/secrets';

// Controllers (route handlers)
import * as apiController from './controllers/api';

// Create Express server
const app = express();

// Express configuration
app.set('port', process.env.PORT || 3000);
app.use(
  session({
    resave: true,
    saveUninitialized: true,
    secret: SESSION_SECRET,
  }),
);
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

app.options('*', cors());

/**
 * Primary app routes.
 */
app.get('/api', apiController.getApi);

export default app;
