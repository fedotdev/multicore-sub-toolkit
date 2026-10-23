/** Маршрутизация: presets, генерация правил для Mihomo / Xray / Happ / v2rayNG. */

import type { DomainList } from './model'
import type { ZapretState } from './model'
import type { RoutingConfig } from './model'

export interface RoutingRule {
  /** Для Mihomo: строка правила. Для Xray/Happ: объект поля. */
  type: 'domain' | 'domain-regex' | 'domain-keyword' | 'ip-cidr' | 'ip-cidr6' | 'geoip' | 'geosite' | 'port' | 'process-name' | 'inbound-tag' | 'all' | 'and-not'
  /** Подпись, подробнее в форматных сериализаторах. */
  value: string
  /** Target tag: 'direct', 'vpn', 'zapret', 'final' (имя группы) */
  target: string
  comment?: string
}

/** Константы Discorda (из Flowreyt general.bat). */
export const DISCORD_VOICE_UDP_RANGES = ['19294-19344', '50000-50100']

/** Построить правила маршрутизации из конфига и состояния Zapret. */
export function buildRoutingRules(cfg: RoutingConfig, zapret: ZapretState): RoutingRule[] {
  const rules: RoutingRule[] = []
  const add = (v: string, target: string, comment?: string) =>
    rules.push({ type: 'domain', value: v, target, comment })

  /* --- Zapret mode --- */
  const zapretEnabled = zapret.mode === 'on'

  /* --- 1. Private / never via proxy (always DIRECT) --- */
  rules.push({ type: 'ip-cidr', value: 'geoip:private', target: 'direct', comment: 'local/private ranges' })
  rules.push({ type: 'domain', value: 'localhost', target: 'direct', comment: 'localhost' })

  /* --- 2. Zapret lists (DIRECT when Zapret ON, VPN when OFF) --- */
  if (zapretEnabled) {
    /* Объединённые списки zapret (DIRECT, осторожно — cloudfront/cloudflare в general) */
    const combined = [...zapret.lists.filter((l) => l.enabled && (l.id === 'general' || l.id === 'google'))]
    combined.forEach((list) => {
      list.lines.forEach((line) => {
        const rule = normalizeListLine(line)
        if (rule) rules.push({ ...rule, target: 'direct', comment: `Zapret list ${list.title}` })
      })
    })
    /* list-exclude — Zapret пропускает, мы их всё равно пускаем DIRECT, но ПОСЛЕ блокирующих правил.
       Mihomo порядок: вставляем сюда, а в конце правил маршрутизации будет VPN/MATCH. */
    zapret.lists.filter((l) => l.enabled && l.id === 'exclude').forEach((list) => {
      list.lines.forEach((line) => {
        const rule = normalizeListLine(line)
        if (rule) rules.push({ ...rule, target: 'direct', comment: `Zapret exclude ${list.title}` })
      })
    })
    /* ipset-exclude — приватные диапазоны, DIRECT. */
    zapret.lists.filter((l) => l.enabled && l.id === 'ipset-exclude').forEach((list) => {
      list.lines.forEach((line) => {
        const rule = normalizeListLine(line)
        if (rule && /^(geoip:|0\.0\.0\.0|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|fd[0-9a-f]{2}:|::1|fc00)/i.test(rule.value)) {
          rules.push({ ...rule, target: 'direct', comment: `ipset-exclude ${list.title}` })
        }
      })
    })
    /* Discord voice UDP через ту же политику (tunnel/VPN если Zapret включён, иначе DIRECT). */
    if (zapret.discordVoice && zapret.discordVoiceRanges.length) {
      zapret.discordVoiceRanges.forEach((range) => {
        rules.push({ type: 'ip-cidr', value: range, target: zapretEnabled ? 'direct' : 'vpn', comment: 'Discord voice UDP' })
      })
    }
  } else {
    /* Zapret OFF: все Zapret-списки → VPN (DIRECT только ipset-exclude). */
    zapret.lists.filter((l) => l.enabled && l.id === 'ipset-exclude').forEach((list) => {
      list.lines.forEach((line) => {
        const rule = normalizeListLine(line)
        if (rule && /^(geoip:|0\.0\.0\.0|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|fd[0-9a-f]{2}:|::1|fc00)/i.test(rule.value)) {
          rules.push({ ...rule, target: 'direct', comment: `ipset-exclude ${list.title}` })
        }
      })
    })
  }

  /* --- Routing preset --- */
  if (cfg.preset === 'vpn-first') {
    /* А) Всё через VPN, российские сервисы direkten. */
    add('geosite:category-ru', 'direct', 'popular RU services (MetaCubeX category-ru)')
    add('geoip:ru', 'direct', 'Russian IP space')
    if (cfg.ruDirect) {
      add('geosite:category-bank-ru', 'direct', 'Russian banks')
      add('geosite:category-gov-ru', 'direct', 'Russian government')
    }
    if (cfg.blockBitTorrent) {
      rules.push({ type: 'ip-cidr', value: 'geoip:bittorrent', target: 'direct', comment: 'BitTorrent direct' })
    }
    if (cfg.telegramViaVpn) {
      /* Telegram ports 5228-5230 FCM — через VPN (так как в России Telegram блокируется). */
      rules.push({ type: 'port', value: '5228-5230', target: 'vpn', comment: 'Telegram/FCM via VPN' })
      rules.push({ type: 'domain', value: 't.me', target: 'vpn', comment: 'Telegram via VPN' })
      rules.push({ type: 'domain', value: 'telegram.org', target: 'vpn', comment: 'Telegram via VPN' })
    }
    if (cfg.blockAds) {
      add('geosite:category-ads-all', 'direct', 'ads block')
    }
    if (cfg.blockMalware) {
      add('geosite:category-malware', 'direct', 'malware block')
    }
  } else {
    /* Б) Всё direkten, указанные домены через VPN. */
    cfg.allowDomains.forEach((d) => add(d, 'vpn', 'user allow-list'))
  }

  /* --- 3. Всё остальное по дефолту (vpn-first → vpn, direct-first → direct) --- */
  const fallback = cfg.preset === 'vpn-first' ? 'vpn' : 'direct'
  rules.push({ type: 'all', value: '', target: fallback, comment: cfg.preset === 'vpn-first' ? 'всё остальное — VPN' : 'всё остальное — DIRECT' })

  return rules
}

