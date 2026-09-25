/**
 * Minimal SQLite 3 database file writer.
 *
 * Builds a standards-compliant `.db` file from plain JS values, so a browser
 * export can be opened by any SQLite tool (DB Browser, TablePlus, sqlite3 CLI).
 * Implemented from the public file-format spec: https://sqlite.org/fileformat2.html
 *
 * Supported: UTF-8 text, integers, NULL, BLOB, multi-page tables, records that
 * spill onto overflow pages, and multi-level b-trees.
 * Not supported: indexes, WITHOUT ROWID tables, auto-vacuum, freelist reuse.
 */

const PAGE_SIZE = 4096;
const USABLE_SIZE = PAGE_SIZE; // bytes of each page usable by the b-tree
const SQLITE_VERSION_NUMBER = 3046000;

const PAGE_TYPE_INTERIOR_TABLE = 0x05;
const PAGE_TYPE_LEAF_TABLE = 0x0d;

/** Max payload bytes stored directly in a table leaf cell before spilling. */
const MAX_LOCAL_LEAF = USABLE_SIZE - 35; // 4061

/** Min local payload, per the spec's K/M formula. */
const MIN_LOCAL = ((((USABLE_SIZE - 12) * 32) / 255) | 0) - 23; // 489

/** Payload bytes carried by each overflow page, after its 4-byte next-page pointer. */
const OVERFLOW_CAPACITY = USABLE_SIZE - 4;

const FILE_HEADER_SIZE = 100;

export type SqlValue = null | number | string | Uint8Array;

export type SqliteTable = {
  name: string;
  /** The exact CREATE TABLE statement recorded in sqlite_master. */
  sql: string;
  rows: SqlValue[][];
};

const textEncoder = new TextEncoder();

/* ------------------------------------------------------------------ *
 * Primitive encoders
 * ------------------------------------------------------------------ */

function writeU16BE(page: Uint8Array, offset: number, value: number) {
  page[offset] = (value >>> 8) & 0xff;
  page[offset + 1] = value & 0xff;
}

function writeU32BE(page: Uint8Array, offset: number, value: number) {
  page[offset] = (value >>> 24) & 0xff;
  page[offset + 1] = (value >>> 16) & 0xff;
  page[offset + 2] = (value >>> 8) & 0xff;
  page[offset + 3] = value & 0xff;
}

/** Number of bytes a SQLite varint needs for a non-negative integer. */
function varintSize(value: number): number {
  if (value < 0x80) return 1;
  let size = 1;
  let remaining = value;
  while (remaining >= 0x80) {
    remaining = Math.floor(remaining / 128);
    size += 1;
  }
  return size;
}

function writeVarint(out: number[], value: number) {
  if (value < 0x80) {
    out.push(value);
    return;
  }
  const groups: number[] = [];
  let remaining = value;
  while (remaining > 0) {
    groups.push(remaining % 128);
    remaining = Math.floor(remaining / 128);
  }
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    out.push(i > 0 ? groups[i] | 0x80 : groups[i]);
  }
}

/**
 * Signed big-endian widths the spec allows, mapped to their serial types.
 * Note 6-byte and 8-byte integers use serial types 5 and 6 - the serial type
 * number is not the byte width.
 */
const INTEGER_WIDTHS: { width: number; type: number }[] = [
  { width: 1, type: 1 },
  { width: 2, type: 2 },
  { width: 3, type: 3 },
  { width: 4, type: 4 },
  { width: 6, type: 5 },
  { width: 8, type: 6 }
];

/** Smallest allowed width that holds `value`. */
function integerEncoding(value: number): { type: number; width: number } {
  for (const candidate of INTEGER_WIDTHS) {
    const limit = 2 ** (candidate.width * 8 - 1);
    if (value >= -limit && value < limit) return candidate;
  }
  return INTEGER_WIDTHS[INTEGER_WIDTHS.length - 1];
}

function integerBytes(value: number, width: number): number[] {
  const bytes: number[] = [];
  let remaining = BigInt(Math.trunc(value)) & ((1n << BigInt(width * 8)) - 1n);
  for (let i = width - 1; i >= 0; i -= 1) {
    bytes.push(Number((remaining >> BigInt(i * 8)) & 0xffn));
  }
  return bytes;
}

/**
 * Serial type + body bytes for one column value, per the record format.
 * See https://sqlite.org/fileformat2.html#the_record_format
 */
