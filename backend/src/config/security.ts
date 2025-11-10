import { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';

/**
 * Configure security middleware
 */
export const configureSecurity = (app: Express): void => {
  // Security headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
    })
  );

  // CORS configuration
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://localhost:5173'];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or Postman)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    })
  );

  // Request logging
  if (process.env.NODE_ENV === 'production') {
    // Production: Log only errors
    app.use(
      morgan('combined', {
        skip: (_req, res) => res.statusCode < 400,
      })
    );
  } else {
    // Development: Log all requests
    app.use(morgan('dev'));
  }
};
