import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { defaultState, normalizeState } from "@/lib/form-state";

const dataDirectory = path.join(process.cwd(), "data");
const formFilePath = path.join(dataDirectory, "form.json");

async function readState() {
  try {
    const contents = await readFile(formFilePath, "utf8");
    return normalizeState(JSON.parse(contents));
  } catch {
    return defaultState();
  }
}

export async function GET() {
  return NextResponse.json(await readState(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON" },
      { status: 400 },
    );
  }

  const cleaned = normalizeState(body);
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(formFilePath, JSON.stringify(cleaned, null, 2), "utf8");

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
