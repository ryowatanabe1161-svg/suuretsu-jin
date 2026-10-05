/* 数列陣のルールテスト。 node test/logic.test.js */
var L = require('../logic.js');
var failed = 0, passed = 0;
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL: ' + msg);
}
function tid(c, n, k) { return (k || 0) * 52 + c * 13 + (n - 1); }
function has(need, c, n) { return need.some(function (r) { return r.c === c && r.n === n; }); }
function idsOf(ws) { return L.wsIds(ws).slice().sort(function (a, b) { return a - b; }); }
function game(table, hand, opened) {
  return { n: 2, pool: [0], hands: [hand.slice(), []], table: table.map(function (m) { return m.slice(); }), opened: [!!opened, true], turn: 0, moves: 0, passes: 0, over: false, winner: -1, result: null };
}
function onTable(table) { var s = {}; table.forEach(function (m) { m.forEach(function (id) { s[id] = 1; }); }); return s; }

// ---- 場が空でなくても新しい組を作れる ----
(function () {
  var exist = [tid(0, 1, 0), tid(1, 1, 0), tid(2, 1, 0)];
  var hand = [tid(3, 5, 0), tid(3, 6, 0), tid(3, 7, 0)];
  var G = game([exist], hand, true);
  var ws = L.wsMove(L.wsNew(G.table, hand), hand, -1);
  assert(ws.table.length === 2, '新しい組が既存の組のうしろに増える');
  assert(eq(ws.table[0].slice().sort(), exist.slice().sort()), '既存の組はそのまま');
  assert(L.meld(ws.table[1]).ok, '新しい組はランとして正しい');
  assert(L.wsAudit(ws, G.table, hand).ok, '新しい組を足してもタイルは増えない');
  var c = L.checkCommit(G, 0, ws.table);
  assert(!c.err && c.placed.length === 3, '場が埋まっていても手札だけの新しい組は決定できる');
})();

// 初回でも、場の組に触れず手札だけで新しい組を足せる（30点以上）
(function () {
  var exist = [tid(0, 8, 0), tid(0, 9, 0), tid(0, 10, 0)];
  var hand = [tid(3, 10, 0), tid(3, 11, 0), tid(3, 12, 0), tid(3, 13, 0)];
  var G = game([exist], hand, false);
  var ws = L.wsMove(L.wsNew(G.table, hand), hand, -1);
  var c = L.checkCommit(G, 0, ws.table);
  assert(!c.err && c.openPts >= 30, '初回は場があっても手札だけの新しい組で出せる');
  var b11 = tid(0, 11, 0), G2 = game([exist], [b11], false);
  var touched = L.wsMove(L.wsNew(G2.table, [b11]), [b11], 0);
  assert(L.meld(touched.table[0]).ok && L.checkCommit(G2, 0, touched.table).err === 'touch', '初回に既存の組へ足すのは不可');
})();

// ---- 4枚以上のランから借りて新しい組（公式の manipulation） ----
(function () {
  var run = [tid(2, 3, 0), tid(2, 4, 0), tid(2, 5, 0), tid(2, 6, 0)];
  var h1 = tid(2, 1, 0), h2 = tid(2, 2, 0);
  var G = game([run], [h1, h2], true);
  var ws = L.wsMove(L.wsNew(G.table, G.hands[0]), [h1, h2, run[0]], -1);
  assert(L.meld(ws.table[0]).ok && L.meld(ws.table[1]).ok, '端を借りた残りも新しい組も正しい');
  assert(L.wsAudit(ws, G.table, G.hands[0]).ok, '借りてもタイルは保存される');
  var c = L.checkCommit(G, 0, ws.table);
  assert(!c.err, '4枚ランの端を借りる手は決定できる');
  var res = L.commit(G, 0, ws.table);
  assert(!res.err && G.hands[0].length === 0, '出したタイルは手札から消える');
  var still = onTable(G.table);
  run.forEach(function (id) { assert(still[id], '場にあったタイルは場に残る ' + id); });
})();