function encodeValue(value: SqlValue): { type: number; body: number[] } {
  if (value === null || value === undefined) return { type: 0, body: [] };

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      if (value === 0) return { type: 8, body: [] };
      if (value === 1) return { type: 9, body: [] };
      const { type, width } = integerEncoding(value);
      return { type, body: integerBytes(value, width) };
    }
    // IEEE-754 double, always 8 bytes
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, value, false);
    return { type: 7, body: Array.from(new Uint8Array(buffer)) };
  }

  if (typeof value === 'string') {
    const bytes = Array.from(textEncoder.encode(value));
    return { type: 13 + 2 * bytes.length, body: bytes };
  }

  const bytes = Array.from(value);
  return { type: 12 + 2 * bytes.length, body: bytes };
}

/** Serialise one row into a record payload: varint header size, serial types, then bodies. */
function encodeRecord(values: SqlValue[]): Uint8Array {
  const encoded = values.map(encodeValue);
  const typesLength = encoded.reduce((sum, entry) => sum + varintSize(entry.type), 0);

  // The header size counts itself, so grow it until the length is self-consistent.
  let headerSize = typesLength + 1;
  while (varintSize(headerSize) + typesLength !== headerSize) {
    headerSize = varintSize(headerSize) + typesLength;
  }

  const header: number[] = [];
  writeVarint(header, headerSize);
  encoded.forEach((entry) => writeVarint(header, entry.type));

  const bodyLength = encoded.reduce((sum, entry) => sum + entry.body.length, 0);
  const payload = new Uint8Array(header.length + bodyLength);
  payload.set(header, 0);

  let offset = header.length;
  encoded.forEach((entry) => {
    payload.set(entry.body, offset);
    offset += entry.body.length;
  });

  return payload;
}

/**
 * How much of a payload stays on the cell itself. Records above MAX_LOCAL_LEAF
 * keep a computed minimum on-page so overflow pages stay chained predictably.
 */
function localPayloadSize(payloadLength: number): number {
  if (payloadLength <= MAX_LOCAL_LEAF) return payloadLength;
  const k = MIN_LOCAL + ((payloadLength - MIN_LOCAL) % (USABLE_SIZE - 4));
  return k <= MAX_LOCAL_LEAF ? k : MIN_LOCAL;
}

/* ------------------------------------------------------------------ *
 * Page storage
 * ------------------------------------------------------------------ */

class PageStore {
  private pages: Uint8Array<ArrayBuffer>[] = [];

  allocate(): number {
    this.pages.push(new Uint8Array(new ArrayBuffer(PAGE_SIZE)));
    return this.pages.length;
  }

  get(pageNumber: number): Uint8Array<ArrayBuffer> {
    return this.pages[pageNumber - 1];
  }

  get count(): number {
    return this.pages.length;
  }

  toUint8Array(): Uint8Array<ArrayBuffer> {
    const file = new Uint8Array(new ArrayBuffer(this.pages.length * PAGE_SIZE));
    this.pages.forEach((page, index) => file.set(page, index * PAGE_SIZE));
    return file;
  }
}

type ChildRef = { page: number; maxKey: number };

/** Spill the tail of an oversized record into a chain of overflow pages. */
function writeOverflowChain(store: PageStore, payload: Uint8Array, localSize: number): number {
  const chunks: Uint8Array[] = [];
  for (let offset = localSize; offset < payload.length; offset += OVERFLOW_CAPACITY) {
    chunks.push(payload.subarray(offset, Math.min(offset + OVERFLOW_CAPACITY, payload.length)));
  }

  const pageNumbers = chunks.map(() => store.allocate());
  chunks.forEach((chunk, index) => {
    const page = store.get(pageNumbers[index]);
    writeU32BE(page, 0, index + 1 < pageNumbers.length ? pageNumbers[index + 1] : 0);
    page.set(chunk, 4);
  });

  return pageNumbers[0];
}

type Cell = { offset: number; bytes: number[] };

/**
 * Write the b-tree page header and cell pointer array. The caller sets the
 * page-type byte at `headerOffset` before calling this.
 */
