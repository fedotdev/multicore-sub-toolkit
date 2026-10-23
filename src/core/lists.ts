/** Списки доменов Flowreyt (zapret-discord-youtube) с фолбэком на jsDelivr. */

import type { DomainList, ListId } from './model'

const RAW_GITHUB = 'https://raw.githubusercontent.com/Flowseal/zapret-discord-youtube/main/lists/'
const JSDLVR = 'https://cdn.jsdelivr.net/gh/Flowseal/zapret-discord-youtube@main/lists/'

const LIST_DEFS: Record<ListId, { title: string; file: string; isUser?: boolean }> = {
  general: { title: 'list-general.txt', file: 'list-general.txt' },
  google: { title: 'list-google.txt', file: 'list-google.txt' },
  exclude: { title: 'list-exclude.txt', file: 'list-exclude.txt' },
  'ipset-exclude': { title: 'ipset-exclude.txt', file: 'ipset-exclude.txt' },
  'ipset-all': { title: 'ipset-all.txt', file: 'ipset-all.txt' },
  user: { title: 'user.txt', file: '', isUser: true },
}

const PLACEHOLDER_IPS = ['203.0.113.113/32', '198.51.100.1/32']

export interface ListFetchResult {
  id: ListId
  title: string
  lines: string[]
  enabled: boolean
  fetchedAt: number
  source: string
  ok: boolean
  error?: string
}

export function listTitle(id: ListId): string {
  return LIST_DEFS[id].title
}

export function defaultLists(): DomainList[] {
  return Object.entries(LIST_DEFS).map(([id, def]) => ({
    id: id as ListId,
    title: def.title,
    lines: [],
    enabled: id !== 'ipset-all',
    isUser: !!def.isUser,
  }))
}

/** Фильтруем комментарии, пустые строки и placeholder-IP (ipset-all). */
export function normalizeListLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('//'))
    .filter((l) => !PLACEHOLDER_IPS.includes(l) && !/^203\.0\.113\./.test(l))
}

export async function fetchList(
  id: ListId,
  signal?: AbortSignal,
  timeoutMs = 15000,
): Promise<ListFetchResult> {
  const def = LIST_DEFS[id]
  if (def.isUser) {
    return { id, title: def.title, lines: [], enabled: true, fetchedAt: Date.now(), source: 'user', ok: true }
  }

  const urls = [`${RAW_GITHUB}${def.file}`, `${JSDLVR}${def.file}`]
  let lastError: unknown
  for (const url of urls) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      const lines = normalizeListLines(text)
      return {
        id,
        title: def.title,
        lines,
        enabled: true,
        fetchedAt: Date.now(),
        source: url,
        ok: true,
      }
    } catch (err) {
      lastError = err
    }
  }
  return {
    id,
    title: def.title,
    lines: [],
    enabled: true,
    fetchedAt: Date.now(),
    source: urls[0],
    ok: false,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  }
}

export function fetchAllLists(signal?: AbortSignal): Promise<ListFetchResult[]> {
  return Promise.all(
    ['general', 'google', 'exclude', 'ipset-exclude', 'ipset-all'].map((id) => fetchList(id as ListId, signal)),
  )
}

export function diffLists(fetched: ListFetchResult[], current: DomainList[]): { added: string[]; removed: string[] } {
  const cur = new Set(
    current.filter((c) => !c.isUser).flatMap((c) => c.lines.map((l) => `${c.id}:${l}`)),
  )
  const fetchedSet = new Set(fetched.flatMap((f) => f.lines.map((l) => `${f.id}:${l}`)))
  const added = [...fetchedSet].filter((k) => !cur.has(k)).map((k) => k.split(':')[1])
  const removed = [...cur].filter((k) => !fetchedSet.has(k)).map((k) => k.split(':')[1])
  return { added, removed }
}
