// SQLi Lab · motor SQL de juguete con el comportamiento de MySQL 8 que importa para aprender inyección:
// comentarios (-- con espacio, #, /* */), comillas, conversión de tipos, UNION, ORDER BY, LIMIT,
// subconsultas, information_schema, funciones (SUBSTRING, ASCII, IF, SLEEP, EXTRACTVALUE...) y
// los mismos códigos de error. Sin DOM: también se usa desde Node en las pruebas.
(function (root) {
  'use strict';

  // ── Base de datos simulada ──
  const DB_NAME = 'shop_db';
  const SERVER = { version: '8.0.36', user: 'webapp@localhost', hostname: 'shop-db-01', datadir: '/var/lib/mysql/' };

  const TABLES = {
    usuarios: {
      columns: ['id', 'usuario', 'clave', 'email', 'rol'],
      types: ['int', 'varchar', 'varchar', 'varchar', 'varchar'],
      rows: [
        [1, 'admin', 'P@ssw0rd!', 'admin@empresa.com', 'ADMIN'],
        [2, 'juan', 'abc123', 'juan@empresa.com', 'USER'],
        [3, 'sara', 'pass2024', 'sara@empresa.com', 'USER'],
      ],
    },
    productos: {
      columns: ['id', 'nombre', 'precio', 'stock'],
      types: ['int', 'varchar', 'decimal', 'int'],
      rows: [
        [1, 'Camiseta', 19.99, 120],
        [2, 'Camiseta Premium', 34.99, 40],
        [3, 'Pantalón', 49.99, 65],
        [4, 'Zapatillas', 59.9, 30],
        [5, 'Sudadera', 39.95, 0],
      ],
    },
  };

  function infoSchema() {
    const tables = [];
    const columns = [];
    for (const [name, t] of Object.entries(TABLES)) {
      tables.push([DB_NAME, name, 'BASE TABLE', t.rows.length]);
      t.columns.forEach((c, i) => columns.push([DB_NAME, name, c, t.types[i], i + 1]));
    }
    return {
      schemata: { columns: ['schema_name'], rows: [['information_schema'], [DB_NAME]] },
      tables: { columns: ['table_schema', 'table_name', 'table_type', 'table_rows'], rows: tables },
      columns: { columns: ['table_schema', 'table_name', 'column_name', 'data_type', 'ordinal_position'], rows: columns },
    };
  }

  // ── Errores con el formato de MySQL ──
  class SqlError extends Error {
    constructor(code, state, message, extra) {
      super(`ERROR ${code} (${state}): ${message}`);
      this.code = code;
      this.state = state;
      this.mysqlMessage = message;
      Object.assign(this, extra || {});
    }
  }

  const near = (sql, pos) => sql.slice(pos, pos + 80);
  const syntaxError = (sql, pos, extra) =>
    new SqlError(1064, '42000', `You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '${near(sql, pos)}' at line 1`, extra);

  // ── Léxico ──
  function tokenize(sql) {
    const tokens = [];
    const comments = [];
    let dashNoSpace = false; // "--" sin espacio detrás: en MySQL NO es comentario
    let i = 0;
    const n = sql.length;
    const isSpace = (c) => c === undefined || /[\s\x00-\x1f]/.test(c);

    while (i < n) {
      const c = sql[i];
      if (/\s/.test(c)) { i++; continue; }

      if (c === '#') {
        const end = sql.indexOf('\n', i);
        const stop = end === -1 ? n : end;
        comments.push({ start: i, end: stop });
        i = stop;
        continue;
      }
      if (c === '-' && sql[i + 1] === '-') {
        if (isSpace(sql[i + 2])) {
          const end = sql.indexOf('\n', i);
          const stop = end === -1 ? n : end;
          comments.push({ start: i, end: stop });
          i = stop;
          continue;
        }
        dashNoSpace = true;
      }
      if (c === '/' && sql[i + 1] === '*') {
        const end = sql.indexOf('*/', i + 2);
        if (end === -1) throw syntaxError(sql, i, { dashNoSpace });
        comments.push({ start: i, end: end + 2 });
        i = end + 2;
        continue;
      }

      const start = i;
      if (c === "'" || c === '"') {
        let v = '';
        i++;
        for (;;) {
          if (i >= n) throw syntaxError(sql, start, { dashNoSpace, unterminated: true });
          const ch = sql[i];
          if (ch === '\\' && i + 1 < n) {
            const e = sql[i + 1];
            v += e === 'n' ? '\n' : e === 't' ? '\t' : e === '0' ? '\0' : e;
            i += 2;
            continue;
          }
          if (ch === c) {
            if (sql[i + 1] === c) { v += c; i += 2; continue; }
            i++;
            break;
          }
          v += ch;
          i++;
        }
        tokens.push({ type: 'str', value: v, start, end: i });
        continue;
      }
      if (c === '`') {
        const end = sql.indexOf('`', i + 1);
        if (end === -1) throw syntaxError(sql, i, { dashNoSpace });
        tokens.push({ type: 'ident', value: sql.slice(i + 1, end), quoted: true, start, end: end + 1 });
        i = end + 1;
        continue;
      }
      if (c === '0' && /[xX]/.test(sql[i + 1] || '') && /[0-9a-fA-F]/.test(sql[i + 2] || '')) {
        let j = i + 2;
        while (j < n && /[0-9a-fA-F]/.test(sql[j])) j++;
        let hex = sql.slice(i + 2, j);
        if (hex.length % 2) hex = '0' + hex;
        let s = '';
        for (let k = 0; k < hex.length; k += 2) s += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16));
        tokens.push({ type: 'str', value: s, hex: true, start, end: j });
        i = j;
        continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(sql[i + 1] || ''))) {
        let j = i;
        while (j < n && /[0-9]/.test(sql[j])) j++;
        if (sql[j] === '.' && /[0-9]/.test(sql[j + 1] || '')) { j++; while (j < n && /[0-9]/.test(sql[j])) j++; }
        if (/[eE]/.test(sql[j] || '') && /[-+0-9]/.test(sql[j + 1] || '')) { j += 2; while (j < n && /[0-9]/.test(sql[j])) j++; }
        // "1abc" es un identificador en MySQL; lo tratamos como error de sintaxis más adelante
        tokens.push({ type: 'num', value: Number(sql.slice(i, j)), start, end: j });
        i = j;
        continue;
      }
      if (c === '@' && sql[i + 1] === '@') {
        let j = i + 2;
        while (j < n && /[\w.]/.test(sql[j])) j++;
        tokens.push({ type: 'sysvar', value: sql.slice(i + 2, j).toLowerCase().replace(/^(global|session)\./, ''), start, end: j });
        i = j;
        continue;
      }
      if (/[A-Za-z_$À-￿]/.test(c)) {
        let j = i;
        while (j < n && /[\w$À-￿]/.test(sql[j])) j++;
        tokens.push({ type: 'ident', value: sql.slice(i, j), start, end: j });
        i = j;
        continue;
      }
      const two = sql.slice(i, i + 2);
      if (['<=', '>=', '<>', '!=', '||', '&&'].includes(two)) {
        tokens.push({ type: 'op', value: two, start, end: i + 2 });
        i += 2;
        continue;
      }
      if ('=<>+-*/%!(),.;'.includes(c)) {
        tokens.push({ type: 'op', value: c, start, end: i + 1 });
        i++;
        continue;
      }
      throw syntaxError(sql, i, { dashNoSpace });
    }
    tokens.push({ type: 'eof', value: '', start: n, end: n });
    return { tokens, comments, dashNoSpace };
  }

  // ── Sintaxis ──
  const RESERVED = new Set(['select', 'from', 'where', 'union', 'all', 'distinct', 'as', 'and', 'or', 'not', 'xor',
    'like', 'is', 'null', 'in', 'between', 'order', 'by', 'asc', 'desc', 'limit', 'offset', 'true', 'false', 'div',
    'mod', 'group', 'having', 'separator', 'into', 'drop', 'delete', 'update', 'insert', 'table']);

  function parse(sql) {
    const lex = tokenize(sql);
    const toks = lex.tokens;
    let p = 0;
    const peek = (o = 0) => toks[Math.min(p + o, toks.length - 1)];
    const isKw = (tok, kw) => tok.type === 'ident' && !tok.quoted && tok.value.toLowerCase() === kw;
    const isOp = (tok, op) => tok.type === 'op' && tok.value === op;
    const fail = (tok) => { throw syntaxError(sql, (tok || peek()).start, { dashNoSpace: lex.dashNoSpace }); };
    const acceptKw = (kw) => { if (isKw(peek(), kw)) { p++; return true; } return false; };
    const acceptOp = (op) => { if (isOp(peek(), op)) { p++; return true; } return false; };
    const expectKw = (kw) => { if (!acceptKw(kw)) fail(); };
    const expectOp = (op) => { if (!acceptOp(op)) fail(); };
    const textOf = (a, b) => sql.slice(toks[a].start, toks[b - 1].end);

    function parseStatement() {
      const selects = [parseSelect()];
      const unionAll = [];
      while (acceptKw('union')) {
        unionAll.push(acceptKw('all') || (acceptKw('distinct'), false));
        selects.push(parseSelect());
      }
      let orderBy = null;
      let limit = null;
      if (acceptKw('order')) { expectKw('by'); orderBy = parseOrderList(); }
      if (acceptKw('limit')) limit = parseLimit();
      acceptOp(';');
      if (peek().type !== 'eof') fail();
      return { selects, unionAll, orderBy, limit };
    }

    function parseOrderList() {
      const list = [];
      do {
        const start = p;
        const expr = parseExpr();
        let desc = false;
        if (acceptKw('desc')) desc = true; else acceptKw('asc');
        list.push({ expr, desc, text: textOf(start, p) });
      } while (acceptOp(','));
      return list;
    }

    function parseLimit() {
      const a = peek();
      if (a.type !== 'num') fail();
      p++;
      if (acceptOp(',')) {
        const b = peek();
        if (b.type !== 'num') fail();
        p++;
        return { offset: a.value, count: b.value };
      }
      if (acceptKw('offset')) {
        const b = peek();
        if (b.type !== 'num') fail();
        p++;
        return { offset: b.value, count: a.value };
      }
      return { offset: 0, count: a.value };
    }

    function parseSelect() {
      if (acceptOp('(')) { const s = parseSelect(); expectOp(')'); return s; }
      expectKw('select');
      const distinct = acceptKw('distinct');
      acceptKw('all');
      const items = [];
      do {
        const start = p;
        if (isOp(peek(), '*')) { p++; items.push({ star: true }); continue; }
        if (peek().type === 'ident' && isOp(peek(1), '.') && isOp(peek(2), '*')) {
          const tbl = peek().value; p += 3; items.push({ star: true, table: tbl }); continue;
        }
        const expr = parseExpr();
        let alias = null;
        if (acceptKw('as')) {
          const a = peek();
          if (a.type !== 'ident' && a.type !== 'str') fail();
          alias = a.value; p++;
        } else if (peek().type === 'ident' && !RESERVED.has(peek().value.toLowerCase())) {
          alias = peek().value; p++;
        }
        items.push({ expr, alias, text: textOf(start, p) });
      } while (acceptOp(','));

      let from = null;
      if (acceptKw('from')) {
        const t1 = peek();
        if (t1.type !== 'ident') fail();
        p++;
        let schema = null;
        let table = t1.value;
        if (acceptOp('.')) {
          const t2 = peek();
          if (t2.type !== 'ident') fail();
          p++;
          schema = table; table = t2.value;
        }
        let alias = null;
        if (acceptKw('as')) { alias = peek().value; p++; }
        else if (peek().type === 'ident' && !RESERVED.has(peek().value.toLowerCase())) { alias = peek().value; p++; }
        from = { schema, table, alias };
      }
      let where = null;
      if (acceptKw('where')) where = parseExpr();
      if (isKw(peek(), 'group')) { p++; expectKw('by'); parseOrderList(); } // aceptado y no usado: no hay agregaciones por grupo
      return { distinct, items, from, where };
    }

    // Precedencia de MySQL: OR < XOR < AND < NOT < comparación < +/- < * / % < unario
    function parseExpr() { return parseOr(); }
    function parseOr() {
      let left = parseXor();
      while (acceptKw('or') || acceptOp('||')) left = { op: 'or', a: left, b: parseXor() };
      return left;
    }
    function parseXor() {
      let left = parseAnd();
      while (acceptKw('xor')) left = { op: 'xor', a: left, b: parseAnd() };
      return left;
    }
    function parseAnd() {
      let left = parseNot();
      while (acceptKw('and') || acceptOp('&&')) left = { op: 'and', a: left, b: parseNot() };
      return left;
    }
    function parseNot() {
      if (acceptKw('not')) return { op: 'not', a: parseNot() };
      return parseComparison();
    }
    function parseComparison() {
      let left = parseAdd();
      for (;;) {
        const tk = peek();
        if (tk.type === 'op' && ['=', '<>', '!=', '<', '>', '<=', '>='].includes(tk.value)) {
          p++;
          left = { op: 'cmp', cmp: tk.value === '!=' ? '<>' : tk.value, a: left, b: parseAdd() };
          continue;
        }
        if (isKw(tk, 'is')) {
          p++;
          const neg = acceptKw('not');
          let test;
          if (acceptKw('null')) test = 'null';
          else if (acceptKw('true')) test = 'true';
          else if (acceptKw('false')) test = 'false';
          else fail();
          left = { op: 'is', test, neg, a: left };
          continue;
        }
        let neg = false;
        if (isKw(tk, 'not') && (isKw(peek(1), 'like') || isKw(peek(1), 'in') || isKw(peek(1), 'between'))) { p++; neg = true; }
        if (acceptKw('like')) { left = { op: 'like', neg, a: left, b: parseAdd() }; continue; }
        if (acceptKw('in')) {
          expectOp('(');
          if (isKw(peek(), 'select')) {
            const sub = parseStatementInParens();
            left = { op: 'in', neg, a: left, sub };
          } else {
            const list = [];
            do list.push(parseExpr()); while (acceptOp(','));
            expectOp(')');
            left = { op: 'in', neg, a: left, list };
          }
          continue;
        }
        if (acceptKw('between')) {
          const lo = parseAdd();
          expectKw('and');
          const hi = parseAdd();
          left = { op: 'between', neg, a: left, lo, hi };
          continue;
        }
        if (neg) fail();
        return left;
      }
    }
    function parseAdd() {
      let left = parseMul();
      for (;;) {
        if (acceptOp('+')) left = { op: 'arith', f: '+', a: left, b: parseMul() };
        else if (acceptOp('-')) left = { op: 'arith', f: '-', a: left, b: parseMul() };
        else return left;
      }
    }
    function parseMul() {
      let left = parseUnary();
      for (;;) {
        if (acceptOp('*')) left = { op: 'arith', f: '*', a: left, b: parseUnary() };
        else if (acceptOp('/')) left = { op: 'arith', f: '/', a: left, b: parseUnary() };
        else if (acceptOp('%') || acceptKw('mod')) left = { op: 'arith', f: '%', a: left, b: parseUnary() };
        else if (acceptKw('div')) left = { op: 'arith', f: 'div', a: left, b: parseUnary() };
        else return left;
      }
    }
    function parseUnary() {
      if (acceptOp('-')) return { op: 'neg', a: parseUnary() };
      if (acceptOp('+')) return parseUnary();
      if (acceptOp('!')) return { op: 'not', a: parseUnary() };
      return parsePrimary();
    }
    // (SELECT ...) completo, incluidos UNION/ORDER/LIMIT, hasta el paréntesis de cierre
    function parseStatementInParens() {
      const selects = [parseSelect()];
      const unionAll = [];
      while (acceptKw('union')) { unionAll.push(acceptKw('all')); selects.push(parseSelect()); }
      let orderBy = null;
      let limit = null;
      if (acceptKw('order')) { expectKw('by'); orderBy = parseOrderList(); }
      if (acceptKw('limit')) limit = parseLimit();
      expectOp(')');
      return { selects, unionAll, orderBy, limit };
    }
    function parsePrimary() {
      const tk = peek();
      if (tk.type === 'num') { p++; return { op: 'lit', v: tk.value }; }
      if (tk.type === 'str') {
        p++;
        let v = tk.value;
        while (peek().type === 'str' && !peek().hex) { v += peek().value; p++; } // 'a' 'b' -> 'ab'
        return { op: 'lit', v };
      }
      if (tk.type === 'sysvar') { p++; return { op: 'sysvar', name: tk.value }; }
      if (isOp(tk, '(')) {
        p++;
        if (isKw(peek(), 'select')) return { op: 'subq', sub: parseStatementInParens() };
        const e = parseExpr();
        if (acceptOp(',')) { // (a, b) fila: solo nos interesa para dar el error 1241
          const list = [e];
          do list.push(parseExpr()); while (acceptOp(','));
          expectOp(')');
          return { op: 'row', list };
        }
        expectOp(')');
        return e;
      }
      if (tk.type === 'ident') {
        const lower = tk.value.toLowerCase();
        if (!tk.quoted) {
          if (lower === 'null') { p++; return { op: 'lit', v: null }; }
          if (lower === 'true') { p++; return { op: 'lit', v: 1 }; }
          if (lower === 'false') { p++; return { op: 'lit', v: 0 }; }
        }
        if (isOp(peek(1), '(') && !tk.quoted) {
          p += 2;
          const args = [];
          let star = false;
          let distinct = false;
          let separator = ',';
          if (isOp(peek(), '*')) { p++; star = true; }
          else if (!isOp(peek(), ')')) {
            distinct = acceptKw('distinct');
            do args.push(parseExpr()); while (acceptOp(','));
            if (acceptKw('separator')) {
              const s = peek();
              if (s.type !== 'str') fail();
              separator = s.value; p++;
            }
          }
          expectOp(')');
          return { op: 'fn', name: lower, args, star, distinct, separator, text: tk.value };
        }
        if (RESERVED.has(lower) && !tk.quoted) fail(tk);
        p++;
        if (acceptOp('.')) {
          const col = peek();
          if (col.type !== 'ident') fail();
          p++;
          return { op: 'col', table: tk.value, name: col.value };
        }
        return { op: 'col', name: tk.value };
      }
      fail(tk);
    }

    const stmt = parseStatement();
    return { stmt, lex };
  }

  // ── Tipos y comparación al estilo MySQL ──
  const isNum = (v) => typeof v === 'number';
  function toNumber(v) {
    if (v === null) return null;
    if (isNum(v)) return v;
    const m = String(v).trim().match(/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i); // '1abc' -> 1, 'abc' -> 0
    return m ? Number(m[0]) : 0;
  }
  function toStr(v) {
    if (v === null) return null;
    if (isNum(v)) return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(10)));
    return String(v);
  }
  const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); // collation _ai_ci
  function compare(a, b) {
    if (a === null || b === null) return null;
    if (isNum(a) || isNum(b)) {
      const x = toNumber(a);
      const y = toNumber(b);
      return x < y ? -1 : x > y ? 1 : 0;
    }
    const x = fold(String(a)).replace(/ +$/, '');
    const y = fold(String(b)).replace(/ +$/, '');
    return x < y ? -1 : x > y ? 1 : 0;
  }
  function truthy(v) {
    if (v === null) return null;
    return toNumber(v) !== 0;
  }
  const bool = (b) => (b === null ? null : b ? 1 : 0);
  function likeToRegex(pattern) {
    let re = '';
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern[i];
      if (c === '\\' && i + 1 < pattern.length) { re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; }
      if (c === '%') re += '[\\s\\S]*';
      else if (c === '_') re += '[\\s\\S]';
      else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp('^' + re + '$');
  }

  // EXTRACTVALUE/UPDATEXML: una XPath que empieza por un carácter no válido produce el error "XPATH syntax error"
  function checkXPath(xpath) {
    if (xpath === null) return;
    const s = toStr(xpath);
    const bad = s.search(/[~!#$%^&`{}|\\"';?<>]/);
    if (bad !== -1) {
      throw new SqlError(1105, 'HY000', `XPATH syntax error: '${s.slice(bad, bad + 31)}'`, { xpathLeak: s.slice(bad, bad + 31) });
    }
  }

  const AGGREGATES = new Set(['count', 'group_concat', 'max', 'min', 'sum', 'avg']);
  function hasAggregate(e) {
    if (!e || typeof e !== 'object') return false;
    if (e.op === 'fn' && AGGREGATES.has(e.name)) return true;
    return ['a', 'b', 'lo', 'hi'].some((k) => hasAggregate(e[k])) || (e.args || []).some(hasAggregate) || (e.list || []).some(hasAggregate);
  }

  // ── Ejecución ──
  function makeContext(options) {
    return { delay: 0, warnings: [], ...options };
  }

  function lookupTable(from, sql) {
    const schema = from.schema ? from.schema.toLowerCase() : DB_NAME;
    const name = from.table.toLowerCase();
    if (schema === 'information_schema') {
      const t = infoSchema()[name];
      if (t) return t;
      throw new SqlError(1109, '42S02', `Unknown table '${from.table.toUpperCase()}' in information_schema`);
    }
    if (schema === DB_NAME && TABLES[name]) return TABLES[name];
    throw new SqlError(1146, '42S02', `Table '${schema}.${from.table}' doesn't exist`);
  }

  function evalExpr(e, row, scope, ctx, clause) {
    switch (e.op) {
      case 'lit': return e.v;
      case 'sysvar': {
        const vars = { version: SERVER.version, hostname: SERVER.hostname, datadir: SERVER.datadir, version_comment: 'MySQL Community Server - GPL', port: 3306 };
        if (!(e.name in vars)) throw new SqlError(1193, 'HY000', `Unknown system variable '${e.name}'`);
        return vars[e.name];
      }
      case 'col': {
        if (!scope) throw new SqlError(1054, '42S22', `Unknown column '${e.name}' in '${clause}'`);
        if (e.table && ![scope.table, scope.alias].filter(Boolean).some((t) => t.toLowerCase() === e.table.toLowerCase())) {
          throw new SqlError(1054, '42S22', `Unknown column '${e.table}.${e.name}' in '${clause}'`);
        }
        const idx = scope.columns.findIndex((c) => c.toLowerCase() === e.name.toLowerCase());
        if (idx === -1) throw new SqlError(1054, '42S22', `Unknown column '${e.table ? e.table + '.' : ''}${e.name}' in '${clause}'`);
        return row ? row[idx] : null;
      }
      case 'row': throw new SqlError(1241, '21000', 'Operand should contain 1 column(s)');
      case 'neg': { const v = toNumber(evalExpr(e.a, row, scope, ctx, clause)); return v === null ? null : -v; }
      case 'not': { const v = truthy(evalExpr(e.a, row, scope, ctx, clause)); return v === null ? null : bool(!v); }
      case 'and': {
        const a = truthy(evalExpr(e.a, row, scope, ctx, clause));
        if (a === false) return 0;
        const b = truthy(evalExpr(e.b, row, scope, ctx, clause));
        if (b === false) return 0;
        return a === null || b === null ? null : 1;
      }
      case 'or': {
        const a = truthy(evalExpr(e.a, row, scope, ctx, clause));
        if (a === true) return 1;
        const b = truthy(evalExpr(e.b, row, scope, ctx, clause));
        if (b === true) return 1;
        return a === null || b === null ? null : 0;
      }
      case 'xor': {
        const a = truthy(evalExpr(e.a, row, scope, ctx, clause));
        const b = truthy(evalExpr(e.b, row, scope, ctx, clause));
        return a === null || b === null ? null : bool(a !== b);
      }
      case 'cmp': {
        const r = compare(evalExpr(e.a, row, scope, ctx, clause), evalExpr(e.b, row, scope, ctx, clause));
        if (r === null) return null;
        return bool({ '=': r === 0, '<>': r !== 0, '<': r < 0, '>': r > 0, '<=': r <= 0, '>=': r >= 0 }[e.cmp]);
      }
      case 'is': {
        const v = evalExpr(e.a, row, scope, ctx, clause);
        let r;
        if (e.test === 'null') r = v === null;
        else if (e.test === 'true') r = truthy(v) === true;
        else r = truthy(v) === false;
        return bool(e.neg ? !r : r);
      }
      case 'like': {
        const v = evalExpr(e.a, row, scope, ctx, clause);
        const pat = evalExpr(e.b, row, scope, ctx, clause);
        if (v === null || pat === null) return null;
        const r = likeToRegex(fold(toStr(pat))).test(fold(toStr(v)));
        return bool(e.neg ? !r : r);
      }
      case 'in': {
        const v = evalExpr(e.a, row, scope, ctx, clause);
        const values = e.sub ? runStatement(e.sub, ctx, true).rows.map((r) => r[0]) : e.list.map((x) => evalExpr(x, row, scope, ctx, clause));
        if (v === null) return null;
        let sawNull = false;
        for (const x of values) {
          const r = compare(v, x);
          if (r === 0) return bool(!e.neg);
          if (r === null) sawNull = true;
        }
        return sawNull ? null : bool(e.neg);
      }
      case 'between': {
        const v = evalExpr(e.a, row, scope, ctx, clause);
        const lo = compare(v, evalExpr(e.lo, row, scope, ctx, clause));
        const hi = compare(v, evalExpr(e.hi, row, scope, ctx, clause));
        if (lo === null || hi === null) return null;
        const r = lo >= 0 && hi <= 0;
        return bool(e.neg ? !r : r);
      }
      case 'arith': {
        const a = toNumber(evalExpr(e.a, row, scope, ctx, clause));
        const b = toNumber(evalExpr(e.b, row, scope, ctx, clause));
        if (a === null || b === null) return null;
        switch (e.f) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': return b === 0 ? null : a / b;
          case '%': return b === 0 ? null : a % b;
          case 'div': return b === 0 ? null : Math.trunc(a / b);
        }
        return null;
      }
      case 'subq': {
        const res = runStatement(e.sub, ctx, true);
        if (res.columns.length !== 1) throw new SqlError(1241, '21000', 'Operand should contain 1 column(s)');
        if (res.rows.length > 1) throw new SqlError(1242, '21000', 'Subquery returns more than 1 row');
        return res.rows.length ? res.rows[0][0] : null;
      }
      case 'fn': return callFunction(e, row, scope, ctx, clause);
    }
    throw new SqlError(1064, '42000', 'Unsupported expression');
  }

  function callFunction(e, row, scope, ctx, clause) {
    if (AGGREGATES.has(e.name)) {
      throw new SqlError(1111, 'HY000', 'Invalid use of group function');
    }
    const arg = (i) => evalExpr(e.args[i], row, scope, ctx, clause);
    const all = () => e.args.map((_, i) => arg(i));
    const need = (min, max = min) => {
      if (e.args.length < min || e.args.length > max) {
        throw new SqlError(1582, '42000', `Incorrect parameter count in the call to native function '${e.text}'`);
      }
    };
    switch (e.name) {
      case 'database': case 'schema': need(0); return DB_NAME;
      case 'user': case 'current_user': case 'session_user': case 'system_user': need(0); return SERVER.user;
      case 'version': need(0); return SERVER.version;
      case 'concat': { need(1, 99); const v = all(); return v.some((x) => x === null) ? null : v.map(toStr).join(''); }
      case 'concat_ws': { need(2, 99); const v = all(); if (v[0] === null) return null; return v.slice(1).filter((x) => x !== null).map(toStr).join(toStr(v[0])); }
      case 'substring': case 'substr': case 'mid': {
        need(2, 3);
        const s = arg(0);
        const pos = toNumber(arg(1));
        const len = e.args.length === 3 ? toNumber(arg(2)) : null;
        if (s === null || pos === null || (e.args.length === 3 && len === null)) return null;
        const chars = Array.from(toStr(s));
        if (pos === 0) return '';
        const start = pos > 0 ? pos - 1 : chars.length + pos;
        if (start < 0 || start >= chars.length) return '';
        const out = len === null ? chars.slice(start) : len <= 0 ? [] : chars.slice(start, start + Math.trunc(len));
        return out.join('');
      }
      case 'left': case 'right': {
        need(2);
        const s = arg(0); const k = toNumber(arg(1));
        if (s === null || k === null) return null;
        const chars = Array.from(toStr(s));
        if (k <= 0) return '';
        return (e.name === 'left' ? chars.slice(0, k) : chars.slice(-k)).join('');
      }
      case 'length': case 'octet_length': { need(1); const s = arg(0); return s === null ? null : new TextEncoder().encode(toStr(s)).length; }
      case 'char_length': case 'character_length': { need(1); const s = arg(0); return s === null ? null : Array.from(toStr(s)).length; }
      case 'ascii': { need(1); const s = arg(0); if (s === null) return null; const b = new TextEncoder().encode(toStr(s)); return b.length ? b[0] : 0; }
      case 'ord': { need(1); const s = arg(0); if (s === null) return null; const str = toStr(s); return str.length ? str.codePointAt(0) : 0; }
      case 'char': { need(1, 99); return all().filter((x) => x !== null).map((x) => String.fromCharCode(toNumber(x))).join(''); }
      case 'hex': { need(1); const s = arg(0); if (s === null) return null; return isNum(s) ? Math.trunc(s).toString(16).toUpperCase() : Array.from(new TextEncoder().encode(toStr(s))).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase(); }
      case 'upper': case 'ucase': { need(1); const s = arg(0); return s === null ? null : toStr(s).toUpperCase(); }
      case 'lower': case 'lcase': { need(1); const s = arg(0); return s === null ? null : toStr(s).toLowerCase(); }
      case 'reverse': { need(1); const s = arg(0); return s === null ? null : Array.from(toStr(s)).reverse().join(''); }
      case 'if': { need(3); return truthy(arg(0)) === true ? arg(1) : arg(2); }
      case 'ifnull': { need(2); const a = arg(0); return a === null ? arg(1) : a; }
      case 'nullif': { need(2); const a = arg(0); return compare(a, arg(1)) === 0 ? null : a; }
      case 'coalesce': { need(1, 99); for (let i = 0; i < e.args.length; i++) { const v = arg(i); if (v !== null) return v; } return null; }
      case 'sleep': {
        need(1);
        const s = toNumber(arg(0));
        if (s !== null && s > 0) ctx.delay += s;
        return 0;
      }
      case 'extractvalue': { need(2); arg(0); checkXPath(arg(1)); return null; }
      case 'updatexml': { need(3); arg(0); checkXPath(arg(1)); arg(2); return null; }
      case 'floor': { need(1); const v = toNumber(arg(0)); return v === null ? null : Math.floor(v); }
      case 'rand': { need(0, 1); return Math.random(); }
    }
    throw new SqlError(1305, '42000', `FUNCTION ${DB_NAME}.${e.text} does not exist`);
  }

  function evalAggregate(e, rows, scope, ctx) {
    if (e.op === 'fn' && AGGREGATES.has(e.name)) {
      if (e.name === 'count') {
        if (e.star) return rows.length;
        return rows.filter((r) => evalExpr(e.args[0], r, scope, ctx, 'field list') !== null).length;
      }
      const vals = rows.map((r) => (e.args.length > 1 && e.name === 'group_concat'
        ? (() => { const v = e.args.map((a) => evalExpr(a, r, scope, ctx, 'field list')); return v.some((x) => x === null) ? null : v.map(toStr).join(''); })()
        : evalExpr(e.args[0], r, scope, ctx, 'field list'))).filter((v) => v !== null);
      const uniq = e.distinct ? vals.filter((v, i) => vals.findIndex((w) => compare(v, w) === 0) === i) : vals;
      if (!uniq.length) return null;
      switch (e.name) {
        case 'group_concat': return uniq.map(toStr).join(e.separator).slice(0, 1024);
        case 'max': return uniq.reduce((a, b) => (compare(b, a) > 0 ? b : a));
        case 'min': return uniq.reduce((a, b) => (compare(b, a) < 0 ? b : a));
        case 'sum': return uniq.reduce((a, b) => a + toNumber(b), 0);
        case 'avg': return uniq.reduce((a, b) => a + toNumber(b), 0) / uniq.length;
      }
    }
    // Expresión que contiene agregados: se sustituyen y se evalúa con la primera fila
    if (e && typeof e === 'object' && hasAggregate(e)) {
      const copy = { ...e };
      for (const k of ['a', 'b', 'lo', 'hi']) if (copy[k]) copy[k] = { op: 'lit', v: evalAggregate(copy[k], rows, scope, ctx) };
      if (copy.args) copy.args = copy.args.map((a) => ({ op: 'lit', v: evalAggregate(a, rows, scope, ctx) }));
      return evalExpr(copy, rows[0] || null, scope, ctx, 'field list');
    }
    return evalExpr(e, rows[0] || null, scope, ctx, 'field list');
  }

  function runSelect(sel, ctx) {
    let scope = null;
    let rows = [null];
    if (sel.from) {
      const t = lookupTable(sel.from, '');
      scope = { columns: t.columns, table: sel.from.table, alias: sel.from.alias };
      rows = t.rows.slice();
    }
    if (sel.where) {
      rows = rows.filter((r) => truthy(evalExpr(sel.where, r, scope, ctx, 'where clause')) === true);
    }
    const columns = [];
    sel.items.forEach((it) => {
      if (it.star) {
        if (!scope) throw new SqlError(1096, 'HY000', 'No tables used');
        columns.push(...scope.columns);
      } else {
        columns.push(it.alias || it.text);
      }
    });

    const aggregate = sel.items.some((it) => !it.star && hasAggregate(it.expr));
    let out;
    if (aggregate) {
      out = [sel.items.flatMap((it) => (it.star ? scope.columns.map((_, i) => (rows[0] ? rows[0][i] : null)) : [evalAggregate(it.expr, rows, scope, ctx)]))];
    } else {
      // Se valida la lista de columnas aunque no haya filas (MySQL da "Unknown column" igualmente)
      if (!rows.length) { const probe = makeContext(); sel.items.forEach((it) => { if (!it.star) evalExpr(it.expr, null, scope, probe, 'field list'); }); }
      out = rows.map((r) => sel.items.flatMap((it) => (it.star ? r.slice() : [evalExpr(it.expr, r, scope, ctx, 'field list')])));
    }
    if (sel.distinct) out = out.filter((r, i) => out.findIndex((s) => s.every((v, k) => compare(v, r[k]) === 0 || (v === null && r[k] === null))) === i);
    return { columns, rows: out, scope };
  }

  function runStatement(stmt, ctx) {
    const parts = stmt.selects.map((s) => runSelect(s, ctx));
    const width = parts[0].columns.length;
    if (parts.some((r) => r.columns.length !== width)) {
      throw new SqlError(1222, '21000', 'The used SELECT statements have a different number of columns');
    }
    let rows = parts[0].rows.slice();
    parts.slice(1).forEach((part, i) => {
      rows = rows.concat(part.rows);
      if (!stmt.unionAll[i]) rows = rows.filter((r, k) => rows.findIndex((s) => s.every((v, j) => compare(v, r[j]) === 0 || (v === null && r[j] === null))) === k);
    });
    const columns = parts[0].columns;

    if (stmt.orderBy) {
      const scope = stmt.selects.length === 1 ? parts[0].scope : null;
      const keys = stmt.orderBy.map((o) => {
        if (o.expr.op === 'lit' && isNum(o.expr.v)) {
          const n = o.expr.v;
          if (!Number.isInteger(n) || n < 1 || n > width) throw new SqlError(1054, '42S22', `Unknown column '${o.text}' in 'order clause'`);
          return { idx: n - 1, desc: o.desc };
        }
        if (o.expr.op === 'col') {
          const idx = columns.findIndex((c) => c.toLowerCase() === o.expr.name.toLowerCase());
          if (idx !== -1) return { idx, desc: o.desc };
          if (!scope || !scope.columns.some((c) => c.toLowerCase() === o.expr.name.toLowerCase())) {
            throw new SqlError(1054, '42S22', `Unknown column '${o.text}' in 'order clause'`);
          }
        }
        return { idx: -1, desc: o.desc }; // expresión: no cambia el orden en este simulador
      });
      rows.sort((r1, r2) => {
        for (const k of keys) {
          if (k.idx < 0) continue;
          const c = compare(r1[k.idx], r2[k.idx]);
          if (c) return k.desc ? -c : c;
          if (r1[k.idx] === null && r2[k.idx] !== null) return k.desc ? 1 : -1;
          if (r2[k.idx] === null && r1[k.idx] !== null) return k.desc ? -1 : 1;
        }
        return 0;
      });
    }
    if (stmt.limit) rows = rows.slice(stmt.limit.offset, stmt.limit.offset + stmt.limit.count);
    return { columns, rows };
  }

  // Ejecuta una consulta completa. Devuelve { ok, columns, rows, delay } o { ok:false, error }.
  function execute(sql, options) {
    const ctx = makeContext(options);
    let lex = null;
    try {
      const parsed = parse(sql);
      lex = parsed.lex;
      const res = runStatement(parsed.stmt, ctx);
      return { ok: true, columns: res.columns, rows: res.rows, delay: ctx.delay, dashNoSpace: lex.dashNoSpace };
    } catch (err) {
      if (err instanceof SqlError) {
        return { ok: false, error: err, delay: ctx.delay, dashNoSpace: !!(err.dashNoSpace || (lex && lex.dashNoSpace)) };
      }
      throw err;
    }
  }

  // ¿La entrada ha cambiado la estructura de la consulta? Se compara con un valor inocente.
  function structureOf(sql) {
    try {
      const { tokens, comments } = tokenize(sql);
      return tokens.map((t) => t.type + (t.type === 'op' || (t.type === 'ident' && RESERVED.has(t.value.toLowerCase())) ? ':' + t.value.toLowerCase() : '')).join(' ') + ` #${comments.length}`;
    } catch (e) {
      return 'error';
    }
  }
  function isInjection(template, input, benign) {
    const fill = (v) => template.replace('{INPUT}', v);
    return structureOf(fill(input)) !== structureOf(fill(benign === undefined ? 'x' : benign));
  }

  // Consulta parametrizada: el valor se liga como dato y nunca se interpreta
  function executePrepared(template, values) {
    let i = 0;
    const sql = template.replace(/\?/g, () => {
      const v = values[i++];
      return v === null || v === undefined ? 'NULL' : isNum(v) ? String(v) : "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
    });
    return execute(sql);
  }

  // ── Resaltado (escapa HTML; marca la parte que escribió el usuario) ──
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  const KEYWORDS = new Set([...RESERVED, 'like', 'limit', 'order', 'group', 'by']);
  // ranges: [[inicio, fin], ...] con las partes que escribió el usuario
  function highlight(sql, ranges = []) {
    let lex;
    try { lex = tokenize(sql); } catch (e) { lex = null; }
    const spans = [];
    if (lex) {
      lex.tokens.forEach((t) => {
        if (t.type === 'eof') return;
        let cls = '';
        if (t.type === 'str') cls = 'sq-s';
        else if (t.type === 'num') cls = 'sq-v';
        else if (t.type === 'op') cls = 'sq-op';
        else if (t.type === 'ident' && KEYWORDS.has(t.value.toLowerCase())) cls = 'sq-k';
        else if (t.type === 'ident' || t.type === 'sysvar') cls = 'sq-id';
        spans.push({ start: t.start, end: t.end, cls });
      });
      lex.comments.forEach((c) => spans.push({ start: c.start, end: c.end, cls: 'sq-c' }));
      spans.sort((a, b) => a.start - b.start);
    }
    // Cortes en los límites de la entrada del usuario para poder marcarla aunque parta un token
    const cuts = new Set([0, sql.length]);
    spans.forEach((s) => { cuts.add(s.start); cuts.add(s.end); });
    ranges.forEach(([a, b]) => { cuts.add(a); cuts.add(b); });
    const points = [...cuts].filter((x) => x >= 0 && x <= sql.length).sort((a, b) => a - b);
    let html = '';
    for (let k = 0; k < points.length - 1; k++) {
      const a = points[k];
      const b = points[k + 1];
      if (a === b) continue;
      const span = spans.find((s) => s.start <= a && b <= s.end);
      const classes = [];
      if (span && span.cls) classes.push(span.cls);
      if (ranges.some(([s0, s1]) => a >= s0 && b <= s1)) classes.push('sq-inj');
      const text = escapeHtml(sql.slice(a, b));
      html += classes.length ? `<span class="${classes.join(' ')}">${text}</span>` : text;
    }
    return html;
  }

  const api = { DB_NAME, SERVER, TABLES, SqlError, tokenize, parse, execute, executePrepared, isInjection, highlight, escapeHtml, toStr };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SqlEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
