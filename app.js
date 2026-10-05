/* 数列陣 オンライン版
 * 構成：WebRTC（PeerJS）による P2P。ホストのブラウザが唯一の正（authoritative）で、確定した場の検証・ふーさん🐻の手もホストが行います。
 * 手札は本人にだけ送ります（ほかの人は枚数だけ）。山の順番は送りません。
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var L = window.RK;
  var Q = new URLSearchParams(location.search);
  var CFG = window.SR_CONFIG || {};
  var ICE = (CFG.iceServers && CFG.iceServers.length) ? CFG.iceServers : [{ urls: 'stun:stun.l.google.com:19302' }];
  if (Q.get('ice')) ICE = Q.get('ice').split(',').map(function (u) { return { urls: u }; });   // テスト・独自環境用
  var PEER_OPTS = Object.assign({ debug: 1, config: { iceServers: ICE } }, CFG.peer || {});
  var ID_PREFIX = 'suretsu-jin-v1-', CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var TURBO = Q.has('turbo');
  var T = TURBO ? { cpu: [100, 200], endPause: 900 } : { cpu: [900, 1700], endPause: 2600 };
  var MAX_HUMANS = 4, HB_MS = 3000, LOST_MS = 10000;
  var CN = ['墨', '紅', '藍', '山吹'], MARK = ['●', '◆', '▲', '★'];
  var LV = { weak: '弱い', normal: '普通', strong: '強い' };
  var LV_KEYS = ['weak', 'normal', 'strong'];
  var BEAR = '🐻', CPU_BASE = 'ふーさん' + BEAR;
  var CPU_LINES = {
    weak: ['これを並べるクマ〜', 'えいっ、出しちゃうクマ！'],
    normal: ['ここに付け足すクマ', 'きれいに並んだクマ〜'],
    strong: ['場をちょっと組みかえるクマ…', '計算どおりクマ', 'そのタイル、借りるクマ！'],
    open: ['30点そろったクマ！ 初めて出すクマ〜'],
    draw: ['うーん、1枚引くクマ…', '今は がまんクマ']
  };
  var LS_ID = 'sr-client-id', LS_NAME = 'sr-name', LS_HOST = 'sr-host-room', SS_CLIENT = 'sr-joined';
  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} }
  function load(k, json) { try { var v = localStorage.getItem(k); return json ? JSON.parse(v) : v; } catch (e) { return null; } }
  function sstore(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function sload(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }
  function rid(n) { var s = ''; for (var i = 0; i < n; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]; return s; }
  var myId = load(LS_ID) || (function () { var v = rid(16); store(LS_ID, v); return v; })();
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function rand(a) { return a[0] + Math.random() * (a[1] - a[0]); }
  function cleanName(n) { return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 8); }
  function genCode() { var c = ''; for (var i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }
  function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1').slice(0, 4); }
  function inviteUrl(code) { var u = location.origin + location.pathname + '?room=' + code; if (Q.get('ice')) u += '&ice=' + encodeURIComponent(Q.get('ice')); return u; }

  // ---------- 汎用UI ----------
  function show(id) { ['title', 'lobby', 'game', 'end'].forEach(function (s) { $(s).classList.toggle('active', s === id); }); document.body.classList.toggle('in-game', id === 'game'); }
  function overlay(id, on) { $(id).classList.toggle('active', on); }
  var toastT;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 3000); }
  function banner(msg) { var b = $('banner'); b.textContent = msg || ''; b.classList.toggle('show', !!msg); }
  function confirmBox(title, text, yes, cb) {
    $('cfTitle').textContent = title; $('cfText').textContent = text; $('cfYes').textContent = yes; $('cfNo').style.display = '';
    overlay('confirmModal', true);
    $('cfYes').onclick = function () { overlay('confirmModal', false); cb(); };
    $('cfNo').onclick = function () { overlay('confirmModal', false); };
  }
  function alertBox(msg) { confirmBox('お知らせ', msg, 'OK', function () {}); $('cfNo').style.display = 'none'; }
  function connecting(on, title, text, onCancel) {
    overlay('connecting', on);
    if (on) { $('connTitle').textContent = title || '接続中…'; $('connText').textContent = text || ''; $('connCancel').onclick = onCancel || function () { location.href = location.pathname; }; }
  }
  $('rulesBtn1').onclick = $('rulesBtn2').onclick = function () { overlay('rulesModal', true); };
  $('rulesClose').onclick = function () { overlay('rulesModal', false); };
  ['rulesModal', 'menuModal'].forEach(function (id) { $(id).addEventListener('click', function (e) { if (e.target === this) overlay(id, false); }); });
  // =====================================================================
  //  ホスト（authoritative）
  // =====================================================================
  var host = null;
  function hostId(code) { return ID_PREFIX + code; }
  function newRoom(name) {
    return { code: genCode(), phase: 'lobby', opts: { seats: 2, lv: ['normal', 'normal', 'normal', 'normal'] }, nextSid: 2, gameNo: 0,
      seats: [{ sid: 1, name: name, kind: 'host', clientId: myId, connected: true }], G: null, notice: null, lobbyReq: null };
  }
  function startHost(name, resumeRoom) {
    document.body.classList.add('is-host');
    host = { room: resumeRoom || newRoom(name), conns: {}, lastSeen: {}, tries: 0, opened: false };
    if (resumeRoom) host.room.seats.forEach(function (s) { if (s.kind === 'remote') s.connected = false; });
    connecting(true, resumeRoom ? '部屋を再開しています…' : '部屋を作っています…', 'シグナリングサーバーに接続中', function () { location.href = location.pathname; });
    openHostPeer();
    setInterval(hostHeartbeat, 2000);
    setInterval(hostTick, TURBO ? 40 : 100);
  }
  function seatTotal(seats, opts) { return Math.max(2, Math.min(4, Math.max(opts.seats, seats.length))); }
  function planPlayers(seats, opts) {
    var n = seatTotal(seats, opts), out = [], ci = 0;
    for (var i = 0; i < n; i++) { var h = seats[i]; out.push(h ? { kind: 'human', sid: h.sid, name: h.name } : { kind: 'cpu', lv: opts.lv[ci++] || 'normal', name: '' }); }
    var cpus = out.filter(function (o) { return o.kind === 'cpu'; });
    cpus.forEach(function (o, i) { o.name = cpus.length > 1 ? CPU_BASE + (i + 1) : CPU_BASE; });
    return out;
  }
  function hostStartGame() {
    var R = host.room;
    if (!R.seats.length) return;
    R.gameNo++; R.lobbyReq = null;
    var pl = planPlayers(R.seats, R.opts);
    R.G = { st: L.newGame(pl.length, Math.random), pl: pl, last: null, log: [], logId: 0, cpuAt: 0, startAt: Date.now() + (TURBO ? 300 : 900), say: null, endAt: 0 };
    log('ゲームスタート！ 先手は ' + pl[R.G.st.turn].name);
    R.phase = 'game';
    hostBroadcast();
  }
  function log(text) { var G = host.room.G; G.log.push({ id: ++G.logId, text: text }); if (G.log.length > 5) G.log.shift(); }
  function afterMove(p, res) {
    var G = host.room.G, o = G.pl[p];
    G.cpuAt = 0;
    if (res.over) { G.endAt = Date.now() + T.endPause; log(G.st.hands[G.st.winner].length ? '山がなくなりました。' + G.pl[G.st.winner].name + ' の勝ち！' : G.pl[p].name + ' が上がり！'); }
    if (o.kind === 'cpu') {
      var line = null;
      if (res.opening && Math.random() < 0.7) line = pick(CPU_LINES.open);
      else if (res.drew && Math.random() < 0.15) line = pick(CPU_LINES.draw);
      else if (res.placed && Math.random() < 0.2) line = pick(CPU_LINES[o.lv] || CPU_LINES.normal);
      if (line) G.say = { id: G.st.moves, p: p, text: line };
    }
    hostBroadcast();
  }
  function doCommit(p, table) {
    var G = host.room.G, res = L.commit(G.st, p, table);
    if (res.err) return res;
    G.last = { id: G.st.moves, p: p, placed: res.placed };
    log(G.pl[p].name + '：' + res.placed.length + '枚出した' + (res.opening ? '（初回 ' + res.openPts + '点）' : ''));
    afterMove(p, res); return res;
  }
  function doDraw(p) {
    var G = host.room.G, res = L.draw(G.st, p);
    if (res.err) return res;
    G.last = { id: G.st.moves, p: p, placed: [], drew: true };
    log(G.pl[p].name + '：' + (res.pass ? '山がないのでパス' : '1枚引いた'));
    res.drew = true; afterMove(p, res); return res;
  }
  var ERR = { invalid: '正しくない組があります（赤い枠）', open: '初回は手札だけで30点以上が必要です', touch: '初回は場のタイルを動かしたり付け足したりできません', kept: '場のタイルは手札に戻せません', none: 'タイルを出すか、1枚引いてね', bad: 'その並べ方はできません', turn: 'あなたの番ではありません' };
  function hostAction(sid, m) {
    var R = host.room, G = R.G; if (!G || R.phase !== 'game') return null;
    var st = G.st, p = st.turn, o = G.pl[p];
    if (st.over) return null;
    if (!o || o.kind !== 'human' || o.sid !== sid) return ERR.turn;
    if (m.g !== R.gameNo || m.n !== st.moves) return 'STALE';   // 古い画面からの操作（二度押し・通信の遅れ）は無視
    if (m.t === 'draw') { doDraw(p); return null; }
    if (m.t === 'commit') {
      if (!Array.isArray(m.table) || m.table.length > 60) return ERR.bad;
      var table = m.table.map(function (x) { return Array.isArray(x) ? x.slice(0, 13).map(function (v) { return v | 0; }) : []; });
      var r = doCommit(p, table);
      return r.err ? (ERR[r.err] || ERR.bad) : null;
    }
    return null;
  }
  function hostTick() {
    if (!host || !host.opened) return;
    var R = host.room, G = R.G, now = Date.now();
    if (R.phase !== 'game' || !G) return;
    G.pl.forEach(function (o) { if (o.subFor) { var s = seatBySid(o.subFor); if (s && s.connected) { o.kind = 'human'; o.sid = o.subFor; o.name = s.name; delete o.subFor; delete o.lv; toastAll(s.name + 'が戻ってきました'); hostBroadcast(); } } });
    if (G.st.over) { if (now >= G.endAt) { R.phase = 'end'; hostBroadcast(); } return; }
    if (now < G.startAt) return;
    if (!G.started) { G.started = true; hostBroadcast(); }
    var p = G.st.turn, o = G.pl[p];
    if (o.kind === 'cpu') {
      if (!G.cpuAt) G.cpuAt = now + rand(T.cpu);
      if (now >= G.cpuAt) { var m = L.aiTurn(G.st, p, o.lv, Math.random); if (m && !doCommit(p, m.table).err) return; doDraw(p); }
    }
  }
  function hostSubstitute() {   // 切断中の人の席を ふーさんが代打ち
    var G = host.room.G, o = G.pl[G.st.turn]; if (!o || o.kind !== 'human') return;
    var s = seatBySid(o.sid); if (!s || s.connected) return;
    o.subFor = o.sid; o.kind = 'cpu'; o.lv = 'normal'; o.name = s.name + '（代打ち' + BEAR + '）'; G.cpuAt = 0;
    toastAll(BEAR + ' ふーさんが ' + s.name + ' の代わりに打ちます'); hostBroadcast();
  }
  function viewFor(sid) {
    var R = host.room, G = R.G, you = -1;
    R.seats.forEach(function (s, i) { if (s.sid === sid) you = i; });
    var v = { t: 'state', phase: R.phase, code: R.code, you: you, sid: sid, gameNo: R.gameNo, opts: { seats: R.opts.seats, lv: R.opts.lv.slice() },
      seats: R.seats.map(function (s) { return { sid: s.sid, name: s.name, kind: s.kind, connected: s.kind !== 'remote' || s.connected }; }), notice: R.notice };
    if (sid === 1 && R.lobbyReq && R.phase !== 'lobby') v.lobbyReq = R.lobbyReq;
    if (R.phase === 'lobby' || !G) return v;
    var st = G.st, me = -1;
    G.pl.forEach(function (o, p) { if (o.kind === 'human' && o.sid === sid) me = p; });
    var cur = G.pl[st.turn], curSeat = cur && cur.kind === 'human' ? seatBySid(cur.sid) : null;
    v.g = { n: st.moves, turn: st.turn, over: st.over, me: me, table: st.table, pool: st.pool.length, hand: me >= 0 ? st.hands[me] : [],
      players: G.pl.map(function (o, p) { var s = o.kind === 'human' ? seatBySid(o.sid) : null; return { name: o.name, kind: o.kind, sid: o.sid, lv: o.lv, sub: !!o.subFor, connected: !s || s.connected, count: st.hands[p].length, opened: st.opened[p] }; }),
      hands: st.over ? st.hands : null, winner: st.winner, result: st.result, last: G.last, log: G.log, say: G.say,
      wait: Math.max(0, G.startAt - Date.now()), curOff: !!(curSeat && !curSeat.connected) };
    return v;
  }
  function openHostPeer() {
    var R = host.room, peer = new Peer(hostId(R.code), PEER_OPTS);
    host.peer = peer;
    peer.on('open', function () { host.opened = true; host.tries = 0; connecting(false); banner(''); hostRender(); saveHost(); });
    peer.on('connection', function (conn) {
      conn.on('data', function (msg) { hostOnMessage(conn, msg); });
      conn.on('close', function () { hostConnClosed(conn); });
      conn.on('error', function () { hostConnClosed(conn); });
    });
    peer.on('disconnected', function () { if (!peer.destroyed) setTimeout(function () { try { peer.reconnect(); } catch (e) {} }, 2000); });
    peer.on('error', function (e) {
      if (e.type === 'unavailable-id') {
        try { peer.destroy(); } catch (x) {}
        if (!host.opened && R.phase === 'lobby' && !host.resuming) { R.code = genCode(); openHostPeer(); return; }
        if (++host.tries > 25) { connecting(false); toast('部屋を再開できませんでした'); return; }
        connecting(true, '部屋を再開しています…', '少し時間がかかることがあります（' + host.tries + '）');
        setTimeout(openHostPeer, 3000);
      } else if (['network', 'server-error', 'socket-error', 'socket-closed'].indexOf(e.type) >= 0) {
        if (!host.opened) { connecting(true, 'サーバーに接続できません', '通信環境を確認してください。再試行しています…'); setTimeout(function () { try { peer.destroy(); } catch (x) {} openHostPeer(); }, 4000); }
        else banner('シグナリングサーバーとの接続が不安定です（ゲームは続行できます）');
      } else if (e.type === 'browser-incompatible') connecting(true, 'このブラウザは対応していません', 'Chrome / Safari の最新版でお試しください');
    });
  }
  function seatByClient(cid) { return host.room.seats.filter(function (s) { return s.clientId === cid; })[0]; }
  function seatBySid(sid) { return host.room.seats.filter(function (s) { return s.sid === sid; })[0]; }
  function hostOnMessage(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    var R = host.room;
    if (msg.t === 'join') return hostJoin(conn, msg);
    var seat = conn.clientId && seatByClient(conn.clientId);
    if (!seat || host.conns[conn.clientId] !== conn) return;
    host.lastSeen[conn.clientId] = Date.now();
    if (msg.t === 'ping') return;
    if (msg.t === 'lobbyReq') return hostLobbyReq(seat);
    if (msg.t === 'leave') {
      if (R.phase === 'lobby') R.seats.splice(R.seats.indexOf(seat), 1); else { seat.connected = false; seat.left = true; seat.lostAt = Date.now(); }
      delete host.conns[conn.clientId]; try { conn.close(); } catch (e) {}
      if (R.phase !== 'lobby') toastAll(seat.name + 'が退出しました');
      hostBroadcast(); return;
    }
    if (R.phase !== 'game' || msg.g !== R.gameNo || msg.n !== R.G.st.moves) return;
    var err = hostAction(seat.sid, msg);
    if (err) { try { conn.send({ t: 'error', msg: err === 'STALE' ? '' : err }); conn.send(viewFor(seat.sid)); } catch (e) {} }
  }
  function hostJoin(conn, msg) {
    var R = host.room, name = cleanName(msg.name), cid = String(msg.clientId || '').slice(0, 40);
    function reject(text) { conn.send({ t: 'reject', msg: text }); setTimeout(function () { try { conn.close(); } catch (e) {} }, 500); }
    if (!name || !cid) return reject('ニックネームを入力してください');
    if (cid === myId) return reject('ホストと同じ端末・ブラウザからは参加できません');
    var seat = seatByClient(cid);
    if (!seat) { seat = R.seats.filter(function (s) { return s.name === name && s.kind === 'remote' && !s.connected; })[0]; if (seat) seat.clientId = cid; }
    if (seat) {
      if (seat.kind !== 'remote') return reject('この名前は使えません');
      var old = host.conns[cid]; if (old && old !== conn) { try { old.close(); } catch (e) {} }
      seat.connected = true; seat.left = false;
    } else {
      if (R.phase !== 'lobby') return reject('この部屋はゲーム中です。前に参加していた人は、同じニックネームで入ると元の席に戻れます。');
      if (R.seats.length >= MAX_HUMANS) return reject('満員です（最大' + MAX_HUMANS + '人）');
      if (R.seats.some(function (s) { return s.name === name; }) || /^ふーさん/.test(name)) return reject('その名前は使えません。別のニックネームにしてください。');
      seat = { sid: R.nextSid++, name: name, kind: 'remote', clientId: cid, connected: true };
      R.seats.push(seat);
    }
    conn.clientId = cid; host.conns[cid] = conn; host.lastSeen[cid] = Date.now();
    conn.send({ t: 'welcome', code: R.code, sid: seat.sid });
    hostBroadcast();
  }
  function hostConnClosed(conn) {
    if (!conn.clientId || host.conns[conn.clientId] !== conn) return;
    delete host.conns[conn.clientId];
    var seat = seatByClient(conn.clientId);
    if (seat && seat.connected) { seat.connected = false; seat.lostAt = Date.now(); hostBroadcast(); }
  }
  function hostHeartbeat() {
    if (!host) return;
    var now = Date.now();
    Object.keys(host.conns).forEach(function (cid) {
      var c = host.conns[cid];
      try { c.send({ t: 'hb' }); } catch (e) {}
      if (now - (host.lastSeen[cid] || 0) > LOST_MS) { try { c.close(); } catch (e) {} hostConnClosed(c); }
    });
  }
  function toastAll(msg) { var R = host.room; R.notice = { id: (R.notice ? R.notice.id : 0) + 1, msg: msg, toast: true }; }
  function hostToLobby(msg) {
    var R = host.room;
    R.phase = 'lobby'; R.G = null; R.lobbyReq = null;
    R.seats = R.seats.filter(function (s) { if (s.kind === 'remote') { s.left = false; return !!s.connected; } return true; });
    R.notice = { id: (R.notice ? R.notice.id : 0) + 1, msg: msg };
    hostBroadcast();
  }
  function hostLobbyReq(seat) {
    var R = host.room;
    if (seat.kind !== 'remote' || R.phase === 'lobby') return;
    if (R.lobbyReq && R.lobbyReq.sid === seat.sid && Date.now() - R.lobbyReq.at < 5000) return;
    R.lobbyReq = { sid: seat.sid, name: seat.name, at: Date.now() };
    hostBroadcast();
  }
  function hostBroadcast() {
    var R = host.room;
    R.seats.forEach(function (s) { if (s.kind !== 'remote') return; var c = host.conns[s.clientId]; if (c && c.open) { try { c.send(viewFor(s.sid)); } catch (e) {} } });
    hostRender(); saveHost();
  }
  function hostRender() { render(viewFor(1)); }
  function saveHost() { try { localStorage.setItem(LS_HOST, JSON.stringify({ room: host.room, saved: Date.now() })); } catch (e) {} }

  // ---- ホストのロビー操作 ----
  $('seatList').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-sid]'); if (!b || !host) return;
    var R = host.room, seat = seatBySid(+b.dataset.sid);
    if (!seat || seat.kind !== 'remote' || R.phase !== 'lobby') return;
    var doRemove = function () {
      var c = host.conns[seat.clientId]; if (c) { try { c.send({ t: 'kicked' }); } catch (x) {} setTimeout(function () { try { c.close(); } catch (x) {} }, 300); delete host.conns[seat.clientId]; }
      R.seats.splice(R.seats.indexOf(seat), 1); hostBroadcast();
    };
    if (seat.connected) confirmBox(seat.name + 'を外しますか？', '部屋から退出させます。', '外す', doRemove); else doRemove();
  });
  $('seatSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-v]'); if (!b || !host || host.room.phase !== 'lobby') return;
    host.room.opts.seats = +b.dataset.v; hostBroadcast();
  });
  $('cpuList').addEventListener('change', function (e) {
    var s = e.target.closest('select[data-c]'); if (!s || !host || host.room.phase !== 'lobby') return;
    if (LV_KEYS.indexOf(s.value) >= 0) { host.room.opts.lv[+s.dataset.c] = s.value; hostBroadcast(); }
  });
  $('lvAllSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-v]'); if (!b || !host || host.room.phase !== 'lobby') return;
    host.room.opts.lv = [b.dataset.v, b.dataset.v, b.dataset.v, b.dataset.v]; hostBroadcast();
  });

  $('startBtn').onclick = function () { if (host) hostStartGame(); };
  $('againBtn').onclick = function () { if (host && host.room.phase === 'end') hostStartGame(); };
  $('toLobbyBtn').onclick = function () { if (host && host.room.phase === 'end') hostToLobby('ロビーに戻りました'); };
  function copyUrl() {
    var u = $('inviteUrl').textContent;
    function legacy() { try { var ta = document.createElement('textarea'); ta.value = u; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, u.length); var ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; } }
    var p = navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(u) : Promise.reject();
    p.then(function () { toast('招待URLをコピーしました'); }, function () { toast(legacy() ? '招待URLをコピーしました' : 'URLを長押ししてコピーしてください'); });
  }
  $('copyBtn').onclick = copyUrl;
  $('shareBtn').onclick = function () {
    var data = { title: '数列陣', text: 'いっしょに「数列陣」で遊ぼう！ 部屋コード ' + $('codeBig').textContent, url: $('inviteUrl').textContent };
    if (!navigator.share || (navigator.canShare && !navigator.canShare(data))) return copyUrl();
    try { navigator.share(data).catch(function (e) { if (!e || e.name !== 'AbortError') copyUrl(); }); } catch (e) { copyUrl(); }
  };

  var client = null;
  function startClient(code, name) {
    document.body.classList.remove('is-host');
    client = { code: code, name: name, joined: false, lastMsg: Date.now(), everJoined: false };
    connecting(true, '部屋 ' + code + ' に接続中…', 'しばらくお待ちください', function () { leaveClient(true); });
    var peer = new Peer(PEER_OPTS);
    client.peer = peer;
    peer.on('open', function () { clientConnect(); });
    peer.on('disconnected', function () { if (!peer.destroyed) setTimeout(function () { try { peer.reconnect(); } catch (e) {} }, 2000); });
    peer.on('error', function (e) {
      if (e.type === 'peer-unavailable') { if (!client.everJoined) { connecting(false); toast('部屋が見つかりません。コードを確認してください。'); leaveClient(false); } else clientLost(); }
      else if (['network', 'server-error', 'socket-error', 'socket-closed'].indexOf(e.type) >= 0) { if (!client.everJoined) connecting(true, 'サーバーに接続できません', '通信環境を確認してください。再試行しています…'); }
      else if (e.type === 'browser-incompatible') connecting(true, 'このブラウザは対応していません', 'Chrome / Safari の最新版でお試しください');
    });
    clearInterval(client.hbTimer); client.hbTimer = setInterval(clientHeartbeat, HB_MS);
    setTimeout(function () { if (client && !client.everJoined && $('connecting').classList.contains('active')) $('connText').textContent = 'つながりにくいようです。コードが正しいか、ホストが部屋を開いているか確認してください。（通信環境によっては接続できない場合があります）'; }, 15000);
  }
  function clientConnect() {
    if (!client || !client.peer || client.peer.destroyed) return;
    if (client.conn) { try { client.conn.close(); } catch (e) {} }
    var conn = client.peer.connect(hostId(client.code), { reliable: true });
    client.conn = conn;
    conn.on('open', function () { conn.send({ t: 'join', name: client.name, clientId: myId }); });
    conn.on('data', function (m) { if (client && client.conn === conn) clientOnMessage(m); });
    conn.on('close', function () { if (client && client.conn === conn) clientLost(); });
    conn.on('error', function () { if (client && client.conn === conn) clientLost(); });
  }
  function clientOnMessage(m) {
    if (!m || typeof m !== 'object') return;
    client.lastMsg = Date.now();
    if (m.t === 'welcome') { client.joined = true; client.everJoined = true; connecting(false); banner(''); sstore(SS_CLIENT, { code: client.code, name: client.name }); }
    else if (m.t === 'state') { pending = ''; render(m); }
    else if (m.t === 'reject') { connecting(false); leaveClient(false); alertBox(m.msg); }
    else if (m.t === 'kicked') { sstore(SS_CLIENT, null); leaveClient(false); alertBox('ホストによって部屋から外されました。'); }
    else if (m.t === 'closed') { sstore(SS_CLIENT, null); leaveClient(false); alertBox('ホストが部屋を閉じました。'); }
    else if (m.t === 'error') { pending = ''; if (m.msg) toast(m.msg); stageKey = ''; if (lastView) render(lastView); }
  }
  function clientHeartbeat() {
    if (!client) return;
    if (client.conn && client.conn.open) { try { client.conn.send({ t: 'ping' }); } catch (e) {} }
    if (client.everJoined && Date.now() - client.lastMsg > LOST_MS) clientLost();
  }
  function clientLost() {
    if (!client || !client.everJoined) return;
    client.joined = false; banner('ホストとの接続が切れました。再接続しています…');
    clearTimeout(client.retryT);
    client.retryT = setTimeout(function () {
      if (!client) return; client.lastMsg = Date.now();
      if (client.peer.disconnected && !client.peer.destroyed) { try { client.peer.reconnect(); } catch (e) {} }
      clientConnect();
    }, 3000);
  }
  function leaveClient(sendLeave) {
    if (!client) return;
    if (sendLeave && client.conn && client.conn.open) { try { client.conn.send({ t: 'leave' }); } catch (e) {} }
    clearInterval(client.hbTimer); clearTimeout(client.retryT);
    var p = client.peer; client = null;
    setTimeout(function () { try { p.destroy(); } catch (e) {} }, 300);
    banner(''); connecting(false); show('title'); renderTitle();
  }
  function send(m) { if (client && client.conn && client.conn.open) { client.conn.send(m); return true; } toast('接続が切れています'); return false; }

  // ---- 操作（ホストも参加者も同じ入口） ----
  var lastView = null, pending = '', stageKey = '';
  function act(m) {
    var v = lastView; if (!v || v.phase !== 'game') return;
    m.g = v.gameNo; m.n = v.g.n;
    if (host) { var err = hostAction(1, m); if (err && err !== 'STALE') toast(err); return; }
    var key = m.t + ':' + m.n;
    if (pending === key) return;
    if (send(m)) pending = key;
  }
  function leaveRoom() {
    if (host) {
      confirmBox('部屋を閉じますか？', '参加者全員の接続が切れ、ゲームは終了します。', '部屋を閉じる', function () {
        Object.keys(host.conns).forEach(function (cid) { try { host.conns[cid].send({ t: 'closed' }); } catch (e) {} });
        store(LS_HOST, null);
        setTimeout(function () { try { host.peer.destroy(); } catch (e) {} location.href = location.pathname; }, 400);
      });
    } else confirmBox('部屋を出ますか？', 'ゲーム中に出た場合も、同じニックネームで入り直せば元の席に戻れます。', '部屋を出る', function () { sstore(SS_CLIENT, null); leaveClient(true); });
  }
  $('leaveBtn1').onclick = $('leaveBtn2').onclick = leaveRoom;
  $('menuBtn').onclick = function () { overlay('menuModal', true); };
  function confirmAbort() {
    confirmBox('中断してロビーに戻りますか？', 'いまのゲームを終了して、全員をこの部屋のロビーに戻します。部屋コード・参加者・設定はそのままです。', '中断してロビーへ', function () {
      if (host && host.room.phase !== 'lobby') hostToLobby('⏸️ ホストがゲームを中断しました');
    });
  }
  $('menuAbort').onclick = function () { overlay('menuModal', false); confirmAbort(); };
  $('menuReq').onclick = function () { overlay('menuModal', false); send({ t: 'lobbyReq' }); toast('ホストに「ロビーに戻りたい」と伝えました'); };
  $('menuLeave').onclick = function () { overlay('menuModal', false); leaveRoom(); };
  $('menuRules').onclick = function () { overlay('menuModal', false); overlay('rulesModal', true); };
  $('menuClose').onclick = function () { overlay('menuModal', false); };
  $('lobbyReqBar').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-lr]'); if (!b || !host) return;
    if (b.dataset.lr === 'no') { host.room.lobbyReq = null; hostBroadcast(); } else confirmAbort();
  });
  var seenNotice = null;
  function noticeUi(v) {
    if (seenNotice === null) seenNotice = v.notice ? v.notice.id : 0;
    else if (v.notice && v.notice.id !== seenNotice) { seenNotice = v.notice.id; if (v.notice.toast || !host) toast(v.notice.msg + (!v.notice.toast && v.phase === 'lobby' ? '。ロビーで次のゲームを待っています' : '')); }
    if (v.phase === 'lobby') overlay('menuModal', false);
    var bar = $('lobbyReqBar'), key = host && v.lobbyReq && v.phase !== 'lobby' ? v.lobbyReq.sid + ':' + v.lobbyReq.at : '';
    if (bar.dataset.key !== key) {
      bar.dataset.key = key;
      bar.innerHTML = key ? '<span>🙋 ' + esc(v.lobbyReq.name) + '「ロビーに戻りたい」</span><button data-lr="abort">中断してロビーへ</button><button data-lr="no" class="ghost">とじる</button>' : '';
      bar.classList.toggle('show', !!key);
    }
  }

  // =====================================================================

  // =====================================================================
  //  画面（各端末）
  // =====================================================================
  var ui = { ws: null, sel: [], n: -1, gameKey: '', sort: 'c', sayId: null };
  function tk(id, cls) {
    if (L.isJ(id)) return '<i class="tk jk' + (cls ? ' ' + cls : '') + '" data-id="' + id + '">🐻<small>J</small></i>';
    var c = L.color(id); return '<i class="tk c' + c + (cls ? ' ' + cls : '') + '" data-id="' + id + '" aria-label="' + CN[c] + L.num(id) + '">' + L.num(id) + '<small>' + MARK[c] + '</small></i>';
  }
  function sortHand(h) {
    return h.slice().sort(function (a, b) {
      var ja = L.isJ(a), jb = L.isJ(b); if (ja || jb) return ja - jb;
      return ui.sort === 'c' ? (L.color(a) - L.color(b) || L.num(a) - L.num(b)) : (L.num(a) - L.num(b) || L.color(a) - L.color(b));
    });
  }
  function render(v) {
    lastView = v; window.__sr.view = v;
    noticeUi(v);
    if (v.phase !== 'game') document.querySelectorAll('.bubble').forEach(function (b) { b.remove(); });
    if (v.phase === 'lobby') { show('lobby'); renderLobby(v); ui.n = -1; ui.ws = null; return; }
    if (v.phase === 'end') { show('end'); renderEnd(v); return; }
    show('game'); renderGame(v);
  }
  function lvSelect(c, lv) { return '<select data-c="' + c + '" aria-label="ふーさんの強さ">' + LV_KEYS.map(function (k) { return '<option value="' + k + '"' + (k === lv ? ' selected' : '') + '>' + LV[k] + '</option>'; }).join('') + '</select>'; }
  function renderLobby(v) {
    var isHost = !!host, n = v.seats.length;
    $('codeBig').textContent = v.code;
    var url = inviteUrl(v.code);
    $('inviteUrl').textContent = url;
    if ($('qr').dataset.url !== url) { try { var qr = qrcode(0, 'M'); qr.addData(url); qr.make(); $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { $('qr').textContent = ''; } $('qr').dataset.url = url; }
    $('seatCount').textContent = n + ' / ' + MAX_HUMANS + '人';
    $('seatList').innerHTML = v.seats.map(function (s, i) {
      var tags = (s.kind === 'host' ? '<span class="tagx host">ホスト</span>' : '') + (i === v.you ? '<span class="tagx you">あなた</span>' : '') + (s.kind === 'remote' && !s.connected ? '<span class="tagx off">切断</span>' : '');
      return '<div class="seat' + (s.connected ? '' : ' offline') + '"><span class="av" style="background:#2f6b4a">' + (i + 1) + '</span><span class="nm">' + esc(s.name) + '</span>' + tags + (isHost && s.kind === 'remote' ? '<button class="xbtn" data-sid="' + s.sid + '" aria-label="外す">×</button>' : '') + '</div>';
    }).join('');
    var total = seatTotal(v.seats, v.opts), pl = planPlayers(v.seats, v.opts);
    $('seatSeg').innerHTML = [2, 3, 4].map(function (k) { return '<button data-v="' + k + '" class="' + (k === total ? 'on' : '') + '"' + (isHost && k >= n ? '' : ' disabled') + '>' + k + '人</button>'; }).join('');
    $('seatSeg').classList.toggle('ro', !isHost);
    var ci = 0;
    $('cpuList').innerHTML = pl.map(function (o) {
      if (o.kind !== 'cpu') return '';
      var c = ci++;
      return '<div class="crow"><span style="font-size:20px">' + BEAR + '</span><span class="nm">' + esc(o.name) + '</span>' + (isHost ? lvSelect(c, o.lv) : '<span class="lv">' + LV[o.lv] + '</span>') + '</div>';
    }).join('');
    $('lvAllSeg').innerHTML = LV_KEYS.map(function (k) { return '<button data-v="' + k + '">' + LV[k] + '</button>'; }).join('');
    $('lvAllBox').style.display = ci ? '' : 'none';
    $('seatHint').textContent = n >= MAX_HUMANS ? '満員です（4人とも人間）' : '2〜4人で遊べます。1人でも ふーさん🐻 と対戦できます';
    $('startBtn').disabled = n < 1;
  }

  // ---- ゲーム画面 ----
  function myTurnNow(v) { return v.g.me >= 0 && v.g.turn === v.g.me && !v.g.over && v.g.wait <= 0; }
  function pseudoG(v) { var g = v.g, hands = [], opened = []; g.players.forEach(function (P, p) { hands.push(p === g.me ? g.hand : []); opened.push(P.opened); }); return { hands: hands, table: g.table, opened: opened, pool: { length: g.pool }, n: g.players.length, turn: g.turn, over: g.over }; }
  function onTable0(v) { var m = {}; v.g.table.forEach(function (x) { x.forEach(function (id) { m[id] = 1; }); }); return m; }
  function changed() { return !!(ui.ws && lastView && lastView.g && L.wsDirty(ui.ws, lastView.g.table, lastView.g.hand)); }
  function wsGuard() {   // 念のため：作業領域のタイルが 場＋手札 と一致しなければ番の最初に戻す
    var a = L.wsAudit(ui.ws, lastView.g.table, lastView.g.hand);
    if (a.ok) return true;
    try { console.warn('ws audit failed', a); } catch (e) {}
    ui.ws = L.wsNew(lastView.g.table, lastView.g.hand); ui.sel = []; toast('並びにずれが見つかったので、この番の最初に戻しました'); return false;
  }
  function renderGame(v) {
    var g = v.g, gk = v.code + ':' + v.gameNo, my = myTurnNow(v), busy = !host && !!pending;
    if (ui.gameKey !== gk) { ui.gameKey = gk; ui.sayId = g.say ? g.say.id : null; ui.n = -1; }
    if (ui.n !== g.n || (my && !ui.ws) || (!my && ui.ws)) {
      ui.n = g.n; ui.sel = [];
      ui.ws = my ? L.wsNew(g.table, g.hand) : null;
    }
    var table = ui.ws ? ui.ws.table : g.table, hand = ui.ws ? ui.ws.hand : g.hand, t0 = onTable0(v), cur = g.players[g.turn];
    document.body.classList.add('in-game');
    $('phLabel').innerHTML = g.over ? 'ゲーム終了！' : my ? '🎯 あなたの番！' : esc(cur.name) + ' の番' + (cur.kind === 'cpu' ? ' …' : '');
    $('poolChip').textContent = '山 ' + g.pool + '枚';
    $('players').style.setProperty('--np', g.players.length);
    $('players').innerHTML = g.players.map(function (P, p) {
      return '<div class="pc' + (p === g.turn && !g.over ? ' cur' : '') + (P.connected ? '' : ' off') + '"><span class="nm">' + esc(P.name) + '</span><span class="ct">🀫 ' + P.count + '枚</span><span class="sub">' +
        (P.opened ? '✔ 出した' : '初回まだ') + (P.kind === 'cpu' ? '・' + LV[P.lv] : p === g.me ? '・あなた' : !P.connected ? '・切断中' : '') + '</span></div>';
    }).join('');
    // 場
    var selOn = my && ui.sel.length, lastSet = {};
    if (!my && g.last && g.last.placed) g.last.placed.forEach(function (id) { lastSet[id] = 1; });
    var h = table.map(function (m, k) {
      var M = L.meld(m), ord = M.ok ? M.order : m, chg = my && m.some(function (id) { return !t0[id]; });
      return '<div class="meld' + (M.ok ? '' : ' bad') + (chg ? ' chg' : '') + '" data-k="' + k + '">' + (my ? '<span class="vl">' + (M.ok ? M.val + '点' : '× ' + L.meldWhy(m)) + '</span>' : '') +
        ord.map(function (id) { return tk(id, (ui.sel.indexOf(id) >= 0 ? 'sel' : '') + (my && !t0[id] ? ' mine' : '') + (lastSet[id] ? ' lastp' : '')); }).join('') +
        (selOn ? '<span class="drop" data-drop="' + k + '">＋</span>' : '') + '</div>';
    }).join('');
    if (selOn) h += '<span class="newMeld" data-drop="new">＋ 新しい組</span>';
    if (!table.length && !selOn) h += '<div class="emptyT">場はまだ空です。' + (my ? '手札のタイルをタップして選び、「＋ 新しい組」で並べよう' : '') + '</div>';
    $('table').innerHTML = h;
    // 状態とボタン
    var st = $('status'), msg = '';
    st.classList.toggle('mine', my);
    var opened = g.me >= 0 && g.players[g.me].opened;
    if (g.over) msg = '🎉 ' + esc(g.players[g.winner].name) + ' の勝ち！ 結果発表…';
    else if (my) {
      var chk = changed() ? L.checkCommit(pseudoG(v), g.me, table) : { err: 'none' };
      if (!opened) { var pts = 0; table.forEach(function (m) { if (m.every(function (id) { return !t0[id]; })) { var M = L.meld(m); if (M.ok) pts += M.val; } }); msg = '初回：手札だけで <b>' + pts + ' / 30点</b>　'; }
      if (busy) msg += '送信中…';
      else if (!changed()) msg += ui.sel.length ? '「＋」で置き場所をタップ' : 'タイルを選んで並べる／出せなければ 1枚引く';
      else if (chk.err) msg += '<span class="warn">決定できません：' + whyText(chk, table, v) + '</span>';
      else msg += '✔ 決定できます（' + (g.hand.length - hand.length) + '枚）';
      $('commitBtn').disabled = busy || !changed() || !!chk.err;
    } else if (g.wait > 0) msg = 'まもなく開始…';
    else msg = esc(cur.name) + ' が考えています…' + (host && g.curOff ? ' <button class="ib" style="background:var(--felt)" id="subBtn">' + BEAR + ' 代打ち</button>' : '');
    st.innerHTML = msg;
    $('ctrl').style.visibility = my ? 'visible' : 'hidden';
    $('resetBtn').disabled = busy || (!changed() && !ui.sel.length);
    $('backBtn').disabled = busy || !ui.sel.some(function (id) { return !t0[id] && hand.indexOf(id) < 0; });
    $('drawBtn').disabled = busy;
    $('drawBtn').textContent = g.pool ? '🀫 1枚引く' : 'パス';
    // 手札
    $('handInfo').textContent = g.me >= 0 ? 'あなたの手札 ' + hand.length + '枚（' + L.handPts(hand) + '点）' : '観戦中';
    $('hand').innerHTML = sortHand(hand).map(function (id) { return tk(id, ui.sel.indexOf(id) >= 0 ? 'sel' : ''); }).join('');
    // ログ・ひとこと
    $('lines').textContent = g.log.length ? g.log[g.log.length - 1].text : '';
    if (g.say && g.say.id !== ui.sayId) { ui.sayId = g.say.id; var b = document.createElement('div'); b.className = 'bubble'; b.textContent = g.players[g.say.p].name + '「' + g.say.text + '」'; document.body.appendChild(b); setTimeout(function () { b.remove(); }, 3000); }
  }
  function rerender() { if (lastView && lastView.phase === 'game') renderGame(lastView); }
  function whyText(chk, table, v) {
    if (chk.err === 'invalid') {
      var bad = []; table.forEach(function (m, k) { if (!L.meld(m).ok) bad.push(k); });
      var k = bad[0], first = bad.length ? (k + 1) + '番目の組（' + L.meldWhy(table[k]) + '）' : '赤い枠の組';
      return first + (bad.length > 1 ? ' ほか' + (bad.length - 1) + '組' : '') + 'を直してね';
    }
    if (chk.err === 'open') return '初回は手札だけで30点以上（あと ' + (30 - (chk.pts || 0)) + '点）';
    if (chk.err === 'touch') return '初回は場の組に触れず、手札だけで新しい組を作ってね';
    if (chk.err === 'none') return '手札から1枚以上出してね（場の並べ替えだけでは決定できません）';
    if (chk.err === 'kept') return '場にあったタイルは場に残してね';
    var a = L.wsAudit(ui.ws, v.g.table, v.g.hand);
    if (a.dup.length) return 'タイルが重なっています（リセットしてね）';
    return '並びが番の最初とずれています（リセットしてね）';
  }
  $('game').addEventListener('click', function (e) {
    var v = lastView; if (!v || v.phase !== 'game' || !ui.ws || !myTurnNow(v)) return;
    var drop = e.target.closest('[data-drop]');
    if (drop && ui.sel.length) {
      var dk = drop.dataset.drop;
      ui.ws = L.wsMove(ui.ws, ui.sel, dk === 'new' ? -1 : +dk);   // 組の位置は番号で指定（以前は配列の参照で探していて、組が二重になる不具合があった）
      ui.sel = []; wsGuard(); rerender(); return;
    }
    var tile = e.target.closest('.tk[data-id]'); if (!tile) return;
    var id = +tile.dataset.id, t0 = onTable0(v), opened = v.g.players[v.g.me].opened;
    if (t0[id] && !opened) { toast('初回（30点）を出すまでは、場のタイルは動かせません'); return; }
    var i = ui.sel.indexOf(id); if (i >= 0) ui.sel.splice(i, 1); else ui.sel.push(id);
    rerender();
  });
  $('resetBtn').onclick = function () { if (!lastView || !ui.ws) return; ui.ws = L.wsNew(lastView.g.table, lastView.g.hand); ui.sel = []; rerender(); };
  $('backBtn').onclick = function () {
    if (!ui.ws) return; var t0 = onTable0(lastView);
    if (ui.sel.some(function (id) { return t0[id]; })) toast('場にあったタイルは手札に戻せません');
    ui.ws = L.wsBack(ui.ws, ui.sel, lastView.g.table);
    ui.sel = ui.sel.filter(function (id) { return t0[id]; }); wsGuard(); rerender();
  };
  $('commitBtn').onclick = function () { if (!ui.ws || !wsGuard()) { rerender(); return; } act({ t: 'commit', table: ui.ws.table.map(function (m) { var M = L.meld(m); return M.ok ? M.order : m; }) }); };
  $('drawBtn').onclick = function () {
    if (!ui.ws) return;
    var go = function () { act({ t: 'draw' }); };
    if (changed()) confirmBox('並べたタイルを戻して引きますか？', 'この番に並べたタイルは手札に戻り、1枚引いて番が終わります。', lastView.g.pool ? '戻して1枚引く' : '戻してパス', go); else go();
  };
  $('sortC').onclick = function () { ui.sort = 'c'; $('sortC').classList.add('on'); $('sortN').classList.remove('on'); rerender(); };
  $('sortN').onclick = function () { ui.sort = 'n'; $('sortN').classList.add('on'); $('sortC').classList.remove('on'); rerender(); };
  $('status').addEventListener('click', function (e) { if (e.target.id === 'subBtn' && host) hostSubstitute(); });
  // ---- 結果 ----
  function renderEnd(v) {
    var g = v.g, rs = g.result || { score: [], remain: [] };
    document.body.classList.remove('in-game');
    var order = g.players.map(function (P, p) { return p; }).sort(function (a, b) { return rs.score[b] - rs.score[a] || rs.remain[a] - rs.remain[b]; });
    $('endTitle').textContent = '🀄 ' + g.players[g.winner].name + ' の勝ち！';
    var rank = 0;
    $('rankList').innerHTML = order.map(function (p, i) {
      if (i === 0 || rs.score[p] !== rs.score[order[i - 1]]) rank = i + 1;
      var P = g.players[p], hand = g.hands ? g.hands[p] : [];
      return '<div class="rk' + (p === g.winner ? ' first' : '') + '"><span class="md">' + (['🥇', '🥈', '🥉'][rank - 1] || rank) + '</span><span class="nm">' + esc(P.name) + (P.kind === 'cpu' ? ' <span class="lv" style="font-size:10px;padding:1px 6px;border-radius:99px;background:#f2ead8">' + LV[P.lv] + '</span>' : '') +
        '<small>' + (hand.length ? '残り ' + hand.length + '枚・' + rs.remain[p] + '点' : '🎉 上がり！') + '</small><span class="rem">' + sortHand(hand).map(function (id) { return tk(id); }).join('') + '</span></span><span class="sc">' + (rs.score[p] > 0 ? '+' : '') + rs.score[p] + '</span></div>';
    }).join('') + (g.players[g.winner].kind === 'cpu' ? '<p class="mid">' + BEAR + '「ぜんぶ並べたクマ〜！」</p>' : '');
    $('leaveBtn2').textContent = host ? '🚪 部屋を閉じる' : '🚪 部屋を出る';
  }

  function renderTitle() {
    if (!$('nameIn').value) $('nameIn').value = load(LS_NAME) || '';
    var inv = normCode(Q.get('room'));
    $('inviteJoinBox').style.display = inv.length === 4 ? '' : 'none';
    $('invCode').textContent = inv;
    if (inv.length === 4) $('codeIn').value = inv;
    var saved = load(LS_HOST, true), ok = saved && saved.room && Date.now() - saved.saved < 12 * 3600 * 1000;
    $('resumeBtn').style.display = ok ? '' : 'none';
    if (ok) $('resumeBtn').textContent = '前回の部屋（' + saved.room.code + '）を再開する';
    var joined = sload(SS_CLIENT);
    $('rejoinBtn').style.display = joined ? '' : 'none';
    if (joined) $('rejoinBtn').textContent = '部屋 ' + joined.code + ' に戻る（' + joined.name + '）';
  }
  function getName() {
    var n = cleanName($('nameIn').value);
    if (!n) { toast('ニックネームを入力してください'); $('nameIn').focus(); return null; }
    store(LS_NAME, n); return n;
  }
  $('createBtn').onclick = function () { var n = getName(); if (n) { store(LS_HOST, null); startHost(n, null); } };
  $('resumeBtn').onclick = function () { var saved = load(LS_HOST, true); if (!saved) return; startHost(saved.room.seats[0].name, saved.room); host.resuming = true; };
  function join(code) {
    var n = getName(); if (!n) return;
    code = normCode(code);
    if (code.length !== 4) { toast('4文字の部屋コードを入力してください'); return; }
    startClient(code, n);
  }
  $('joinBtn').onclick = function () { join($('codeIn').value); };
  $('joinInvitedBtn').onclick = function () { join(Q.get('room')); };
  $('rejoinBtn').onclick = function () { var j = sload(SS_CLIENT); if (j) { $('nameIn').value = j.name; startClient(j.code, j.name); } };
  $('codeIn').addEventListener('input', function () { this.value = normCode(this.value); });
  if (location.protocol === 'file:') setTimeout(function () { toast('ファイルを直接開いています。招待URLは公開URL（https）でのみ使えます。'); }, 500);

  // ---- ページ全体の引っぱり（バウンス・プルで閉じる・プルで再読み込み）を止める ----
  // 古い iOS は overscroll-behavior が効かないので、スクロールできる要素の中で「その向きにまだ動ける」ときだけ許可する
  var touch0 = null;
  document.addEventListener('touchstart', function (e) { if (e.touches.length === 1) touch0 = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!e.cancelable) return;
    if (e.touches.length > 1) { if (!e.target.closest || !e.target.closest('#__none')) e.preventDefault(); return; }   // 盤の外のピンチ（ページ拡大）は止める
    if (!touch0) return;
    var t = e.touches[0], dx = t.clientX - touch0.x, dy = t.clientY - touch0.y, ax = Math.abs(dx), ay = Math.abs(dy);
    if (!ax && !ay) return;
    for (var el = e.target; el && el.nodeType === 1 && el !== document.body; el = el.parentElement) {
      var cs = getComputedStyle(el);
      var canV = ay >= ax * 0.5 && /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1 && ((dy > 0 && el.scrollTop > 0) || (dy < 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1));
      var canH = ax >= ay * 0.5 && /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && ((dx > 0 && el.scrollLeft > 0) || (dx < 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1));
      if (canV || canH) return;
    }
    e.preventDefault();
  }, { passive: false });
  // テスト用：自動で打つ（window.__sr.autoplay = true）— 自分の手札と場から「普通」の手を考える
  setInterval(function () {
    var v = lastView; if (!window.__sr.autoplay || !v || v.phase !== 'game' || !v.g || pending || !myTurnNow(v)) return;
    var m = L.aiTurn(pseudoG(v), v.g.me, 'normal', Math.random);
    if (m) act({ t: 'commit', table: m.table }); else act({ t: 'draw' });
  }, 120);
  // テスト・デバッグ用
  window.__sr = { view: null, autoplay: false, ui: ui, act: function (m) { act(m); }, role: function () { return host ? 'host' : client ? 'client' : 'none'; }, hostRoom: function () { return host ? host.room : null; }, refresh: function () { if (host) hostBroadcast(); } };
  renderTitle();
})();