/** Превратить строку списка в правило. */
export function normalizeListLine(line: string): RoutingRule | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return null
  if (/^\d+\.\d+\.\d+\.\d+(\/\d+)?$/.test(trimmed)) {
    return { type: 'ip-cidr', value: trimmed, target: 'direct' }
  }
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}-\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) {
    return { type: 'ip-cidr', value: trimmed, target: 'direct' }
  }
  let exact = false
  let value = trimmed
  if (value.startsWith('^')) {
    exact = true
    value = value.slice(1)
  }
  if (/^geoip:/i.test(value) || /^domain:/i.test(value) || /^full:/i.test(value)) {
    return { type: 'domain', value, target: 'direct', comment: exact ? 'exact' : 'subdomains' }
  }
  return {
    type: 'domain',
    value: exact ? value : `+.${value}`,
    target: 'direct',
    comment: exact ? 'exact' : 'domain + subdomains',
  }
}

export interface RoutingWarnings {
  cloudfront: string[]
  throttledDoh: string[]
  unsupported: string[]
}

export function detectRoutingWarnings(zapret: ZapretState): RoutingWarnings {
  const cloudfront: string[] = []
  const throttledDoh: string[] = []
  const unsupported: string[] = []
  zapret.lists.forEach((list) => {
    if (!list.enabled) return
    list.lines.forEach((line) => {
      const l = line.toLowerCase()
      if (l.includes('cloudfront') || l.includes('cloudflare')) cloudfront.push(list.title)
      if (l.includes('dns.quad9.net') || l.includes('dns.google') || l.includes('cloudflare-dns.com'))
        throttledDoh.push(list.title)
    })
  })
  return { cloudfront: [...new Set(cloudfront)], throttledDoh: [...new Set(throttledDoh)], unsupported }
}
