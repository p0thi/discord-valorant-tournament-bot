'use strict';

import winston from 'winston'

const colorizer = winston.format.colorize();

const log = winston.createLogger({
    levels: {
        error: 0,
        warn: 1,
        silly: 2,
        info: 3,
        debug: 4,
      },
    transports: [
        new winston.transports.Console({ level: 'debug', format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.align(),
            winston.format.printf((info) => {
                const {
                    timestamp, level: level, message, ...args
                } = info;
    
                const colorizedLevel = colorizer.colorize(level, level.toUpperCase());
    
                // const ts = timestamp.slice(0, 19).replace('T', ' ');
                return `${timestamp} ${colorizedLevel}: ${message} ${Object.keys(args).length ? JSON.stringify(args, null, 2) : ''}`;
            }),
        ) }),
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
    ],
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf((info) => {
            const {
                timestamp, level, message, ...args
            } = info;

            // const ts = timestamp.slice(0, 19).replace('T', ' ');
            return `${timestamp} ${level.toUpperCase()}: ${message} ${Object.keys(args).length ? JSON.stringify(args, null, 2) : ''}`;
        }),
    )
});

winston.addColors({
    debug: 'green',
    info: 'cyan',
    silly: 'magenta',
    warn: 'yellow',
    error: 'red'
});

export default log