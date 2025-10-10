import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    // Prova a creare le tabelle nel database in base al modello Prisma
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "User" (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        password VARCHAR(255),
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "League" (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "Competition" (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        "scoringType" VARCHAR(50),
        "leagueId" INTEGER REFERENCES "League"(id) ON DELETE CASCADE,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "Team" (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        "competitionId" INTEGER REFERENCES "Competition"(id) ON DELETE CASCADE,
        "userId" INTEGER REFERENCES "User"(id) ON DELETE SET NULL,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "LeagueMember" (
        id SERIAL PRIMARY KEY,
        "leagueId" INTEGER REFERENCES "League"(id) ON DELETE CASCADE,
        "userId" INTEGER REFERENCES "User"(id) ON DELETE CASCADE
      );
    `);

    return NextResponse.json({ success: true, message: "Tabelle create correttamente!" });
  } catch (error) {
    console.error("Errore creazione tabelle:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
