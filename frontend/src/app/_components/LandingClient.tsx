import Link from 'next/link'
import Button from '@/components/ui/Button'

export default function LandingPage() {
  return (
    <div
      className="relative min-h-[100dvh] bg-[--background] overflow-hidden flex flex-col"
      style={{ fontFamily: 'var(--font-dm-sans)' }}
    >
      {/* Subtle grid lines — corporate misconfigured tool aesthetic */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage:
            'linear-gradient(rgba(39,39,42,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(39,39,42,0.5) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }}
      />

      {/* Top-left logo */}
      <div className="absolute top-5 left-4 sm:top-6 sm:left-8 z-10">
        <span className="font-mono text-[10px] sm:text-xs uppercase tracking-[0.1em] text-[--text-muted]">
          Ignoranza Artificiale™
        </span>
        <span className="ml-2 sm:ml-3 font-mono text-[9px] text-[--text-muted] opacity-50">
          v0.0.1-BETA
        </span>
      </div>

      {/* Status indicator top-right */}
      <div className="absolute top-5 right-4 sm:top-6 sm:right-8 z-10 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
        <span className="font-mono text-[9px] text-[--text-muted] uppercase tracking-[0.08em]">
          Sistema Operativo
        </span>
      </div>

      {/* Main content — deliberately off-center on desktop, centered on mobile */}
      <div className="relative z-10 flex flex-col flex-1 justify-center sm:justify-start px-6 sm:px-[8vw] pt-24 sm:pt-[32vh] pb-20 sm:pb-0">
        {/* Tagline */}
        <div className="mb-8 sm:mb-[6vh]">
          <p
            className="font-serif text-[--text-muted] font-normal text-lg sm:text-[clamp(1rem,2.5vw,1.5rem)] max-w-[600px] leading-snug"
          >
            Il sistema è operativo.
            <br />
            <span className="text-[--text-primary]">Ti dispiace?</span>
          </p>
        </div>

        {/* CTA */}
        <Link href="/chat">
          <Button variant="primary" size="lg">
            Accedi alla piattaforma
          </Button>
        </Link>

        {/* Satire disclaimer — hero */}
        <p className="mt-6 font-mono text-xs text-[--text-muted] max-w-sm leading-relaxed">
          ⚠ Questo sito è satira. Gli agenti sono personaggi fittizi a scopo comico.
          Nessun intento offensivo. Se ti sei offeso, il servizio ha funzionato correttamente.
        </p>
      </div>

      {/* Bottom status bar — uses padding-bottom safe area for iPhone home indicator */}
      <div className="relative z-10 mt-auto border-t border-[--border] px-4 sm:px-8 py-2 pb-safe flex items-center justify-between flex-wrap gap-y-1">
        <span className="font-mono text-[9px] text-[--text-muted] uppercase tracking-[0.06em] truncate">
          Ignoranza Artificiale™ — Tutti i diritti distorti
        </span>
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <Link
            href="/vergogna"
            className="font-mono text-[9px] text-[--text-muted] hover:text-[--text-primary] uppercase tracking-[0.06em] transition-colors"
          >
            Hall of Shame
          </Link>
          <Link
            href="/chat"
            className="font-mono text-[9px] text-[--text-muted] hover:text-[--text-primary] uppercase tracking-[0.06em] transition-colors"
          >
            Chat
          </Link>
        </div>
      </div>
    </div>
  )
}
