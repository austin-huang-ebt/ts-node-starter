import http from 'http';
import { createTerminus, HealthCheckError } from '@godaddy/terminus';
import errorHandler from 'errorhandler';

import app from './app';

/**
 * Error Handler. Provides full stack - remove for production
 */
app.use(errorHandler());

/**
 * Start Express server.
 */

const server = http.createServer(app);

function onSignal() {
  console.log('server is starting cleanup');
  return Promise.all([
    // your clean logic, like closing database connections
  ]);
}

function onShutdown() {
  console.log('cleanup finished, server is shutting down');
}

async function healthCheck() {
  const errors = [];
  return Promise.all(
    [
      // all your health checks goes here
    ].map((p) =>
      p.catch((error) => {
        // silently collecting all the errors
        errors.push(error);
        return undefined;
      }),
    ),
  ).then(() => {
    if (errors.length) {
      throw new HealthCheckError('healthcheck failed', errors);
    }
  });
}

function beforeShutdown() {
  // given your readiness probes run every 5 second
  // may be worth using a bigger number so you won't
  // run into any race conditions
  return new Promise((resolve) => {
    setTimeout(resolve, 5000);
  });
}

const options = {
  // health check options
  healthChecks: {
    '/healthcheck': healthCheck, // a function returning a promise indicating service health,
    verbatim: true, // [optional = false] use object returned from /healthcheck verbatim in response
  },
  caseInsensitive, // [optional] whether given health checks routes are case insensitive (defaults to false)

  // cleanup options
  timeout: 1000, // [optional = 1000] number of milliseconds before forceful exiting
  signal, // [optional = 'SIGTERM'] what signal to listen for relative to shutdown
  signals, // [optional = []] array of signals to listen for relative to shutdown
  beforeShutdown, // [optional] called before the HTTP server starts its shutdown
  onSignal, // [optional] cleanup function, returning a promise (used to be onSigterm)
  onShutdown, // [optional] called right before exiting
  onSendFailureDuringShutdown, // [optional] called before sending each 503 during shutdowns

  // both
  logger, // [optional] logger function to be called with errors. Example logger call: ('error happened during shutdown', error). See terminus.js for more details.
};

createTerminus(server, options);

export default server.listen(app.get('port'), () => {
  console.log(
    'App is running at http://localhost:%d in %s mode',
    app.get('port'),
    app.get('env'),
  );
  console.log('  Press CTRL-C to stop\n');
});
