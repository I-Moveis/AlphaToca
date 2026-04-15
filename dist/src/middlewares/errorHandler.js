"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const zod_1 = require("zod");
const errorHandler = (err, req, res, next) => {
    console.error(`[Error Handler] ${err.name}: ${err.message}`);
    let response = {
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
        messages: [{ message: 'An unexpected error occurred.' }],
    };
    if (err instanceof zod_1.ZodError) {
        response.status = 400;
        response.code = 'VALIDATION_ERROR';
        response.messages = err.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message
        }));
    }
    else if (err.name === 'SyntaxError') { // Catch JSON parse errors
        response.status = 400;
        response.code = 'BAD_REQUEST';
        response.messages = [{ message: 'Invalid JSON payload.' }];
    }
    else {
        response.messages = [{ message: err.message }];
    }
    res.status(response.status).json(response);
};
exports.errorHandler = errorHandler;
