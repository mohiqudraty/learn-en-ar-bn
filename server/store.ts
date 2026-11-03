import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Language, SearchSuccess } from '../shared/types';

const SUCCESS_MS = 14 * 24 * 60 * 60 * 1000;
const EMPTY_MS = 24 * 60 * 60 * 1000;

const directory = path.join(process.cwd(), 'data');
fs.mkdirSync(directory, { recursive: true });

const db = new DatabaseSync(path.join(directory, 'mohi.sqlite'));
db.exec(`
  CREATE TABLE IF NOT EXISTS searches (
    lang TEXT NOT NULL,
    query TEXT NOT NULL,
    payload TEXT NOT NULL,
    expires INTEGER NOT NULL,
    PRIMARY KEY (lang, query)
  )
`);

const readStatement = db.prepare(
  'SELECT payload, expires FROM searches WHERE lang = ? AND query = ?',
);
const deleteStatement = db.prepare('DELETE FROM searches WHERE lang = ? AND query = ?');
const writeStatement = db.prepare(`
  INSERT INTO searches (lang, query, payload, expires)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(lang, query) DO UPDATE SET
    payload = excluded.payload,
    expires = excluded.expires
`);

type StoredRow = {
  payload: string;
  expires: number;
};

export function readSearch(lang: Language, query: string): SearchSuccess | null {
  const row = readStatement.get(lang, query) as StoredRow | undefined;
  if (!row) return null;
  if (row.expires <= Date.now()) {
    deleteStatement.run(lang, query);
    return null;
  }
  return JSON.parse(row.payload) as SearchSuccess;
}

export function writeSearch(lang: Language, query: string, body: SearchSuccess): void {
  const ttl = body.clips.length > 0 ? SUCCESS_MS : EMPTY_MS;
  writeStatement.run(lang, query, JSON.stringify(body), Date.now() + ttl);
}
