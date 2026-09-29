import { NextFunction, Request, Response } from 'express';
import { Prisma } from '../generated/prisma';
import { HttpError } from '../utils/http';

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
};

// Express recognises error handlers by their four-argument signature.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message, ...(err.details ? { details: err.details } : {}) });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      res.status(404).json({ message: 'Record not found' });
      return;
    }
    if (err.code === 'P2002') {
      res.status(409).json({ message: 'Record already exists' });
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({ message: 'Referenced record does not exist' });
      return;
    }
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ message: 'Malformed JSON body' });
    return;
  }

  console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ message: 'Internal server error' });
};
