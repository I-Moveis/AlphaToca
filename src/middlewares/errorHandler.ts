import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { UnauthorizedError } from 'express-oauth2-jwt-bearer';

export type ErrorResponse = {
    status: number;
    code: string;
    messages: any[];
};

export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    console.error(`[Error Handler] ${err.name}: ${err.message}`);

    let response: ErrorResponse = {
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
        messages: [{ message: 'An unexpected error occurred.' }],
    };

    if (err instanceof UnauthorizedError) {
        response.status = err.status || 401;
        response.code = 'UNAUTHORIZED';
        response.messages = [{ message: err.message || 'Invalid or missing authentication token.' }];
    } else if (err instanceof ZodError) {
        response.status = 400;
        response.code = 'VALIDATION_ERROR';
        response.messages = err.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message
        }));
    } else if (err.name === 'SyntaxError') { // Catch JSON parse errors
        response.status = 400;
        response.code = 'BAD_REQUEST';
        response.messages = [{ message: 'Invalid JSON payload.' }];
    } else {
        response.messages = [{ message: err.message }];
    }

    res.status(response.status).json(response);
};