// 4枚グループから1枚借りて新しいラン（公式例）
(function () {
  var fours = [tid(0, 4, 0), tid(1, 4, 0), tid(2, 4, 0), tid(3, 4, 0)];
  var b3 = tid(2, 3, 0), b5 = tid(2, 5, 0), b6 = tid(2, 6, 0);
  var G = game([fours], [b3, b5, b6], true);
  var ws = L.wsMove(L.wsNew(G.table, G.hands[0]), [tid(2, 4, 0), b3, b5, b6], -1);
  assert(ws.table.length === 2, 'グループが消えずに新しい組が増える');
  assert(L.meld(ws.table[0]).ok && ws.table[0].length === 3, '4枚グループは3枚として残る');
  assert(L.meld(ws.table[1]).ok, '借りた4でランになる');
  assert(!L.checkCommit(G, 0, ws.table).err, 'グループから1枚借りる手は決定できる');
})();

// ランの途中を割って、手札の同じ数字で二つに分ける（公式の splitting a run）
(function () {
  var run = [4, 5, 6, 7, 8].map(function (n) { return tid(1, n, 0); });
  var h6 = tid(1, 6, 1);
  var G = game([run], [h6], true);
  var ws = L.wsMove(L.wsNew(G.table, [h6]), [tid(1, 4, 0), tid(1, 5, 0), h6], -1);
  assert(L.meld(ws.table[0]).ok && L.meld(ws.table[1]).ok, '4-5-6 と 6-7-8 に分かれる');
  assert(!L.checkCommit(G, 0, ws.table).err, 'ランの分割は決定できる');
})();

// 並べ替えただけでは決定できない
(function () {
  var run = [tid(0, 3, 0), tid(0, 4, 0), tid(0, 5, 0), tid(0, 6, 0)];
  var G = game([run], [tid(1, 1, 0)], true);
  var ws = L.wsMove(L.wsNew(G.table, G.hands[0]), [run[0]], -1);
  ws = L.wsMove(ws, [run[0]], 0);
  assert(L.checkCommit(G, 0, ws.table).err === 'none', '手札から1枚も出ていなければ決定できない');
})();

// ---- ジョーカーの回収と出し直し ----
(function () {
  var j = 104;
  var run = [tid(0, 6, 0), j, tid(0, 8, 0), tid(0, 9, 0)];
  var bk7 = tid(0, 7, 0), r10 = tid(1, 10, 0), r11 = tid(1, 11, 0);
  var base = [run];
  var gap = L.wsBackPlan(L.wsNew(base, [bk7, r10, r11]), [j], base, true);
  assert(!gap.back.length && gap.blocked[0].why === 'joker', '穴の🐻はそのままでは手札に戻せない');
  assert(has(gap.blocked[0].need, 0, 7) && gap.blocked[0].need.length === 1, '代わりは墨7だけ');

  var ws = L.wsMove(L.wsNew(base, [bk7, r10, r11]), [bk7], 0);
  var plan = L.wsBackPlan(ws, [j], base, true);
  assert(plan.back.length === 1 && plan.back[0] === j, '代わりを組に入れたあと🐻を手札へ戻せる');
  ws = L.wsBack(ws, [j], base, true);
  assert(ws.hand.indexOf(j) >= 0 && L.meld(ws.table[0]).ok, '戻したあとのランは墨6-7-8-9');
  assert(L.wsAudit(ws, base, [bk7, r10, r11]).ok, '回収してもタイルは増減しない');
  var G = game(base, [bk7, r10, r11], true);
  assert(L.checkCommit(G, 0, ws.table).err === 'joker', '出し直す前は決定できない');

  ws = L.wsMove(ws, [j, r10, r11], -1);
  assert(L.meld(ws.table[0]).ok && L.meld(ws.table[1]).ok, '🐻を新しいランに出し直せる');
  var c = L.checkCommit(G, 0, ws.table);
  assert(!c.err, '回収して同じ番に出し直せば決定できる');
  var res = L.commit(G, 0, ws.table);
  assert(!res.err, 'commit も通る');
  var still = onTable(G.table);
  assert(still[j] && still[bk7], '出し直した🐻と代わりのタイルは場にある');
  assert(G.hands[0].indexOf(j) < 0, '🐻は手札に残らない');
})();

