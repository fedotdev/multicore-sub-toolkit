/** Маскирование секретов в выводах. never: UUID, public key, short id, passwords, obfs-password. */

import type { ProxyNode } from './model'

const SECRET_KEYS = ['uuid', 'pbk', 'sid', 'password', 'auth', 'obfsPassword', 'obfs-password', 'spx']

export interface RedactOptions {
  uuid: boolean
  pbk: boolean
  sid: boolean
  passwords: boolean
}

export const DEFAULT_REDACT: RedactOptions = { uuid: true, pbk: true, sid: true, passwords: true }

const MASK = '***'

function mask(value: string | undefined): string | undefined {
  if (!value) return value
  return value.length <= 4 ? MASK : `${value.slice(0, 2)}${MASK}${value.slice(-2)}`
}

export function redactNode(node: ProxyNode, opts: RedactOptions): ProxyNode {
  const out = { ...node }
  if (opts.uuid && out.uuid) out.uuid = mask(out.uuid)
  if (opts.pbk && out.pbk) out.pbk = mask(out.pbk)
  if (opts.sid && out.sid) out.sid = mask(out.sid)
  if (opts.passwords) {
    if (out.password) out.password = mask(out.password)
    if (out.auth) out.auth = mask(out.auth)
    if (out.obfsPassword) out.obfsPassword = mask(out.obfsPassword)
    if (out.obfs && out.obfsPassword) {
      // obfs с паролем — маскируем сам пароль уже выше
    }
  }
  if (out.extra) {
    out.extra = { ...out.extra }
    if (out.extra.xmux) out.extra.xmux = { ...out.extra.xmux }
  }
  if (out.unmapped) {
    out.unmapped = { ...out.unmapped }
    for (const key of Object.keys(out.unmapped)) {
      const lk = key.toLowerCase()
      if (SECRET_KEYS.includes(lk) || /password|key|secret|token/i.test(lk)) {
        out.unmapped[key] = mask(out.unmapped[key]) ?? out.unmapped[key]
      }
    }
  }
  out.warnings = out.warnings ? [...out.warnings] : undefined
  return out
}

export function redactText(text: string, redact: boolean): string {
  if (!redact) return text
  // Маскируем все вхождения пусть-в-идентификаторах UUID и общих секретов в сыром тексте.
  return text
    .replace(
      /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
      MASK,
    )
    .replace(/pbk=[^&]*/g, 'pbk=***')
    .replace(/sid=[^&]*/g, 'sid=***')
    .replace(/password=[^&]*/gi, 'password=***')
    .replace(/obfs-password=[^&]*/gi, 'obfs-password=***')
    .replace(/auth=[^&]*/gi, 'auth=***')
}
