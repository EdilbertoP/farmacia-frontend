/* Integration boundaries are mocked: these tests do not spend tokens or access a live DB. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}) {
  const filename = path.join(root, file);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = new Module(filename, module);
  m.filename = filename; m.paths = module.paths;
  m.require = (id) => Object.hasOwn(mocks, id) ? mocks[id] : require(id);
  m._compile(compiled, filename);
  return m.exports;
}
const domain = load('lib/ia/domain.ts');
const gemini = load('lib/ia/gemini.ts', { 'server-only': {}, './domain': domain });
const http = load('lib/ia/http.ts', { './domain': domain });
const cuota = load('lib/ia/cuota.ts', { 'server-only': {}, './domain': domain });
const categories = [{ id: 1, nombre: 'Higiene' }];
const row = { producto_id: 2, producto: 'Jabón', stock_actual: 10, stock_minimo: 2, vendidos_30_dias: 15 };
function req(body, origin = 'https://farmacia.example') {
  return new Request('https://farmacia.example/api/ia', { method: 'POST',
    headers: { origin, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
}
function mockDB({ authenticated = true, allowed = true, dbError = false } = {}) {
  const calls = [];
  return { calls, auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'u1' } : null }, error: null }) },
    rpc: async (name) => { calls.push(name); return { data: allowed, error: null }; },
    from: (name) => {
      calls.push(name);
      const result = { data: dbError ? null : name === 'categorias' ? categories : row, error: dbError ? { message: 'private database details' } : null };
      return { select: () => ({ order: () => ({ limit: async () => result }), eq: () => ({ maybeSingle: async () => result }) }) };
    },
  };
}
function route(db, generate = async () => ({ value: { texto: 'Informe orientativo basado en las ventas.' }, modelo: 'test-model' })) {
  return load('app/api/ia/route.ts', {
    '@/utils/supabase/server': { createClient: async () => db }, '@/lib/ia/domain': domain,
    '@/lib/ia/gemini': { configuracionGemini: () => ({}), generarJSON: generate },
    '@/lib/ia/http': http, '@/lib/ia/cuota': cuota, '@/lib/ia/agente/propuestas':{capacidades:async()=>({herramientas:['catalogo.leer','ventas.global']}),exigir:()=>{},evento:async()=>{}},
  }).POST;
}

test('rejects invalid action, oversized product input and injected horizon', () => {
  for (const b of [{ accion: 'borrar' }, { accion: 'demanda', producto_id: 1, dias: 365 },
    { accion: 'demanda', producto_id: '1', dias: 7 }, { accion: 'clasificar', nombre: 'x'.repeat(201), descripcion: '' }]) {
    assert.throws(() => domain.validarEntrada(b), domain.IAError);
  }
});
test('baseline rounds upward and has insufficient data at zero sales', () => {
  assert.equal(domain.baseDemanda(row, 7).unidades_estimadas, 4);
  assert.equal(domain.baseDemanda({ ...row, vendidos_30_dias: 0 }, 7).unidades_estimadas, null);
  assert.throws(() => domain.baseDemanda({ ...row, vendidos_30_dias: null }, 7));
  assert.throws(() => domain.baseDemanda({ ...row, stock_actual: -1 }, 7));
});
test('classification accepts only an existing catalog ID', () => {
  assert.equal(domain.validarClasificacion({ categoria_id: 1, motivo: 'Uso de higiene' }, categories).categoria, 'Higiene');
  assert.throws(() => domain.validarClasificacion({ categoria_id: 999, motivo: 'Inventada' }, categories));
});
test('API rejects cross-origin, anonymous, malformed and oversized requests before Gemini', async () => {
  const db = mockDB({ authenticated: false });
  let generated = 0;
  const post = route(db, async () => { generated++; });
  const body = { accion: 'demanda', producto_id: 2, dias: 7 };
  assert.equal((await post(req(body, 'https://other.example'))).status, 403);
  assert.equal((await post(req(body))).status, 401);
  assert.equal((await post(req('{broken'))).status, 400);
  assert.equal((await post(req('x'.repeat(12001)))).status, 413);
  assert.equal(generated, 0);
});
test('API reads Supabase and sends server-calculated baseline to Gemini without writes', async () => {
  const db = mockDB(); let received;
  const post = route(db, async (_prompt, data) => { received = data; return { value: { texto: 'Estimación orientativa.' }, modelo: 'test' }; });
  const res = await post(req({ accion: 'demanda', producto_id: 2, dias: 7, stock_actual: 999999 }));
  assert.equal(res.status, 200);
  const r = await res.json();
  assert.equal(r.datos.stock_actual, 10);
  assert.equal(received.unidades_estimadas, 4);
  assert.deepEqual(db.calls, ['v_resumen_demanda', 'ia_reservar_consulta']);
});
test('API refuses exhausted quota and DB errors without calling Gemini', async () => {
  for (const [config, status] of [[{ allowed: false }, 429], [{ dbError: true }, 502]]) {
    let generated = 0;
    const post = route(mockDB(config), async () => { generated++; });
    const res = await post(req({ accion: 'demanda', producto_id: 2, dias: 7 }));
    assert.equal(res.status, status); assert.equal(generated, 0);
    assert.ok(!JSON.stringify(await res.json()).includes('private database details'));
  }
});
test('classification API returns a suggestion only and rejects invented category', async () => {
  for (const [id, status] of [[1, 200], [999, 502]]) {
    const db = mockDB();
    const post = route(db, async () => ({ value: { categoria_id: id, motivo: 'Clasificación' }, modelo: 'test' }));
    const res = await post(req({ accion: 'clasificar', nombre: 'Jabón', descripcion: 'Higiene' }));
    assert.equal(res.status, status);
    assert.deepEqual(db.calls, ['categorias', 'ia_reservar_consulta']);
  }
});
test('Gemini wrapper protects key, handles quota and rejects incomplete/invalid responses', async () => {
  const oldFetch = global.fetch;
  process.env.GEMINI_API_KEY = 'AIzaTEST_SECRET_ONLY_12345'; process.env.GEMINI_MODEL = 'gemini-test';
  try {
    global.fetch = async (url, options) => {
      assert.ok(!url.includes('AIzaTEST_SECRET_ONLY_12345'));
      assert.equal(options.headers['x-goog-api-key'], 'AIzaTEST_SECRET_ONLY_12345');
      return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"texto":"Bien"}' }] } }] });
    };
    assert.equal((await gemini.generarJSON('Prueba', {}, {})).value.texto, 'Bien');
    global.fetch = async () => new Response('AIzaTEST_SECRET_ONLY_12345', { status: 429 });
    await assert.rejects(gemini.generarJSON('Prueba', {}, {}), (e) => e.status === 429 && !e.message.includes('AIzaTEST_SECRET_ONLY_12345'));
    for (const candidate of [{ finishReason: 'MAX_TOKENS' }, { finishReason: 'STOP', content: { parts: [{ text: 'invalid json' }] } }]) {
      global.fetch = async () => Response.json({ candidates: [candidate] });
      await assert.rejects(gemini.generarJSON('Prueba', {}, {}), (e) => e.status === 502);
    }
    global.fetch = async () => { throw new Error('private connection error'); };
    await assert.rejects(gemini.generarJSON('Prueba', {}, {}), (e) => e.status === 504);
  } finally { global.fetch = oldFetch; delete process.env.GEMINI_API_KEY; delete process.env.GEMINI_MODEL; }
});