// 代わりを同時に手札へ戻そうとすると、🐻は回収できない（穴が戻る）
(function () {
  var j = 104, run = [tid(0, 6, 0), j, tid(0, 8, 0), tid(0, 9, 0)], bk7 = tid(0, 7, 0);
  var base = [run];
  var ws = L.wsMove(L.wsNew(base, [bk7]), [bk7], 0);
  var plan = L.wsBackPlan(ws, [j, bk7], base, true);
  assert(plan.back.indexOf(bk7) >= 0 && plan.back.indexOf(j) < 0, '出した墨7は戻るが、穴の空く🐻は戻らない');
  assert(plan.blocked.some(function (b) { return b.id === j && b.why === 'joker'; }), '🐻は代わりが必要と分かる');
})();

// 3枚グループの🐻は、足りないどちらの色でも代わりになる。両方入れても外せる
(function () {
  var j = 105, meld0 = [tid(1, 3, 0), tid(2, 3, 0), j];
  var need = L.jokerNeed(meld0, j);
  assert(has(need, 0, 3) && has(need, 3, 3) && need.length === 2, '墨3か山吹3');
  assert(!L.wsBackPlan(L.wsNew([meld0], []), [j], [meld0], true).back.length, '2枚だけでは外せない');
  var both = L.wsMove(L.wsNew([meld0], [tid(0, 3, 0), tid(3, 3, 0)]), [tid(0, 3, 0), tid(3, 3, 0)], 0);
  var plan = L.wsBackPlan(both, [j], [meld0], true);
  assert(plan.back.indexOf(j) >= 0, '足りない2色を入れれば🐻を回収できる');
  var one = L.wsMove(L.wsNew([meld0], [tid(0, 3, 0)]), [tid(0, 3, 0)], 0);
  assert(L.wsBackPlan(one, [j], [meld0], true).back.indexOf(j) >= 0, '足りない1色でも回収できる');
})();

// 端の🐻（外しても3枚以上残る）は回収できる。初回の前は不可
(function () {
  var j = 104, run = [tid(2, 5, 0), tid(2, 6, 0), tid(2, 7, 0), j];
  var need = L.jokerNeed(run, j);
  assert(has(need, 2, 4) && has(need, 2, 8), '端の🐻は藍4か藍8');
  var plan = L.wsBackPlan(L.wsNew([run], []), [j], [run], true);
  assert(plan.back.indexOf(j) >= 0 && !plan.blocked.length, '残りが正しいランなら回収できる');
  var early = L.wsBackPlan(L.wsNew([run], []), [j], [run], false);
  assert(!early.back.length && early.blocked[0].why === 'open', '初回の前は場の🐻を戻せない');
})();

// 曖昧な端（8-9-🐻 は 7 でも 10 でもよい）は、1枚に決め打ちしない
(function () {
  var j = 104, run = [tid(0, 8, 0), tid(0, 9, 0), j];
  var need = L.jokerNeed(run, j);
  assert(has(need, 0, 7) && has(need, 0, 10), '墨7と墨10の両方');
  assert(!L.wsBackPlan(L.wsNew([run], []), [j], [run], true).back.length, '2枚だけでは外せない');
})();

