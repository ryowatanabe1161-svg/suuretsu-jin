/* 数列陣 — ルールとCPU（ブラウザ・Node共通）
 * タイル 106枚：id 0..103 = 2セット × 4色(0墨 1紅 2藍 3山吹) × 1..13、id 104,105 = ふーさんタイル（ジョーカー）。
 */
(function (root) {
  'use strict';
  var NT = 106, JK = [104, 105], HAND0 = 14, OPEN = 30, JOKER_PTS = 30;
  function isJ(id) { return id === 104 || id === 105; }
  // id 1000..1051 は「この色・数字だったら組が成り立つか」を調べるための仮タイル（場には出さない）
  function color(id) { if (isJ(id)) return -1; if (id >= 1000) return Math.floor((id - 1000) / 13); return Math.floor((id % 52) / 13); }
  function num(id) { if (isJ(id)) return 0; if (id >= 1000) return (id - 1000) % 13 + 1; return (id % 13) + 1; }
  function shuffle(a, rng) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  // ---- 組の判定 ----
  // 戻り値 {ok, type:'group'|'run', val, order(表示順のid)} / {ok:false}
  function runInfo(ids) {
    var js = ids.filter(isJ), ns = ids.filter(function (i) { return !isJ(i); });
    if (ids.length < 3 || ids.length > 13 || !ns.length) return null;
    var c = color(ns[0]); if (ns.some(function (i) { return color(i) !== c; })) return null;
    var sorted = ns.slice().sort(function (a, b) { return num(a) - num(b); });
    for (var k = 1; k < sorted.length; k++) if (num(sorted[k]) === num(sorted[k - 1])) return null;
    var lo = num(sorted[0]), hi = num(sorted[sorted.length - 1]), L = ids.length;
    if (hi - lo + 1 > L) return null;                        // ジョーカーが足りない
    var s = Math.min(lo, 13 - L + 1); if (s < 1 || s + L - 1 < hi) return null;   // 高い方に寄せる（得点は最大）
    var order = [], ji = 0, si = 0;
    for (var v = s; v < s + L; v++) { if (si < sorted.length && num(sorted[si]) === v) order.push(sorted[si++]); else order.push(js[ji++]); }
    return { ok: true, type: 'run', val: (s + s + L - 1) * L / 2, order: order };
  }
  function groupInfo(ids) {
    var ns = ids.filter(function (i) { return !isJ(i); });
    if (ids.length < 3 || ids.length > 4 || !ns.length) return null;
    var n = num(ns[0]), seen = {};
    for (var k = 0; k < ns.length; k++) { if (num(ns[k]) !== n || seen[color(ns[k])]) return null; seen[color(ns[k])] = 1; }
    var order = ns.slice().sort(function (a, b) { return color(a) - color(b); }).concat(ids.filter(isJ));
    return { ok: true, type: 'group', val: n * ids.length, order: order };
  }
  function meld(ids) {
    var r = runInfo(ids), g = groupInfo(ids);
    if (r && g) return r.val >= g.val ? r : g;
    return r || g || { ok: false };
  }
  function handPts(hand) { return hand.reduce(function (s, i) { return s + (isJ(i) ? JOKER_PTS : num(i)); }, 0); }

  // ---- ゲーム ----
  function newGame(n, rng, start) {
    rng = rng || Math.random;
    var pool = []; for (var i = 0; i < NT; i++) pool.push(i); shuffle(pool, rng);
    var G = { n: n, pool: pool, hands: [], table: [], opened: [], turn: start == null ? Math.floor(rng() * n) : start, moves: 0, passes: 0, over: false, winner: -1, result: null };
    for (var p = 0; p < n; p++) { G.hands.push(pool.splice(0, HAND0)); G.opened.push(false); }
    return G;
  }
  function key(m) { return m.slice().sort(function (a, b) { return a - b; }).join(','); }
  // 手番の確定チェック。table = 新しい場の全体。戻り値 {err} または {placed:[ids], openPts}
  function checkCommit(G, p, table) {
    if (!Array.isArray(table)) return { err: 'bad' };
    var seen = {}, hand = {}, before = {}, i, k;
    G.hands[p].forEach(function (id) { hand[id] = 1; });
    G.table.forEach(function (m) { m.forEach(function (id) { before[id] = 1; }); });
    var placed = [];
    for (k = 0; k < table.length; k++) {
      var m = table[k]; if (!Array.isArray(m) || !m.length) return { err: 'bad' };
      for (i = 0; i < m.length; i++) {
        var id = m[i]; if (typeof id !== 'number' || id < 0 || id >= NT || seen[id]) return { err: 'bad' };
        seen[id] = 1;
        if (!before[id]) { if (!hand[id]) return { err: 'bad' }; placed.push(id); }
      }
    }
    // 場の数字タイルを手札へ持ち帰るのは不可。ジョーカーは同じ番に出し直すまで決定できない（公式ルール）
    var missJ = false;
    for (var b in before) if (!seen[b]) { if (isJ(+b)) missJ = true; else return { err: 'kept' }; }
    if (missJ) return { err: G.opened[p] ? 'joker' : 'touch' };
    if (!placed.length) return { err: 'none' };
    for (k = 0; k < table.length; k++) if (!meld(table[k]).ok) return { err: 'invalid', at: k };
    var openPts = 0;
    if (!G.opened[p]) {
      // 初回：場の既存の組はそのまま、新しい組は手札だけで30点以上
      var old = {}; G.table.forEach(function (m) { old[key(m)] = (old[key(m)] || 0) + 1; });
      for (k = 0; k < table.length; k++) {
        var kk = key(table[k]);
        if (old[kk]) { old[kk]--; continue; }
        if (table[k].some(function (id) { return before[id]; })) return { err: 'touch' };
        openPts += meld(table[k]).val;
      }
      for (var o in old) if (old[o]) return { err: 'touch' };
      if (openPts < OPEN) return { err: 'open', pts: openPts };
    }
    return { placed: placed, openPts: openPts };
  }
  function commit(G, p, table) {
    if (G.over || p !== G.turn) return { err: 'turn' };
    var c = checkCommit(G, p, table); if (c.err) return c;
    var pl = {}; c.placed.forEach(function (id) { pl[id] = 1; });
    G.hands[p] = G.hands[p].filter(function (id) { return !pl[id]; });
    G.table = table.map(function (m) { return meld(m).order; });
    var wasOpen = G.opened[p]; G.opened[p] = true; G.moves++; G.passes = 0;
    var res = { placed: c.placed, opening: !wasOpen, openPts: c.openPts };
    if (!G.hands[p].length) { finish(G, p); res.over = true; }
    else G.turn = (G.turn + 1) % G.n;
    return res;
  }
  function draw(G, p) {
    if (G.over || p !== G.turn) return { err: 'turn' };
    var res = {};
    if (G.pool.length) { var t = G.pool.pop(); G.hands[p].push(t); res.tile = t; G.passes = 0; }
    else { res.pass = true; G.passes++; }
    G.moves++;
    if (!G.pool.length && G.passes >= G.n) {   // 山が尽きて全員パス → 手札の点が一番少ない人の勝ち
      var best = 0; for (var q = 1; q < G.n; q++) if (handPts(G.hands[q]) < handPts(G.hands[best])) best = q;
      finish(G, best); res.over = true;
    } else G.turn = (G.turn + 1) % G.n;
    return res;
  }
  // 得点：負けた人は −(自分の残り − 勝者の残り)、勝者はその合計を得る（通常は勝者の残り0）
  function finish(G, w) {
    G.over = true; G.winner = w;
    var wp = handPts(G.hands[w]), pts = G.hands.map(function (h) { return handPts(h); }), sc = pts.map(function () { return 0; });
    pts.forEach(function (x, q) { if (q !== w) { sc[q] = -(x - wp); sc[w] += x - wp; } });
    G.result = { remain: pts, score: sc };
  }

  // ---------------- CPU（ふーさん） ----------------
  // 手札から作れる組の候補（ジョーカーは最大 jmax 枚）
  function candidates(hand, jmax) {
    var by = {}, js = hand.filter(isJ), out = [], c, n, s, e;
    hand.forEach(function (id) { if (!isJ(id)) { var k = color(id) * 13 + num(id) - 1; (by[k] = by[k] || []).push(id); } });
    var J = Math.min(js.length, jmax);
    for (c = 0; c < 4; c++) for (s = 1; s <= 13; s++) {
      var ids = [], usedJ = 0;
      for (e = s; e <= 13; e++) {
        var b = by[c * 13 + e - 1];
        if (b) ids.push(b[0]); else { if (usedJ >= J) break; ids.push(js[usedJ++]); }
        if (ids.length >= 3 && !isJ(ids[0]) && !isJ(ids[ids.length - 1]) || ids.length >= 3 && usedJ < ids.length - 1) {
          var m = meld(ids); if (m.ok) out.push({ ids: ids.slice(), j: usedJ, val: m.val });
        }
      }
    }
    for (n = 1; n <= 13; n++) {
      var cols = []; for (c = 0; c < 4; c++) if (by[c * 13 + n - 1]) cols.push(by[c * 13 + n - 1][0]);
      // 色の部分集合
      for (var mask = 1; mask < 16; mask++) {
        var sub = cols.filter(function (_, i) { return mask & (1 << i); }); if (!sub.length || (mask >> cols.length)) continue;
        for (var j = 0; j <= J; j++) { var L = sub.length + j; if (L < 3 || L > 4) continue; var g = sub.concat(js.slice(0, j)); var mg = meld(g); if (mg.ok) out.push({ ids: g, j: j, val: mg.val }); }
      }
    }
    return out;
  }
  function pickMelds(hand, jmax, jpen, mode, rng) {
    var left = hand.slice(), chosen = [];
    function sc(c) { return (mode === 'val' ? c.val + c.ids.length : c.ids.length * 10 + c.val * 0.05) - c.j * jpen + (rng ? rng() * 4 : 0); }
    for (var guard = 0; guard < 20; guard++) {
      var cs = candidates(left, jmax); if (!cs.length) break;
      cs.forEach(function (c) { c.s = sc(c); });
      cs.sort(function (a, b) { return b.s - a.s; });
      var best = cs[0]; chosen.push(best.ids);
      left = left.filter(function (id) { return best.ids.indexOf(id) < 0; });
    }
    return { melds: chosen, left: left };
  }
  function aiTurn(G, p, lv, rng) {
    rng = rng || Math.random;
    if (lv === 'strong') {
      // 強い：いくつかの作り方を試して、手札の残り点がいちばん少なくなる手を選ぶ（上がれるなら最優先）
      var best = null, bv = 1e9, vars = [[8, 'len'], [0, 'len'], [25, 'len'], [4, 'val'], [0, 'val']];
      for (var r = 0; r < 4; r++) vars.push([rng() * 20, rng() < 0.5 ? 'len' : 'val', true]);
      
      vars.forEach(function (o) {
        var t = buildTurn(G, p, 'normal', rng, o[0], o[1], o[2] ? rng : null); if (!t) return;
        var pl = {}; [].concat.apply([], t.table).forEach(function (id) { pl[id] = 1; });
        var left = G.hands[p].filter(function (id) { return !pl[id]; });
        var v = left.length ? left.length * 100 + handPts(left) : -1e6;   // 残り枚数が最優先、次に残り点
        if (v < bv) { bv = v; best = t; }
      });
      if (best && G.opened[p]) best = improve(G, p, best, rng);
      return best;
    }
    return buildTurn(G, p, lv, rng, G.opened[p] ? 8 : 4, 'len', null);
  }
  // 局所的な組み直し：場の組を1〜2個くずし、手札の残りと合わせて作り直す（場のタイルは全部使う）
  function partition(tiles, must, rng) {
    var left = tiles.slice(), out = [];
    for (var guard = 0; guard < 30; guard++) {
      var cs = candidates(left, 2); if (!cs.length) break;
      var best = null, bs = -1e9;
      cs.forEach(function (c) { var tt = 0; c.ids.forEach(function (id) { if (must[id]) tt++; }); if (!tt && !rng) return; var v = tt * 10 + c.ids.length * 2 - c.j * 3 + rng() * 6; if (v > bs) { bs = v; best = c; } });
      if (!best) break;
      out.push(best.ids); left = left.filter(function (id) { return best.ids.indexOf(id) < 0; });
    }
    if (left.some(function (id) { return must[id]; })) return null;
    return { melds: out, left: left };
  }
  function improve(G, p, plan, rng) {
    var table = plan.table.map(function (m) { return m.slice(); }), used = {};
    [].concat.apply([], table).forEach(function (id) { used[id] = 1; });
    var left = G.hands[p].filter(function (id) { return !used[id]; });
    for (var round = 0; round < 6 && left.length; round++) {
      var gained = false, K = table.length, subsets = [];
      for (var a = 0; a < K; a++) { subsets.push([a]); for (var b = a + 1; b < K; b++) subsets.push([a, b]); }
      for (var si = 0; si < subsets.length && !gained; si++) {
        var S = subsets[si], must = {}, tiles = left.slice();
        S.forEach(function (k) { table[k].forEach(function (id) { must[id] = 1; tiles.push(id); }); });
        for (var tr = 0; tr < 5 && !gained; tr++) {
          var r = partition(tiles, must, rng); if (!r || r.left.length >= left.length) continue;
          var nt = table.filter(function (_, k) { return S.indexOf(k) < 0; }).concat(r.melds);
          if (nt.every(function (m) { return meld(m).ok; })) { table = nt; left = r.left; gained = true; }
        }
      }
      if (!gained) break;
    }
    var chk = checkCommit(G, p, table); return chk.err ? plan : { table: table };
  }
  function buildTurn(G, p, lv, rng, jpen, mode, noise) {
    var hand = G.hands[p], table = G.table.map(function (m) { return m.slice(); });
    if (lv === 'weak' && rng() < 0.2) return null;
    var pk = pickMelds(hand, lv === 'weak' ? 0 : 2, jpen, mode, noise);
    var sum = pk.melds.reduce(function (s, m) { return s + meld(m).val; }, 0);
    if (!G.opened[p]) {
      if (sum < OPEN && lv !== 'weak') { pk = pickMelds(hand, 2, 0, mode, noise); sum = pk.melds.reduce(function (s, m) { return s + meld(m).val; }, 0); }
      if (sum < OPEN) return null;
      return { table: table.concat(pk.melds) };
    }
    var newT = table.concat(pk.melds), left = pk.left;
    if (lv !== 'weak') {   // 場の組に1枚ずつ付け足す
      for (var changed = true, g = 0; changed && g < 30; g++) {
        changed = false;
        for (var i = 0; i < left.length && !changed; i++) for (var k = 0; k < newT.length; k++) {
          var t = newT[k].concat([left[i]]);
          if (meld(t).ok) { newT[k] = t; left.splice(i, 1); changed = true; break; }
        }
      }
    }
    if (lv !== 'weak') {
      for (var again = true, g2 = 0; again && g2 < 20; g2++) {
        again = false;
        // ① 列の途中に同じ数字を入れて2つに分ける（3-4-5-6-7 に 5 → 3-4-5 / 5-6-7）
        for (var a = 0; a < left.length && !again; a++) {
          var t = left[a]; if (isJ(t)) continue;
          for (var k2 = 0; k2 < newT.length && !again; k2++) {
            var M = meld(newT[k2]); if (!M.ok || M.type !== 'run') continue;
            var o = M.order, pos = -1;
            for (var q = 0; q < o.length; q++) if (!isJ(o[q]) && color(o[q]) === color(t) && num(o[q]) === num(t)) pos = q;
            if (pos >= 2 && o.length - pos >= 3) { var A = o.slice(0, pos).concat([t]), B = o.slice(pos); if (meld(A).ok && meld(B).ok) { newT.splice(k2, 1, A, B); left.splice(a, 1); again = true; } }
          }
        }
        // ② 場の余っているタイル（4枚以上の組の端）を借りて、手札の2枚と新しい組を作る
        for (var k3 = 0; k3 < newT.length && !again; k3++) {
          var M3 = meld(newT[k3]); if (!M3.ok || newT[k3].length < 4) continue;
          var ends = M3.type === 'run' ? [0, M3.order.length - 1] : M3.order.map(function (_, i) { return i; });
          for (var e2 = 0; e2 < ends.length && !again; e2++) {
            var st = M3.order[ends[e2]], rest = M3.order.filter(function (_, i) { return i !== ends[e2]; });
            if (!meld(rest).ok) continue;
            for (var x = 0; x < left.length && !again; x++) for (var y = x + 1; y < left.length && !again; y++) {
              var nm = [left[x], left[y], st];
              if (meld(nm).ok) { newT.splice(k3, 1, rest, nm); var lx = left[x], ly = left[y]; left = left.filter(function (id) { return id !== lx && id !== ly; }); again = true; }
            }
          }
        }
        // ③ 付け足しをもう一度
        for (var i2 = 0; i2 < left.length && !again; i2++) for (var k4 = 0; k4 < newT.length; k4++) { var t4 = newT[k4].concat([left[i2]]); if (meld(t4).ok) { newT[k4] = t4; left.splice(i2, 1); again = true; break; } }
      }
    }
    if (left.length === hand.length) return null;
    var chk = checkCommit(G, p, newT); return chk.err ? null : { table: newT };
  }

  // ---- 手番中の並べ替え（画面側の作業領域）。すべて新しいオブジェクトを返す純粋関数 ----
  function wsNew(table, hand) { return { table: table.map(function (m) { return m.slice(); }), hand: hand.slice() }; }
  function wsIds(ws) { var a = ws.hand.slice(); ws.table.forEach(function (m) { a = a.concat(m); }); return a; }
  // ids を ws から取り出し、dest 番目の組の末尾（dest<0 または範囲外なら新しい組）へ置く
  function wsMove(ws, ids, dest) {
    var have = {}, pick = {}, list = [];
    wsIds(ws).forEach(function (id) { have[id] = 1; });
    (ids || []).forEach(function (id) { if (have[id] && !pick[id]) { pick[id] = 1; list.push(id); } });
    if (!list.length) return ws;
    var keep = function (id) { return !pick[id]; }, table = [], toNew = !(dest >= 0 && dest < ws.table.length);
    ws.table.forEach(function (m, k) { var r = m.filter(keep); if (k === dest) r = r.concat(list); if (r.length) table.push(r); });
    if (toNew) table.push(list);
    return { table: table, hand: ws.hand.filter(keep) };
  }
  // ジョーカーを1枚、そのタイル自身と入れ替えても組が正しいままになる色・数字（公式：3枚グループは欠けているどちらの色でもよい）
  function jokerNeed(ids, jid) {
    var rest = [], i, c, n, out = [];
    for (i = 0; i < ids.length; i++) if (ids[i] !== jid) rest.push(ids[i]);
    for (c = 0; c < 4; c++) for (n = 1; n <= 13; n++) if (meld(rest.concat([1000 + c * 13 + (n - 1)])).ok) out.push({ c: c, n: n });
    return out;
  }
  function meldWithout(ids, drop) {
    var rest = [];
    for (var i = 0; i < ids.length; i++) if (drop.indexOf(ids[i]) < 0) rest.push(ids[i]);
    return meld(rest).ok;
  }
  // 同時に外しても残りが正しい組のままになるジョーカーだけ返す（2枚同時が無理なら1枚）
  function liftableJokers(meldIds, cands) {
    if (!cands.length) return [];
    if (meldWithout(meldIds, cands)) return cands.slice();
    for (var i = 0; i < cands.length; i++) if (meldWithout(meldIds, [cands[i]])) return [cands[i]];
    return [];
  }
  // 手札へ戻せるタイル。
  // ・この番に手札から場へ出したタイル
  // ・場のジョーカーのうち、外したあともその組が正しいままのもの（初回の前は不可）
  // 場の数字タイルは戻さない。穴をふさいでいるジョーカーも、代わりを組に入れるまでは戻さない。
  function wsBackPlan(ws, ids, baseTable, opened) {
    var was = {}, sel = {}, returning = {}, blocked = [], back = [];
    (baseTable || []).forEach(function (m) { m.forEach(function (id) { was[id] = 1; }); });
    (ids || []).forEach(function (id) { sel[id] = 1; });
    ws.table.forEach(function (m) { m.forEach(function (id) { if (sel[id] && !was[id]) returning[id] = 1; }); });
    ws.table.forEach(function (m) {
      var after = m.filter(function (id) { return !returning[id]; }), js = [], liftSet = {};
      after.forEach(function (id) { if (sel[id] && isJ(id) && was[id]) js.push(id); });
      (opened ? liftableJokers(after, js) : []).forEach(function (id) { liftSet[id] = 1; returning[id] = 1; });
      js.forEach(function (id) {
        if (!liftSet[id]) blocked.push({ id: id, why: opened ? 'joker' : 'open', need: opened ? jokerNeed(after, id) : [] });
      });
      after.forEach(function (id) { if (sel[id] && was[id] && !isJ(id)) blocked.push({ id: id, why: opened ? 'table' : 'open' }); });
    });
    ws.table.forEach(function (m) { m.forEach(function (id) { if (returning[id] && back.indexOf(id) < 0) back.push(id); }); });
    return { back: back, blocked: blocked };
  }
  function wsBack(ws, ids, baseTable, opened) {
    var plan = wsBackPlan(ws, ids, baseTable, !!opened), back = {};
    if (!plan.back.length) return ws;
    plan.back.forEach(function (id) { back[id] = 1; });
    return { table: ws.table.map(function (m) { return m.filter(function (id) { return !back[id]; }); }).filter(function (m) { return m.length; }), hand: ws.hand.concat(plan.back) };
  }
  // 作業領域のタイルが「番の最初の 場＋手札」とぴったり同じか（重複・増殖・消失の検出）
  function wsAudit(ws, baseTable, baseHand) {
    var cnt = {}, dup = [], extra = [], missing = [], want = {};
    wsIds({ table: baseTable, hand: baseHand }).forEach(function (id) { want[id] = 1; });
    wsIds(ws).forEach(function (id) { cnt[id] = (cnt[id] || 0) + 1; if (cnt[id] === 2) dup.push(id); if (!want[id] && extra.indexOf(id) < 0) extra.push(id); });
    for (var w in want) if (!cnt[w]) missing.push(+w);
    var bad = ws.table.some(function (m) { return !Array.isArray(m) || !m.length; });
    return { ok: !dup.length && !extra.length && !missing.length && !bad, dup: dup, extra: extra, missing: missing };
  }
  // 番の最初から何か変わったか（手札の枚数、または場の組の構成）
  function wsDirty(ws, baseTable, baseHand) {
    if (ws.hand.length !== baseHand.length) return true;
    var a = ws.table.map(key).sort().join('|'), b = baseTable.map(key).sort().join('|');
    return a !== b;
  }
  // 組として成り立たない理由（短い日本語）
  function meldWhy(ids) {
    if (meld(ids).ok) return '';
    var ns = ids.filter(function (i) { return !isJ(i); });
    if (ids.length < 3) return '3枚以上必要';
    if (!ns.length) return '数字タイルが必要';
    var sameNum = ns.every(function (i) { return num(i) === num(ns[0]); }), sameCol = ns.every(function (i) { return color(i) === color(ns[0]); });
    if (sameNum && !sameCol) {
      if (ids.length > 4) return '同じ数字は4枚まで';
      return '同じ色が重なっている';
    }
    if (sameCol) {
      var seen = {}; for (var k = 0; k < ns.length; k++) { if (seen[num(ns[k])]) return '同じ数字が重なっている'; seen[num(ns[k])] = 1; }
      if (ids.length > 13) return '13枚まで';
      return '数字がつながっていない';
    }
    return '数字か色をそろえて';
  }
  function rngFrom(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  var api = { NT: NT, JK: JK, OPEN: OPEN, color: color, num: num, isJ: isJ, meld: meld, handPts: handPts, newGame: newGame, checkCommit: checkCommit, commit: commit, draw: draw, aiTurn: aiTurn, candidates: candidates, LEVELS: ['weak', 'normal', 'strong'], rngFrom: rngFrom, key: key,
    wsNew: wsNew, wsIds: wsIds, wsMove: wsMove, wsBack: wsBack, wsBackPlan: wsBackPlan, wsAudit: wsAudit, wsDirty: wsDirty, meldWhy: meldWhy, jokerNeed: jokerNeed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RK = api;
})(this);
