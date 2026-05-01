/*
  Warnings:

  - You are about to drop the column `auth0_sub` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[firebase_uid]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "users_auth0_sub_key";

-- AlterTable
ALTER TABLE "chat_sessions" ALTER COLUMN "expires_at" SET DEFAULT (now() + interval '7 days');

-- AlterTable
ALTER TABLE "users" DROP COLUMN "auth0_sub",
ADD COLUMN     "email" TEXT,
ADD COLUMN     "firebase_uid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