// 場のタイルを代わりに使って🐻を回収し、手札のタイルと新しい組にする
(function () {
  var j = 104;
  var runJ = [tid(0, 6, 0), j, tid(0, 8, 0), tid(0, 9, 0)];
  var run4 = [tid(0, 4, 0), tid(0, 5, 0), tid(0, 6, 1), tid(0, 7, 0)];
  var h10 = tid(1, 10, 0), h11 = tid(1, 11, 0);
  var base = [runJ, run4], hand = [h10, h11];
  var G = game(base, hand, true);
  var ws = L.wsMove(L.wsNew(base, hand), [tid(0, 7, 0)], 0);
  assert(L.meld(ws.table[1]).ok, '借りたあとの 4-5-6 は正しい');
  ws = L.wsBack(ws, [j], base, true);
  assert(ws.hand.indexOf(j) >= 0, '場の墨7を代わりにすると🐻が手札に来る');
  ws = L.wsMove(ws, [j, h10, h11], -1);
  assert(L.wsAudit(ws, base, hand).ok, '場からの代わりでもタイルは保存される');
  assert(!L.checkCommit(G, 0, ws.table).err, '場のタイルを代わりにした回収も決定できる');
})();

// 🐻を手札に経由させず、組み替えだけで新しい組に使う
(function () {
  var j = 104;
  var run = [tid(0, 6, 0), j, tid(0, 8, 0), tid(0, 9, 0)];
  var bk7 = tid(0, 7, 0), r10 = tid(1, 10, 0), r11 = tid(1, 11, 0);
  var G = game([run], [bk7, r10, r11], true);
  var ws = L.wsMove(L.wsNew(G.table, G.hands[0]), [j, r10, r11], -1);
  ws = L.wsMove(ws, [bk7], 0);
  assert(L.meld(ws.table[0]).ok && L.meld(ws.table[1]).ok, '組み替えだけで両方正しい');
  assert(ws.hand.indexOf(j) < 0, 'この経路では🐻は手札を経由しない');
  assert(!L.checkCommit(G, 0, ws.table).err, '組み替えによる回収も決定できる');
})();

// 2枚の🐻は、同時に外すと崩れるなら1枚だけ
(function () {
  var run = [tid(3, 5, 0), tid(3, 6, 0), 104, 105];
  var plan = L.wsBackPlan(L.wsNew([run], []), [104, 105], [run], true);
  assert(plan.back.length === 1, '同時には1枚だけ回収できる');
  assert(plan.blocked.length === 1 && plan.blocked[0].why === 'joker', 'もう1枚は穴として残る');
})();

// ---- 場の数字タイルは持ち帰れない。重複もしない ----
(function () {
  var g4 = [tid(0, 9, 0), tid(1, 9, 0), tid(2, 9, 0), tid(3, 9, 0)];
  var hand = [tid(0, 1, 0), tid(1, 1, 0), tid(2, 1, 0)];
  var G = game([g4], hand, true);
  var pocket = [[tid(0, 9, 0), tid(1, 9, 0), tid(2, 9, 0)], hand.slice()];
  assert(L.checkCommit(G, 0, pocket).err === 'kept', '場の数字タイルを抜くと kept');
  var plan = L.wsBackPlan(L.wsNew([g4], hand), [tid(3, 9, 0)], [g4], true);
  assert(!plan.back.length && plan.blocked[0].why === 'table', '手札へは場の数字タイルを返さない');
  var ws = L.wsBack(L.wsNew([g4], hand), [tid(3, 9, 0)], [g4], true);
  assert(ws.table[0].length === 4 && ws.hand.length === 3, '拒否したあとも場と手札は変わらない');
  var missingJ = [[tid(0, 6, 0), tid(0, 7, 0), tid(0, 8, 0), tid(0, 9, 0)]];
  var Gj = game([[tid(0, 6, 0), 104, tid(0, 8, 0), tid(0, 9, 0)]], [tid(0, 7, 0)], true);
  assert(L.checkCommit(Gj, 0, missingJ).err === 'joker', '🐻を抜いたままは joker');
  assert(L.checkCommit(game([[tid(0, 6, 0), 104, tid(0, 8, 0), tid(0, 9, 0)]], [tid(0, 7, 0)], false), 0, missingJ).err === 'touch', '初回前に🐻を抜くのは touch');
})();

