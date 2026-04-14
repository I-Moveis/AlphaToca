import "dotenv/config";

export default {
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL!,
  },
  migrations: {
    seed: 'ts-node ./prisma/seed.ts'
  }
};
