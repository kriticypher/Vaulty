// prisma.js - Shared Prisma Client singleton for Vaultly.
// One client instance is reused for every query (best practice).

import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