// 既存の組へ足してもタイルは二重にならない（以前の回帰）
(function () {
  var a = tid(2, 3, 0), b = tid(2, 4, 0), c = tid(2, 5, 0), extra = tid(2, 6, 0);
  var other = [tid(1, 7, 0), tid(1, 8, 0), tid(1, 9, 0)];
  var baseT = [[a, b, c], other], baseH = [extra];
  var next = L.wsMove(L.wsNew(baseT, baseH), [extra], 0);
  assert(next.table.length === 2, '足しても組の数は増えない');
  assert(next.table[0].length === 4 && next.hand.length === 0, '足した先は4枚、手札は空');
  assert(L.wsAudit(next, baseT, baseH).ok, '追加後も監査が通る');
  var again = L.wsMove(next, [a, b, c, extra], 0);
  assert(again.table.length === 2 && L.wsAudit(again, baseT, baseH).ok, '同じ組へ戻しても二重にならない');
  var onto = L.wsMove(L.wsNew(baseT, baseH), [a, b, c], 1);
  assert(onto.table.length === 1 && onto.table[0].length === 6, '全部移すと元の組は消えて先に連結');
  assert(L.wsAudit(onto, baseT, baseH).ok, '連結しても監査が通る');
  var dup = { table: [[a, a, b]], hand: [c] };
  assert(!L.wsAudit(dup, [[a, b]], [c]).ok && L.wsAudit(dup, [[a, b]], [c]).dup.indexOf(a) >= 0, '監査は重複を見つける');
  var G = game([[a, b, c]], [extra], true);
  assert(L.checkCommit(G, 0, [[a, b, c, extra, a]]).err === 'bad', '同じタイルを二度含む決定は bad');
  assert(L.checkCommit(G, 0, [[a, b, c], [extra, a, tid(2, 7, 0)]]).err === 'bad', '組をまたいで同じタイルは bad');
})();

// この番に出したタイルは手札へ戻せる
(function () {
  var run = [tid(0, 2, 0), tid(0, 3, 0), tid(0, 4, 0)];
  var extra = tid(0, 5, 0);
  var base = [run];
  var ws = L.wsMove(L.wsNew(base, [extra]), [extra], 0);
  var plan = L.wsBackPlan(ws, [extra], base, true);
  assert(plan.back.indexOf(extra) >= 0 && !plan.blocked.length, 'この番に出したタイルは戻せる');
  ws = L.wsBack(ws, [extra], base, true);
  assert(eq(ws.hand, [extra]) && ws.table.length === 1 && ws.table[0].length === 3, '戻すと番の最初の形');
})();

// 同じランから山吹3と4を両方抜くと残りが1-2になり、決定できない（別解釈）
(function () {
  var y1 = tid(3, 1, 0), y2 = tid(3, 2, 0), y3 = tid(3, 3, 0), y4 = tid(3, 4, 0);
  var y1b = tid(3, 1, 1), y2h = tid(3, 2, 1);
  var ones = [tid(0, 1, 0), tid(2, 1, 0), y1b];
  var run = [y1, y2, y3, y4];
  var hand = [y2h, tid(1, 2, 0), tid(2, 1, 1), tid(2, 7, 0)];
  var G = game([run, ones], hand, true);
  var ws = L.wsMove(L.wsNew(G.table, hand), [y2h, y3, y4], -1);
  assert(ws.table.length === 3, '新しい組自体は場が埋まっていても作れる');
  assert(L.meld(ws.table[2]).ok, '山吹2-3-4の新しい組は形としては正しい');
  assert(!L.meld(ws.table[0]).ok, '残った山吹1-2は組にならない');
  assert(L.checkCommit(G, 0, ws.table).err === 'invalid', '残りの組が不正なので決定できない');
  var parked = L.wsMove(ws, [y1], 1);
  assert(!L.meld(parked.table.filter(function (m) { return m.indexOf(y1b) >= 0; })[0]).ok, '1の組にはすでに山吹があるので足せない');
  var dumped = L.wsMove(L.wsNew(G.table, hand), [y2h], 0);
  assert(!L.meld(dumped.table[0]).ok, '山吹1-2-3-4に手札の山吹2を足すだけでも重なる');
})();

