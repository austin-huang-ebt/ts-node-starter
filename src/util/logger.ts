import winston from 'winston';

const logger = winston.createLogger({
  transports: [
    new winston.transports.Console({
      level: process.env.NODE_ENV === 'production' ? 'error' : 'debug',
    }),
    new winston.transports.File({ filename: 'debug.log', level: 'debug' }),
  ],
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.json(),
  ),
});

if (process.env.NODE_ENV != 'production') {
  logger.debug('Logging initialized at debug level');
}

export default logger;
