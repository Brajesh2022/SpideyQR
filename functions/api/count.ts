interface Env {
  DB?: {
    prepare: (query: string) => {
      bind: (...values: unknown[]) => {
        first: <T = Record<string, unknown>>() => Promise<T | null>;
        run: () => Promise<unknown>;
      };
      first: <T = Record<string, unknown>>() => Promise<T | null>;
      run: () => Promise<unknown>;
    };
  };
}

interface PagesContext {
  request: Request;
  env: Env;
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

async function ensureTable(db: NonNullable<Env['DB']>): Promise<void> {
  await db
    .prepare(
      'CREATE TABLE IF NOT EXISTS stats (key TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0)'
    )
    .run();
  await db
    .prepare("INSERT OR IGNORE INTO stats (key, value) VALUES ('qr_generated', 0)")
    .run();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const db = context.env.DB;
  if (!db) {
    return new Response(JSON.stringify({ count: 0, configured: false }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  }

  try {
    await ensureTable(db);
    const row = await db
      .prepare("SELECT value FROM stats WHERE key = 'qr_generated'")
      .first<{ value: number }>();
    const count = typeof row?.value === 'number' ? row.value : 0;
    return new Response(JSON.stringify({ count, configured: true }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ count: 0, configured: false, error: String(err) }),
      { status: 200, headers: JSON_HEADERS }
    );
  }
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const db = context.env.DB;
  if (!db) {
    return new Response(JSON.stringify({ count: 0, configured: false }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  }

  try {
    await ensureTable(db);
    const row = await db
      .prepare(
        "UPDATE stats SET value = value + 1 WHERE key = 'qr_generated' RETURNING value"
      )
      .first<{ value: number }>();
    const count = typeof row?.value === 'number' ? row.value : 1;
    return new Response(JSON.stringify({ count, configured: true }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ count: 0, configured: false, error: String(err) }),
      { status: 200, headers: JSON_HEADERS }
    );
  }
}
