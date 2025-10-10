import { exec } from "child_process";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Esegui il comando Prisma per sincronizzare schema e database
    const result = await new Promise((resolve, reject) => {
      exec("npx prisma db push", (error, stdout, stderr) => {
        if (error) reject(stderr || stdout);
        else resolve(stdout);
      });
    });

    return NextResponse.json({
      success: true,
      message: "Database sincronizzato con successo.",
      log: result,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.toString() },
      { status: 500 }
    );
  }
}
