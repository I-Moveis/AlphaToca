"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
exports.default = {
    schema: "prisma/schema.prisma",
    datasource: {
        url: process.env.DATABASE_URL,
    },
    migrations: {
        seed: 'ts-node ./prisma/seed.ts'
    }
};
