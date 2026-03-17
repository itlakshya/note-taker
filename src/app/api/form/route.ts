import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { head, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { defaultState, normalizeState } from "@/lib/form-state";

const dataDirectory = path.join(process.cwd(), "data");
const formFilePath = path.join(dataDirectory, "form.json");
const blobFormPath = "form/form.json";

function hasBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readState() {
  if (hasBlobStorage()) {
    try {
      const meta = await head(blobFormPath);
      const response = await fetch(meta.url, { cache: "no-store" });

      if (!response.ok) {
        return defaultState();
      }

      return normalizeState(await response.json());
    } catch {
      return defaultState();
    }
  }

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

  if (hasBlobStorage()) {
    await put(blobFormPath, JSON.stringify(cleaned, null, 2), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  } else {
    await mkdir(dataDirectory, { recursive: true });
    await writeFile(formFilePath, JSON.stringify(cleaned, null, 2), "utf8");
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