function paintCells(page: Uint8Array, cells: Cell[], headerOffset: number, contentEnd: number) {
  writeU16BE(page, headerOffset + 1, 0); // first freeblock: none
  writeU16BE(page, headerOffset + 3, cells.length);
  writeU16BE(page, headerOffset + 5, contentEnd === 65536 ? 0 : contentEnd);
  page[headerOffset + 7] = 0; // no fragmented free bytes

  cells.forEach((cell, index) => {
    writeU16BE(page, headerOffset + 8 + index * 2, cell.offset);
    for (let i = 0; i < cell.bytes.length; i += 1) {
      page[cell.offset + i] = cell.bytes[i];
    }
  });
}

/** Pack as many records as fit into one leaf page; returns the next unread index. */
function buildLeafPage(store: PageStore, payloads: Uint8Array[], start: number): { page: number; nextIndex: number } {
  const pageNumber = store.allocate();
  const page = store.get(pageNumber);
  const cells: Cell[] = [];
  let contentEnd = PAGE_SIZE;
  let index = start;

  while (index < payloads.length) {
    const payload = payloads[index];
    const localSize = localPayloadSize(payload.length);
    const spills = payload.length > localSize;
    const rowid = index + 1; // rowids are implicit 1..N in insertion order
    const rowidSize = varintSize(rowid);
    const cellSize = varintSize(payload.length) + rowidSize + localSize + (spills ? 4 : 0);

    // The cell content grows down from the end of the page while the pointer
    // array grows up from the header, so they must not cross.
    if (contentEnd - cellSize < 8 + 2 * (cells.length + 1)) break;

    const bytes: number[] = [];
    writeVarint(bytes, payload.length);
    writeVarint(bytes, rowid);
    for (let i = 0; i < localSize; i += 1) bytes.push(payload[i]);
    if (spills) {
      const overflowPage = writeOverflowChain(store, payload, localSize);
      bytes.push((overflowPage >>> 24) & 0xff, (overflowPage >>> 16) & 0xff, (overflowPage >>> 8) & 0xff, overflowPage & 0xff);
    }

    contentEnd -= cellSize;
    cells.push({ offset: contentEnd, bytes });
    index += 1;
  }

  if (index === start) {
    throw new Error('SQLite export: a single record is too large to store');
  }

  page[0] = PAGE_TYPE_LEAF_TABLE;
  paintCells(page, cells, 0, contentEnd);

  return { page: pageNumber, nextIndex: index };
}

/** An empty table still needs a root page so its schema resolves. */
function buildEmptyLeafPage(store: PageStore): number {
  const pageNumber = store.allocate();
  const page = store.get(pageNumber);
  page[0] = PAGE_TYPE_LEAF_TABLE;
  paintCells(page, [], 0, PAGE_SIZE);
  return pageNumber;
}

/**
 * Group child pages under one interior page. All but the last child of this page
 * become cells; the last one is the right-most pointer. Always consumes at least
 * one child, so tree levels are guaranteed to shrink.
 */
function buildInteriorPage(store: PageStore, children: ChildRef[], start: number): { page: number; nextIndex: number } {
  const pageNumber = store.allocate();
  const page = store.get(pageNumber);
  const cells: Cell[] = [];
  let contentEnd = PAGE_SIZE;
  let index = start;

  while (index < children.length - 1) {
    const bytes: number[] = [];
    const childPage = children[index].page;
    bytes.push((childPage >>> 24) & 0xff, (childPage >>> 16) & 0xff, (childPage >>> 8) & 0xff, childPage & 0xff);
    writeVarint(bytes, children[index].maxKey);

    if (contentEnd - bytes.length < 12 + 2 * (cells.length + 1)) break;

    contentEnd -= bytes.length;
    cells.push({ offset: contentEnd, bytes });
    index += 1;
  }

  const rightMost = children[index];
  page[0] = PAGE_TYPE_INTERIOR_TABLE;
  writeU16BE(page, 1, 0); // first freeblock: none
  writeU16BE(page, 3, cells.length);
  writeU16BE(page, 5, contentEnd);
  page[7] = 0;
  writeU32BE(page, 8, rightMost.page);
  cells.forEach((cell, cellIndex) => {
    writeU16BE(page, 12 + cellIndex * 2, cell.offset);
    for (let i = 0; i < cell.bytes.length; i += 1) page[cell.offset + i] = cell.bytes[i];
  });

  return { page: pageNumber, nextIndex: index + 1 };
}

