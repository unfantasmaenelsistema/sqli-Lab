const test = require('node:test');
const assert = require('node:assert');
const E = require('../sql-engine.js');

const LOGIN = "SELECT * FROM usuarios WHERE usuario = '{U}' AND clave = '{P}'";
const UNION = "SELECT nombre, precio FROM productos WHERE nombre LIKE '%{S}%'";
const ID = 'SELECT * FROM productos WHERE id = {I}';
const login = (u, p) => E.execute(LOGIN.replace('{U}', u).replace('{P}', p));
const search = (s) => E.execute(UNION.replace('{S}', s));
const byId = (i) => E.execute(ID.replace('{I}', i));

test('login normal y bypass', () => {
  assert.strictEqual(login('admin', 'P@ssw0rd!').rows.length, 1);
  assert.strictEqual(login('admin', 'mala').rows.length, 0);
  assert.strictEqual(login("' OR '1'='1' -- -", 'x').rows.length, 3);
  assert.strictEqual(login("admin'#", 'x').rows[0][1], 'admin');
  assert.strictEqual(login("nobody'#", 'x').rows.length, 0); // el comentario no basta si el usuario no existe
});

test('errores de sintaxis como MySQL', () => {
  const r = login("'", 'x');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, 1064);
  const dash = login("admin'--", 'x'); // en MySQL "--" necesita un espacio detrás
  assert.strictEqual(dash.ok, false);
  assert.strictEqual(dash.dashNoSpace, true);
  assert.strictEqual(byId('1; DROP TABLE usuarios').error.code, 1064); // sin consultas apiladas
});

test('UNION: columnas, ORDER BY e information_schema', () => {
  assert.strictEqual(search("' UNION SELECT usuario FROM usuarios -- -").error.code, 1222);
  assert.strictEqual(search("' ORDER BY 2 -- -").ok, true);
  assert.strictEqual(search("' ORDER BY 3 -- -").error.code, 1054);
  const r = search("' UNION SELECT usuario, clave FROM usuarios -- -");
  assert.ok(r.rows.some((row) => row[1] === 'P@ssw0rd!'));
  const t = search("' UNION SELECT table_name, NULL FROM information_schema.tables WHERE table_schema=database() -- -");
  assert.deepStrictEqual(t.rows.filter((row) => row[1] === null).map((row) => row[0]).sort(), ['productos', 'usuarios']);
  assert.strictEqual(search("' UNION SELECT a, b FROM noexiste -- -").error.code, 1146);
});

test('blind booleano y por tiempo', () => {
  assert.strictEqual(byId('1 AND 1=1').rows.length, 1);
  assert.strictEqual(byId('1 AND 1=2').rows.length, 0);
  assert.strictEqual(byId("1 AND SUBSTRING(database(),1,1)='s'").rows.length, 1);
  assert.strictEqual(byId("1 AND SUBSTRING(database(),1,1)='S'").rows.length, 1); // comparación sin mayúsculas
  assert.strictEqual(byId('1 AND LENGTH(database())=7').rows.length, 1);
  assert.strictEqual(byId('1 AND ASCII(SUBSTRING(database(),2,1))=104').rows.length, 1); // 'h'
  assert.strictEqual(byId("1 AND IF(SUBSTRING(database(),1,1)='s',SLEEP(2),0)").delay, 2);
  assert.strictEqual(byId("1 AND IF(SUBSTRING(database(),1,1)='x',SLEEP(2),0)").delay, 0);
});

test('error-based con EXTRACTVALUE y UPDATEXML', () => {
  assert.strictEqual(byId('EXTRACTVALUE(1,CONCAT(0x7e,(SELECT database()),0x7e))').error.mysqlMessage, "XPATH syntax error: '~shop_db~'");
  assert.strictEqual(byId('EXTRACTVALUE(1,CONCAT(0x7e,(SELECT user()),0x7e))').error.xpathLeak, '~webapp@localhost~');
  assert.match(byId('1 AND UPDATEXML(1,CONCAT(0x7e,(SELECT clave FROM usuarios LIMIT 1),0x7e),1)').error.message, /P@ssw0rd!/);
  assert.strictEqual(byId('EXTRACTVALUE(1,(SELECT clave FROM usuarios))').error.code, 1242);
  assert.strictEqual(byId("EXTRACTVALUE(1,'shop_db')").ok, true); // XPath válida: sin error, sin fuga
});

test('conversión de tipos y precedencia', () => {
  assert.strictEqual(E.execute("SELECT 'admin' = 0").rows[0][0], 1);
  assert.strictEqual(E.execute("SELECT '1abc' + 1").rows[0][0], 2);
  assert.strictEqual(E.execute('SELECT 1 OR 0 AND 0').rows[0][0], 1); // AND antes que OR
  assert.strictEqual(E.execute('SELECT NULL = NULL').rows[0][0], null);
  assert.strictEqual(E.execute("SELECT 'Pantalon' LIKE 'pantal_n'").rows[0][0], 1);
});

test('consultas parametrizadas e inyección detectada', () => {
  assert.strictEqual(E.executePrepared('SELECT * FROM usuarios WHERE usuario = ?', ["' OR '1'='1' -- -"]).rows.length, 0);
  assert.strictEqual(E.executePrepared('SELECT * FROM usuarios WHERE usuario = ?', ['admin']).rows.length, 1);
  const tpl = "SELECT * FROM usuarios WHERE usuario = '{INPUT}'";
  assert.strictEqual(E.isInjection(tpl, "admin'#"), true);
  assert.strictEqual(E.isInjection(tpl, 'jorge'), false);
  assert.strictEqual(E.isInjection('SELECT * FROM productos WHERE id = {INPUT}', '2', '1'), false);
  assert.strictEqual(E.isInjection('SELECT * FROM productos WHERE id = {INPUT}', '1 AND 1=1', '1'), true);
});

test('el resaltado escapa HTML', () => {
  const html = E.highlight("SELECT '<img src=x onerror=alert(1)>'", [[7, 37]]);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('sq-inj'));
});
