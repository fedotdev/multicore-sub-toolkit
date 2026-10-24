import { useState, useCallback, useMemo } from 'preact/hooks'
import { h } from 'preact'
import { useI18n, DEFAULT_LANG, type Lang } from './i18n'
import { loadTheme, toggleTheme, type Theme } from './theme'
import './index.css'
import { decodeSubscription } from '../core/decode'
import { buildHappJson } from '../core/serialize/happ'
import { buildMihomoConfig } from '../core/serialize/mihomo'
import { buildV2rayngNodeConfig, buildV2rayngAllInOne } from '../core/serialize/v2rayng'
import { defaultDnsConfig, defaultRouting, DEFAULT_EXPORT, type ExportOptions, type ProxyNode } from '../core/model'
import { defaultLists } from '../core/lists'
import type { ZapretState } from '../core/model'
import InputStep from './steps/InputStep'
import NodesStep from './steps/NodesStep'
import DnsStep from './steps/DnsStep'
import RoutingStep from './steps/RoutingStep'
import ExportStep from './steps/ExportStep'

export type Step = 'input' | 'export'

function App() {
  const [lang, setLang] = useState<Lang>(DEFAULT_LANG)
  const t = useI18n(lang)
  const [theme, setTheme] = useState<Theme>(() => loadTheme())
  const [step, setStep] = useState<Step>('input')

  const [raw, setRaw] = useState('')
  const [result, setResult] = useState<ReturnType<typeof decodeSubscription> | null>(null)
  const [fetchErr, setFetchErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetchProxyUrl, setFetchProxyUrl] = useState('')
  const [mode, setMode] = useState<'paste' | 'direct' | 'proxy'>('paste')

  const [nodes, setNodes] = useState<ProxyNode[]>([])
  const [nodeSearch, setNodeSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [redact, setRedact] = useState(false)

  const [dnsConfig, setDnsConfig] = useState(defaultDnsConfig())
  const [routingConfig, setRoutingConfig] = useState(defaultRouting())
  const [zapretState, setZapretState] = useState<ZapretState>({
    mode: 'on',
    lists: defaultLists(),
    discordVoice: true,
    discordVoiceRanges: ['19294-19344', '50000-50100'],
    warnCloudfront: true,
  })
  const [exportOptions, setExportOptions] = useState<ExportOptions>({ ...DEFAULT_EXPORT })

  const [exportTarget, setExportTarget] = useState<'happ' | 'mihomo' | 'v2rayng'>('mihomo')
  const [exportOutput, setExportOutput] = useState<string>('')
  const [exportValid, setExportValid] = useState<{ ok: boolean; msg: string }>({ ok: false, msg: '' })

  const decodeRaw = useCallback(() => {
    setFetchErr('')
    const r = decodeSubscription(raw)
    setResult(r)
    if (r.nodes.length) {
      setNodes(r.nodes)
      setSelectedIds(new Set(r.nodes.map((n) => n.id)))
      setStep('export')
    } else if (r.encrypted.length) {
      setStep('export')
    }
  }, [raw])

  const filteredNodes = useMemo(() => {
    const q = nodeSearch.toLowerCase()
    return nodes.filter((n) => n.name.toLowerCase().includes(q) || n.server.toLowerCase().includes(q))
  }, [nodes, nodeSearch])

  const selectedNodes = nodes.filter((n) => selectedIds.has(n.id))

  const generateExport = useCallback(() => {
    const opts = { ...exportOptions, redact }
    let out = ''
    let ok = false
    let msg = ''
    try {
      if (exportTarget === 'happ') {
        const arr = buildHappJson(selectedNodes, { socksPort: opts.socksPort, httpPort: opts.httpPort, redact: opts.redact })
        out = JSON.stringify(arr, null, 2)
      } else if (exportTarget === 'mihomo') {
        const cfg = buildMihomoConfig(selectedNodes, { redact: opts.redact, supportMlkem: opts.supportMlkem, zapretGroup: opts.zapretGroup }, { mode: zapretState.mode, lists: zapretState.lists })
        out = JSON.stringify(cfg, null, 2)
      } else {
        const perNode = selectedNodes.map((n) => buildV2rayngNodeConfig(n, opts.socksPort))
        const all = buildV2rayngAllInOne(selectedNodes, { balancers: opts.balancers, pinSelector: opts.pinSelector, redact: opts.redact })
        out = JSON.stringify({ perNode, allInOne: all }, null, 2)
      }
      JSON.parse(out)
      ok = true
      msg = t('exportValid')
    } catch (e) {
      ok = false
      msg = t('exportInvalid') + ' ' + (e instanceof Error ? e.message : String(e))
    }
    setExportOutput(out)
    setExportValid({ ok, msg })
  }, [selectedNodes, exportTarget, exportOptions, redact, zapretState.mode, zapretState.lists, t])

  const tabActive = (key: Step) => step === key

  return (
    <div className="app">
      <header className="header" style={{ position: 'sticky', top: 0, zIndex: 50, background: 'var(--surface)', padding: '4px 20px', borderBottom: '1px solid var(--border)' }}>
        <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="./logo_text_1.svg" alt="Sub Toolkit" style={{ height: '80px' }} />
        </div>
        <div className="actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <select value={lang} onChange={(e) => setLang(e.currentTarget.value as Lang)} className="ghost" style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}>
            <option value="ru">RU</option>
            <option value="en">EN</option>
          </select>
          <button className="ghost" onClick={() => setTheme(toggleTheme(theme))}>{theme === 'dark' ? t('themeLight') : t('themeDark')}</button>
        </div>
      </header>

      <div className="tab-bar" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className={tabActive('input') ? 'primary' : 'secondary'} onClick={() => setStep('input')}>
          {t('tabInput')}
        </button>
        <button className={tabActive('export') ? 'primary' : 'secondary'} onClick={() => setStep('export')}>
          {t('tabExport')}
        </button>
      </div>

      <main className="main">
        <div className="panel" style={{ padding: '20px' }}>
          {step === 'input' && <InputStep t={t} raw={raw} setRaw={setRaw} mode={mode} setMode={setMode} fetchProxyUrl={fetchProxyUrl} setFetchProxyUrl={setFetchProxyUrl} fetchErr={fetchErr} setFetchErr={setFetchErr} loading={loading} setLoading={setLoading} decodeRaw={decodeRaw} result={result} setResult={setResult} setNodes={setNodes} setSelectedIds={setSelectedIds} setStep={setStep} />}
          {step === 'export' && (
            <>
              <NodesStep t={t} nodes={filteredNodes} nodeSearch={nodeSearch} setNodeSearch={setNodeSearch} selectedIds={selectedIds} setSelectedIds={setSelectedIds} />
              <DnsStep t={t} dnsConfig={dnsConfig} setDnsConfig={setDnsConfig} />
              <RoutingStep t={t} routingConfig={routingConfig} setRoutingConfig={setRoutingConfig} zapretState={zapretState} setZapretState={setZapretState} />
              <ExportStep t={t} selectedNodes={selectedNodes} exportTarget={exportTarget} setExportTarget={setExportTarget} exportOptions={exportOptions} setExportOptions={setExportOptions} redact={redact} setRedact={setRedact} zapretState={zapretState} generateExport={generateExport} exportOutput={exportOutput} exportValid={exportValid} setExportOutput={setExportOutput} setExportValid={setExportValid} />
            </>
          )}
        </div>
      </main>

      <footer className="footer" style={{ marginTop: 'auto', padding: '16px 20px', textAlign: 'center' }}>
        <p>Sub Toolkit — статический клиентский инструмент. Весь вывод формируется в браузере; секреты не уходят с вашего устройства. <a href="/docs/cors.html" target="_blank" rel="noopener">Режимы загрузки и CORS</a> · <a href="https://github.com" target="_blank" rel="noopener">GitHub</a></p>
      </footer>
    </div>
  )
}

export default App