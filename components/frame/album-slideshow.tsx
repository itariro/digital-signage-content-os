'use client'

import type { CSSProperties } from 'react'
import type { Album, AlbumItem, Slideshow } from '@/lib/types'
import { FRAME_WIDTH } from '@/lib/types'
import { THEME_META, slideAt } from '@/lib/albums'
import { cn } from '@/lib/utils'

const JUSTIFY = { top: 'flex-start', center: 'center', bottom: 'flex-end' } as const

const ENTER_CLASS: Record<Slideshow['transition'], string> = {
  fade: 'slide-enter-fade',
  slide: 'slide-enter-slide',
  zoom: 'slide-enter-zoom',
  none: '',
}

function Backdrop({ item, show }: { item: AlbumItem; show: Slideshow }) {
  if (show.backdrop === 'solid') return <div className="absolute inset-0" style={{ background: show.backdropColor }} />
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: show.backdropColor }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.image}
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ transform: 'scale(1.35)', filter: 'blur(70px) saturate(1.35) brightness(0.62)' }}
      />
    </div>
  )
}

function ArtImage({ item, className, style }: { item: AlbumItem; className?: string; style?: CSSProperties }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.image} alt={item.title} draggable={false} className={cn('block h-full w-full object-cover', className)} style={style} />
  )
}

function PosterArt({ item, width, aspect }: { item: AlbumItem; width: number; aspect: number }) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        width,
        height: width / aspect,
        borderRadius: 10,
        boxShadow: '0 80px 140px -40px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.08)',
      }}
    >
      <ArtImage item={item} />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: 'linear-gradient(115deg, rgba(255,255,255,0.14) 0%, transparent 32%, transparent 70%, rgba(0,0,0,0.18) 100%)' }}
      />
    </div>
  )
}

function BookArt({ item, width }: { item: AlbumItem; width: number }) {
  const height = width * 1.5
  const pages = width * 0.035
  return (
    <div className="relative" style={{ width: width + pages, height, filter: 'drop-shadow(0 70px 60px rgba(0,0,0,0.6))' }}>
      <div
        aria-hidden
        className="absolute"
        style={{
          right: 0,
          top: height * 0.012,
          bottom: height * 0.012,
          width: pages * 2,
          borderRadius: '0 6px 6px 0',
          background: 'repeating-linear-gradient(90deg, #f2ede2 0 2px, #d9d2c3 2px 3px)',
        }}
      />
      <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width, borderRadius: '3px 8px 8px 3px' }}>
        <ArtImage item={item} />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(0,0,0,0.45) 0%, rgba(255,255,255,0.22) 1.6%, rgba(0,0,0,0.18) 3.4%, transparent 7%, transparent 92%, rgba(255,255,255,0.08) 100%)',
          }}
        />
      </div>
    </div>
  )
}

function VinylArt({ item, width, entering }: { item: AlbumItem; width: number; entering: boolean }) {
  const sleeve = width / 1.36
  return (
    <div className="relative" style={{ width, height: sleeve }}>
      <div
        aria-hidden
        className={cn('absolute top-0', entering && 'vinyl-slide-out')}
        style={
          { left: 0, width: sleeve, height: sleeve, '--vinyl-x': `${width - sleeve}px`, transform: 'translateX(var(--vinyl-x))' } as CSSProperties
        }
      >
        <div
          className="vinyl-spin relative h-full w-full rounded-full"
          style={{
            background:
              'radial-gradient(circle, transparent 0 1.6%, #0b0b0c 1.7% 33%, transparent 33.2%), repeating-radial-gradient(circle, #121214 0 3px, #1d1d20 3px 5px)',
            boxShadow: '0 50px 90px -30px rgba(0,0,0,0.9), inset 0 0 0 3px #050505',
          }}
        >
          <div className="absolute overflow-hidden rounded-full" style={{ inset: '33.5%' }}>
            <ArtImage item={item} />
          </div>
          <div className="absolute rounded-full" style={{ inset: '48.6%', background: '#0b0b0c' }} />
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: 'conic-gradient(from 30deg, transparent 0 12%, rgba(255,255,255,0.08) 18%, transparent 26% 62%, rgba(255,255,255,0.06) 68%, transparent 76%)' }}
          />
        </div>
      </div>
      <div
        className="relative overflow-hidden"
        style={{ width: sleeve, height: sleeve, borderRadius: 4, boxShadow: '0 70px 120px -40px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.06)' }}
      >
        <ArtImage item={item} />
        <div aria-hidden className="absolute inset-y-0 right-0 w-[3%]" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.35))' }} />
      </div>
    </div>
  )
}

function GalleryArt({ item, width, aspect }: { item: AlbumItem; width: number; aspect: number }) {
  const mat = width * 0.09
  return (
    <div
      style={{
        padding: mat,
        background: '#f3f1ec',
        border: `${Math.round(width * 0.022)}px solid #1b1a19`,
        boxShadow: '0 60px 110px -30px rgba(0,0,0,0.75), inset 0 0 0 1px rgba(0,0,0,0.08)',
      }}
    >
      <div style={{ width: width - mat * 2, height: (width - mat * 2) / aspect, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)' }}>
        <ArtImage item={item} />
      </div>
    </div>
  )
}

function SlideLayer({
  item,
  album,
  entering,
  className,
}: {
  item: AlbumItem
  album: Album
  entering: boolean
  className?: string
}) {
  const show = album.slideshow
  const kb = show.kenBurns ? (entering ? 'kb-run' : 'kb-end') : ''
  const kbStyle = { '--kb-duration': `${show.interval + 2}s` } as CSSProperties

  if (show.presentation === 'fill') {
    return (
      <div className={cn('absolute inset-0 overflow-hidden', className)}>
        <div className={cn('absolute inset-0', kb)} style={kbStyle}>
          <ArtImage item={item} />
        </div>
      </div>
    )
  }

  const width = (FRAME_WIDTH * show.artSize) / 100
  const meta = THEME_META[album.theme]
  const aspect = show.presentation === 'gallery' && album.theme === 'photos' ? 4 / 5 : meta.aspect === 1 ? 1 : 2 / 3

  return (
    <div className={cn('absolute inset-0 overflow-hidden', className)}>
      <Backdrop item={item} show={show} />
      <div
        className="absolute inset-0 flex flex-col items-center"
        style={{ justifyContent: JUSTIFY[show.artPosition], padding: '200px 0' }}
      >
        <div className={kb} style={kbStyle}>
          {show.presentation === 'poster' && <PosterArt item={item} width={width} aspect={aspect} />}
          {show.presentation === 'book' && <BookArt item={item} width={width / 1.035} />}
          {show.presentation === 'vinyl' && <VinylArt item={item} width={width} entering={entering} />}
          {show.presentation === 'gallery' && <GalleryArt item={item} width={width} aspect={aspect} />}
        </div>
      </div>
    </div>
  )
}

export function AlbumSlideshow({ album, time, offset = 0 }: { album: Album; time: number; offset?: number }) {
  const slide = slideAt(album, time, offset)
  if (!slide) return <div className="absolute inset-0" style={{ background: album.slideshow.backdropColor }} />
  const enter = ENTER_CLASS[album.slideshow.transition]
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {album.items.length > 1 && enter && <SlideLayer key={`prev-${slide.cycle}`} item={slide.previous} album={album} entering={false} />}
      <SlideLayer key={slide.cycle} item={slide.current} album={album} entering className={enter} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={slide.next.image} alt="" hidden />
    </div>
  )
}