// 3の4枚グループから山吹3、山吹1-2-3-4から山吹4、手札の山吹2で新しいラン
(function () {
  var y1 = tid(3, 1, 0), y2 = tid(3, 2, 0), y3run = tid(3, 3, 0), y4run = tid(3, 4, 0);
  var y3g = tid(3, 3, 1), y2h = tid(3, 2, 1);
  var group3 = [tid(0, 3, 0), tid(1, 3, 0), tid(2, 3, 0), y3g];
  var run = [y1, y2, y3run, y4run];
  var group4 = [tid(1, 4, 0), tid(2, 4, 0), tid(3, 4, 1)];
  var hand = [y2h, tid(1, 2, 0), tid(2, 1, 1), tid(2, 7, 0)];
  var G = game([group3, run, group4], hand, true);
  var ws = L.wsMove(L.wsNew(G.table, hand), [y3g, y4run, y2h], -1);
  assert(L.wsAudit(ws, G.table, hand).ok, '組をまたいで借りてもタイルは増えない');
  var rest3 = ws.table.filter(function (m) { return m.indexOf(tid(0, 3, 0)) >= 0; })[0];
  var restRun = ws.table.filter(function (m) { return m.indexOf(y1) >= 0; })[0];
  var neu = ws.table.filter(function (m) { return m.indexOf(y2h) >= 0; })[0];
  assert(rest3 && rest3.length === 3 && L.meld(rest3).ok && rest3.indexOf(y3g) < 0, '3のグループは墨・紅・藍の3枚で残る');
  assert(restRun && eq(restRun.slice().sort(), [y1, y2, y3run].sort()) && L.meld(restRun).ok, '山吹ランは1-2-3で残る');
  assert(neu && eq(neu.slice().sort(), [y2h, y3g, y4run].sort()) && L.meld(neu).ok, '新しい組は山吹2-3-4');
  assert(ws.table.every(function (m) { return L.meld(m).ok; }), '場のすべての組が正しい');
  var c = L.checkCommit(G, 0, ws.table);
  assert(!c.err && c.placed.length === 1 && c.placed[0] === y2h, '手札の山吹2を出したこの手は決定できる');
  var res = L.commit(JSON.parse(JSON.stringify(G)), 0, ws.table);
  assert(!res.err, 'commit も通る');
})();

// ふーさんが打ってもタイルは保存され、ルール違反の手は出さない
(function () {
  var rng = L.rngFrom(7), g, t, p, m, r, i;
  for (g = 0; g < 6; g++) {
    var G = L.newGame(2, rng, 0);
    for (t = 0; t < 24 && !G.over; t++) {
      p = G.turn;
      var beforeH = G.hands[p].slice(), beforeT = G.table.map(function (x) { return x.slice(); });
      m = L.aiTurn(G, p, g < 4 ? 'normal' : 'strong', rng);
      if (m) {
        r = L.commit(G, p, m.table);
        if (r.err) { assert(false, 'CPUの手が拒否された ' + r.err); L.draw(G, p); }
        else {
          var seen = {}, bad = false;
          G.table.forEach(function (mm) { if (!L.meld(mm).ok) bad = true; mm.forEach(function (id) { if (seen[id]) bad = true; seen[id] = 1; }); });
          beforeT.forEach(function (mm) { mm.forEach(function (id) { if (!seen[id]) bad = true; }); });
          if (bad) assert(false, 'CPUの手のあとに場が壊れた');
          else assert(true, 'CPUの手は保存される');
        }
      } else L.draw(G, p);
      if (G.hands[p] && beforeH) { /* turn advanced; nothing */ }
    }
  }
})();

console.log(passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
