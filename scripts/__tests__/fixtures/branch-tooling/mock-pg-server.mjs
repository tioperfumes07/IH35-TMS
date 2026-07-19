#!/usr/bin/env node
/**
 * Minimal Postgres v3 wire-protocol mock, run as its OWN PROCESS.
 *
 * The pre-push DB identity probe (probeVerifyDatabaseIdentity) validates capability with a
 * synchronous spawnSync child. An in-process mock would be frozen by that spawnSync in the test's
 * event loop and never answer, so probe tests must talk to a mock in a SEPARATE process. This
 * server speaks just enough protocol for the real `pg` client to authenticate and read a single
 * `current_database()` text column.
 *
 * Modes (env MOCK_MODE):
 *   ok        → authenticate; current_database() = 'ih35_verify'
 *   wrongdb   → authenticate; current_database() = 'neondb' (wrong database)
 *   authfail  → reject startup with ErrorResponse 28P01 (wrong credentials)
 *   raw       → accept the TCP socket then close it immediately (no pg protocol at all)
 *
 * On listen it prints `MOCK_PG_PORT=<port>` to stdout so the parent can build the URL.
 */
import net from "node:net";

const MODE = process.env.MOCK_MODE || "ok";
const DB = MODE === "wrongdb" ? "neondb" : "ih35_verify";

function withType(type, body) {
  const buf = Buffer.alloc(5 + body.length);
  buf.write(type, 0, "ascii");
  buf.writeInt32BE(body.length + 4, 1);
  body.copy(buf, 5);
  return buf;
}
function cstring(s) {
  return Buffer.concat([Buffer.from(s, "utf8"), Buffer.from([0])]);
}
function authenticationOk() {
  const b = Buffer.alloc(4);
  b.writeInt32BE(0, 0);
  return withType("R", b);
}
function readyForQuery() {
  return withType("Z", Buffer.from("I", "ascii"));
}
function rowDescriptionSingle(name) {
  const count = Buffer.alloc(2);
  count.writeInt16BE(1, 0);
  const fixed = Buffer.alloc(18);
  let o = 0;
  fixed.writeInt32BE(0, o); o += 4; // table OID
  fixed.writeInt16BE(0, o); o += 2; // column attr number
  fixed.writeInt32BE(25, o); o += 4; // type OID = text
  fixed.writeInt16BE(-1, o); o += 2; // type length (varlena)
  fixed.writeInt32BE(-1, o); o += 4; // type modifier
  fixed.writeInt16BE(0, o); o += 2; // format = text
  return withType("T", Buffer.concat([count, cstring(name), fixed]));
}
function dataRowSingle(value) {
  const count = Buffer.alloc(2);
  count.writeInt16BE(1, 0);
  const valBuf = Buffer.from(value, "utf8");
  const len = Buffer.alloc(4);
  len.writeInt32BE(valBuf.length, 0);
  return withType("D", Buffer.concat([count, len, valBuf]));
}
function commandComplete(tag) {
  return withType("C", cstring(tag));
}
function errorResponse(code, message) {
  const body = Buffer.concat([
    Buffer.from("S", "ascii"), cstring("FATAL"),
    Buffer.from("C", "ascii"), cstring(code),
    Buffer.from("M", "ascii"), cstring(message),
    Buffer.from([0]),
  ]);
  return withType("E", body);
}

const server = net.createServer((socket) => {
  if (MODE === "raw") {
    socket.end();
    return;
  }
  let startupHandled = false;
  socket.on("data", (data) => {
    if (!startupHandled && data.length === 8) {
      const code = data.readInt32BE(4);
      if (code === 80877103 || code === 80877104) {
        socket.write(Buffer.from("N", "ascii")); // no SSL / no GSS
        return;
      }
    }
    if (!startupHandled) {
      startupHandled = true;
      if (MODE === "authfail") {
        socket.write(errorResponse("28P01", "password authentication failed for user"));
        socket.end();
        return;
      }
      socket.write(Buffer.concat([authenticationOk(), readyForQuery()]));
      return;
    }
    if (data[0] === 0x51 /* 'Q' simple query */) {
      socket.write(
        Buffer.concat([
          rowDescriptionSingle("db"),
          dataRowSingle(DB),
          commandComplete("SELECT 1"),
          readyForQuery(),
        ])
      );
    } else if (data[0] === 0x58 /* 'X' terminate */) {
      socket.end();
    }
  });
  socket.on("error", () => {});
});

server.on("error", (err) => {
  process.stderr.write(`mock-pg-server error: ${err.message}\n`);
  process.exit(1);
});

server.listen(0, "127.0.0.1", () => {
  process.stdout.write(`MOCK_PG_PORT=${server.address().port}\n`);
});
