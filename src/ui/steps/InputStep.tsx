/** Шаг 1: Ввод — вставка, файл, 3 режима загрузки (paste/direct/proxy). */

import { useCallback } from 'preact/hooks'
import { h } from 'preact'
import { decodeSubscription } from '../../core/decode'
import type { Step } from '../App'

type Mode = 'paste' | 'direct' | 'proxy'

interface InputStepProps {
  t: (key: string) => string
  raw: string
  setRaw: (v: string) => void
  mode: Mode
  setMode: (v: Mode) => void
  fetchProxyUrl: string
  setFetchProxyUrl: (v: string) => void
  fetchErr: string
  setFetchErr: (v: string) => void
  loading: boolean
  setLoading: (v: boolean) => void
  decodeRaw: () => void
  result: ReturnType<typeof decodeSubscription> | null
  setResult: (v: ReturnType<typeof decodeSubscription> | null) => void
  setNodes: (v: any[]) => void
  setSelectedIds: (v: Set<string>) => void
  setStep: (v: Step) => void
}

export default function InputStep(props: InputStepProps) {
  const {
    t, raw, setRaw, mode, setMode, fetchProxyUrl, setFetchProxyUrl,
    fetchErr, setFetchErr, loading, setLoading, decodeRaw, result,
    setResult, setNodes, setSelectedIds, setStep,
  } = props

  const handlePaste = useCallback((e: ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData?.getData('text/plain') || ''
    setRaw(text)
    if (text.trim()) decodeRaw()
  }, [decodeRaw, setRaw])

  const handleFile = useCallback((e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = typeof ev.target?.result === 'string' ? ev.target.result : ''
      setRaw(text)
      decodeRaw()
    }
    reader.readAsText(file)
  }, [decodeRaw, setRaw])

  const fileInputRef: { current?: HTMLInputElement } = {}

  const loadUrl = useCallback(async () => {
    setFetchErr('')
    setLoading(true)
    let url = ''
    if (mode === 'direct') {
      url = raw
    } else if (mode === 'proxy') {
      const proxy = fetchProxyUrl.trim()
      if (!proxy) { setFetchErr(t('inputErrFetch') + ' не указан URL прокси'); setLoading(false); return }
      url = proxy + (proxy.includes('?') ? '&' : '?') + 'url=' + encodeURIComponent(raw)
    } else {
      setFetchErr(t('inputErrFetch') + ' выберите режим загрузки'); setLoading(false); return
    }
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      setRaw(text)
      const r = decodeSubscription(text)
      setResult(r)
      if (r.nodes.length) {
        setNodes(r.nodes)
        setSelectedIds(new Set(r.nodes.map((n) => n.id)))
        setStep('export')
      } else if (r.encrypted.length) {
        setStep('export')
      } else {
        setFetchErr(t('inputErrDecode') + ' узлы не найдены')
      }
    } catch (e) {
      setFetchErr(t('inputErrFetch') + ' ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLoading(false)
    }
  }, [raw, mode, fetchProxyUrl, t, setRaw, setResult, setNodes, setSelectedIds, setStep, setFetchErr, setLoading])

  const modeBtn = (m: Mode, label: string) =>
    h('button', {
      className: mode === m ? 'primary' : 'secondary',
      onClick: () => setMode(m),
    }, label)

  return h('section', { className: 'section' },
    h('div', { className: 'section-title' }, t('inputTitle')),

    h('div', { className: 'row' },
      h('label', { style: { width: '150px', flexShrink: 0 } }, t('inputModePaste')),
      modeBtn('paste', t('inputModePaste')),
      modeBtn('direct', t('inputModeDirect')),
      modeBtn('proxy', t('inputModeProxy')),
    ),

    mode === 'proxy' && h('div', { className: 'row', style: { marginTop: 8 } },
      h('label', { style: { width: '150px', flexShrink: 0 } }, t('inputFetchProxyLabel')),
      h('input', { value: fetchProxyUrl, onInput: (e) => setFetchProxyUrl((e.target as HTMLInputElement).value), placeholder: t('inputFetchProxyPlaceholder') }),
      h('span', { className: 'small', style: { color: 'var(--warn)' } }, t('inputWarningProxy')),
    ),

    h('textarea', {
      value: raw,
      onInput: (e: Event) => setRaw((e.target as HTMLInputElement).value),
      onPaste: handlePaste,
      rows: 14,
      placeholder: t('inputPlaceholder'),
      style: { marginTop: 10 },
    }),

    h('div', { className: 'btn-row', style: { marginTop: 10 } },
      h('input', { type: 'file', accept: '.txt,.yaml,.yml,.json,.sub', className: 'ghost', ref: (el) => { fileInputRef.current = el as HTMLInputElement }, onChange: handleFile, style: { display: 'none' } }),
      h('button', { className: 'secondary', onClick: () => fileInputRef.current?.click() }, t('inputFile')),
      mode === 'paste'
        ? h('button', { className: 'primary', onClick: decodeRaw }, t('inputBtnDecode'))
        : h('button', { className: 'primary', onClick: loadUrl, disabled: loading },
            loading ? h('span', { className: 'loader' }) : '', ' ', t('inputBtnFetch')),
    ),

    fetchErr && h('div', { className: 'alert bad' }, h('span', { className: 'dot' }, '⚠'), fetchErr),

    result && h('div', { className: 'section', style: { marginTop: 16 } },
      h('div', { className: 'row', style: { gap: 16, flexWrap: 'wrap' } },
        h('span', { className: 'tag' }, t('inputResultFormat') + ': ' + formatLabel(result.format)),
        h('span', { className: 'tag' }, t('inputResultNodes') + ': ' + result.nodes.length),
        result.encrypted.length && h('span', { className: 'tag warn' }, t('inputResultEncrypted') + ': ' + result.encrypted.length),
      ),
      result.issues.length && h('div', { className: 'alert warn', style: { marginTop: 10 } },
        h('span', { className: 'dot' }, '⚠'),
        result.issues.slice(0, 5).map((it) => `строка ${it.line}: ${it.message}`).join('; '),
        result.issues.length > 5 && ` … и ещё ${result.issues.length - 5}`,
      ),
      result.encrypted.length && h('div', { className: 'alert bad', style: { marginTop: 10 } },
        h('span', { className: 'dot' }, '🔒'), t('inputWarningEncrypted'),
      ),
      result.warnings.length && h('div', { className: 'alert warn', style: { marginTop: 10 } },
        ...result.warnings.map((w) => h('div', { key: w, style: { marginBottom: 4 } }, w)),
      ),
    ),

    mode === 'direct' && h('div', { className: 'alert warn', style: { marginTop: 12 } },
      h('span', { className: 'dot' }, '⚠'), t('inputWarningCors'),
    ),
  )
}

function formatLabel(f: string): string {
  const map: Record<string, string> = {
    links: 'Ссылки', base64: 'Base64', clash: 'Clash YAML', xray: 'Xray JSON',
    singbox: 'sing-box JSON', 'happ-encrypted': 'Happ crypto', empty: 'Пусто', unknown: 'Неизвестно',
  }
  return map[f] || f
}
