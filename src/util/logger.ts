import winston from 'winston';

const isTTY = process.stdout.isTTY;

export const winstonCombinedFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  isTTY ? winston.format.colorize() : winston.format.uncolorize(),
  winston.format.printf(
    ({ level, message, timestamp, stack, ...meta }) =>
      `${timestamp} ${level}: ${stack || message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`,
  ),
);

const logger = winston.createLogger({
  transports: [
    new winston.transports.Console({
      level: process.env.NODE_ENV === 'production' ? 'error' : 'debug',
    }),
    new winston.transports.File({ filename: 'debug.log', level: 'debug' }),
  ],
  format: winstonCombinedFormat,
});

if (process.env.NODE_ENV != 'production') {
  logger.debug('Logging initialized at debug level');
}

export default logger;