/** Build the b-tree for one table and return its root page number. */
function buildTableBTree(store: PageStore, rows: SqlValue[][]): number {
  if (rows.length === 0) return buildEmptyLeafPage(store);

  const payloads = rows.map(encodeRecord);
  const leaves: ChildRef[] = [];

  for (let index = 0; index < payloads.length; ) {
    const leaf = buildLeafPage(store, payloads, index);
    // Rowids are implicit 1..N, so the last rowid on a leaf is the next unread index.
    leaves.push({ page: leaf.page, maxKey: leaf.nextIndex });
    index = leaf.nextIndex;
  }

  let level = leaves;
  while (level.length > 1) {
    const parents: ChildRef[] = [];
    for (let index = 0; index < level.length; ) {
      const interior = buildInteriorPage(store, level, index);
      parents.push({ page: interior.page, maxKey: level[interior.nextIndex - 1].maxKey });
      index = interior.nextIndex;
    }
    level = parents;
  }

  return level[0].page;
}

/** sqlite_master always lives on page 1, after the 100-byte file header. */
function buildSchemaTable(store: PageStore, tables: { name: string; rootPage: number; sql: string }[]) {
  const page = store.get(1);
  const cells: Cell[] = [];
  let contentEnd = PAGE_SIZE;

  tables.forEach((table, index) => {
    const payload = encodeRecord(['table', table.name, table.name, table.rootPage, table.sql]);
    const localSize = localPayloadSize(payload.length);
    const rowidSize = varintSize(index + 1);
    const cellSize = varintSize(payload.length) + rowidSize + localSize;

    if (FILE_HEADER_SIZE + 8 + 2 * (cells.length + 1) + cellSize > PAGE_SIZE) {
      throw new Error('SQLite export: schema does not fit on page 1');
    }
    if (payload.length > localSize) {
      throw new Error('SQLite export: schema statement is too large');
    }

    const bytes: number[] = [];
    writeVarint(bytes, payload.length);
    writeVarint(bytes, index + 1);
    for (let i = 0; i < localSize; i += 1) bytes.push(payload[i]);

    contentEnd -= cellSize;
    cells.push({ offset: contentEnd, bytes });
  });

  page[FILE_HEADER_SIZE] = PAGE_TYPE_LEAF_TABLE;
  paintCells(page, cells, FILE_HEADER_SIZE, contentEnd);
}

function writeFileHeader(store: PageStore) {
  const page = store.get(1);
  const signature = 'SQLite format 3\u0000';

  for (let i = 0; i < signature.length; i += 1) {
    page[i] = signature.charCodeAt(i);
  }

  writeU16BE(page, 16, PAGE_SIZE);
  page[18] = 1; // write version: legacy
  page[19] = 1; // read version: legacy
  page[20] = 0; // bytes reserved per page
  page[21] = 64; // max embedded payload fraction
  page[22] = 32; // min embedded payload fraction
  page[23] = 32; // leaf payload fraction
  writeU32BE(page, 24, 1); // file change counter
  writeU32BE(page, 28, store.count); // database size in pages
  writeU32BE(page, 32, 0); // first freelist trunk page
  writeU32BE(page, 36, 0); // freelist page count
  writeU32BE(page, 40, 1); // schema cookie
  writeU32BE(page, 44, 4); // schema format number
  writeU32BE(page, 48, 0); // default page cache size
  writeU32BE(page, 52, 0); // largest root b-tree page (no auto-vacuum)
  writeU32BE(page, 56, 1); // text encoding: UTF-8
  writeU32BE(page, 60, 0); // user version
  writeU32BE(page, 64, 0); // incremental vacuum mode
  writeU32BE(page, 68, 0); // application id
  // bytes 72..91 are reserved and must be zero
  writeU32BE(page, 92, 1); // version-valid-for number
  writeU32BE(page, 96, SQLITE_VERSION_NUMBER);
}

/**
 * Serialise tables into a complete SQLite database file.
 */
export function buildSqliteDatabase(tables: SqliteTable[]): Uint8Array<ArrayBuffer> {
  const store = new PageStore();
  store.allocate(); // reserve page 1 for the file header + schema table

  const schema = tables.map((table) => ({
    name: table.name,
    rootPage: buildTableBTree(store, table.rows),
    sql: table.sql
  }));

  buildSchemaTable(store, schema);
  writeFileHeader(store);

  return store.toUint8Array();
}
