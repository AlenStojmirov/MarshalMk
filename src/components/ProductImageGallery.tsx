'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Image from 'next/image';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight, X, ZoomIn } from 'lucide-react';

interface ProductImageGalleryProps {
  images: string[];
  alt: string;
  featured?: boolean;
  featuredLabel?: string;
  noImageLabel?: string;
  onSale?: boolean;
  saleLabel?: string;
  percentOff?: number;
}

export default function ProductImageGallery({
  images,
  alt,
  featured,
  featuredLabel = 'Featured',
  noImageLabel = 'No image',
  onSale = false,
  saleLabel = 'Sale',
  percentOff = 0,
}: ProductImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Magnifier state
  const [showMagnifier, setShowMagnifier] = useState(false);
  const [magnifierPos, setMagnifierPos] = useState({ x: 0, y: 0 });
  const [magnifierBg, setMagnifierBg] = useState({ x: '0%', y: '0%' });
  const mainImageRef = useRef<HTMLDivElement>(null);

  // Embla carousel for main images
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, startIndex: 0 });

  // Embla carousel for lightbox
  const [lightboxEmblaRef, lightboxEmblaApi] = useEmblaCarousel({
    loop: true,
    startIndex: selectedIndex,
  });

  const scrollTo = useCallback(
    (index: number) => {
      emblaApi?.scrollTo(index);
      setSelectedIndex(index);
    },
    [emblaApi]
  );

  // Sync selectedIndex with carousel scroll
  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  // Sync lightbox carousel when opened
  useEffect(() => {
    if (lightboxOpen && lightboxEmblaApi) {
      lightboxEmblaApi.scrollTo(selectedIndex, true);
    }
  }, [lightboxOpen, lightboxEmblaApi, selectedIndex]);

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      if (e.key === 'ArrowLeft') lightboxEmblaApi?.scrollPrev();
      if (e.key === 'ArrowRight') lightboxEmblaApi?.scrollNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxOpen, lightboxEmblaApi]);

  // Magnifier handler
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = mainImageRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const pctX = (x / rect.width) * 100;
      const pctY = (y / rect.height) * 100;
      setMagnifierPos({ x, y });
      setMagnifierBg({ x: `${pctX}%`, y: `${pctY}%` });
    },
    []
  );

  if (images.length === 0) {
    return (
      <div className="relative aspect-[3/4] bg-stone-50 flex items-center justify-center text-stone-300 text-sm">
        {noImageLabel}
      </div>
    );
  }

  const currentImage = images[selectedIndex];

  return (
    <div>
      {/* Main Carousel */}
      <div className="relative group">
        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex">
            {images.map((img, index) => (
              <div
                key={index}
                className="relative aspect-[3/4] bg-stone-50 flex-[0_0_100%] min-w-0"
              >
                {/* Magnifier wrapper - only active on the selected slide */}
                <div
                  ref={index === selectedIndex ? mainImageRef : undefined}
                  className="relative w-full h-full cursor-crosshair"
                  onMouseEnter={() => {
                    if (index === selectedIndex) setShowMagnifier(true);
                  }}
                  onMouseLeave={() => setShowMagnifier(false)}
                  onMouseMove={index === selectedIndex ? handleMouseMove : undefined}
                >
                  <Image
                    src={img}
                    alt={`${alt} - Image ${index + 1} of ${images.length}`}
                    fill
                    className="object-cover pointer-events-none"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    priority={index === 0}
                    placeholder="blur"
                    blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTdlNWUwIi8+PC9zdmc+"
                  />

                  {/* Magnifying glass lens */}
                  {showMagnifier && index === selectedIndex && (
                    <div
                      className="hidden lg:block absolute pointer-events-none rounded-full border-2 border-white/80 shadow-lg z-20"
                      style={{
                        width: 180,
                        height: 180,
                        left: magnifierPos.x - 90,
                        top: magnifierPos.y - 90,
                        backgroundImage: `url(${currentImage})`,
                        backgroundSize: '400% 400%',
                        backgroundPosition: `${magnifierBg.x} ${magnifierBg.y}`,
                        backgroundRepeat: 'no-repeat',
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Featured badge */}
        {featured && !onSale && (
          <span className="absolute top-5 left-5 bg-stone-900 text-white text-[10px] uppercase tracking-[0.15em] px-3 py-1.5 z-10">
            {featuredLabel}
          </span>
        )}

        {/* Sale badges */}
        {onSale && (
          <div className="absolute top-5 left-5 z-10 flex flex-col gap-2 items-start">
            <span className="bg-red-600 text-white text-[11px] font-bold uppercase tracking-[0.2em] px-3 py-1.5 shadow-md ring-1 ring-red-700/30 animate-[pulse_2.5s_ease-in-out_infinite]">
              {saleLabel}
            </span>
            {percentOff > 0 && (
              <span className="bg-stone-900 text-white text-[12px] font-semibold px-2.5 py-1 shadow-sm">
                -{percentOff}%
              </span>
            )}
          </div>
        )}

        {/* Fullscreen button */}
        <button
          onClick={() => setLightboxOpen(true)}
          className="absolute top-5 right-5 w-9 h-9 bg-white/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 hover:bg-white"
          aria-label="View fullscreen"
        >
          <ZoomIn className="h-4 w-4 text-stone-700" />
        </button>

        {/* Prev / Next arrows */}
        {images.length > 1 && (
          <>
            <button
              onClick={() => emblaApi?.scrollPrev()}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 hover:bg-white"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-5 w-5 text-stone-700" />
            </button>
            <button
              onClick={() => emblaApi?.scrollNext()}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 hover:bg-white"
              aria-label="Next image"
            >
              <ChevronRight className="h-5 w-5 text-stone-700" />
            </button>
          </>
        )}

        {/* Image counter (mobile) */}
        {images.length > 1 && (
          <div className="absolute bottom-4 right-4 bg-black/50 text-white text-xs px-2.5 py-1 rounded-full lg:hidden z-10">
            {selectedIndex + 1} / {images.length}
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
          {images.map((img, index) => (
            <button
              key={index}
              onClick={() => scrollTo(index)}
              aria-label={`View image ${index + 1}`}
              className={`relative w-16 h-20 sm:w-20 sm:h-24 flex-shrink-0 overflow-hidden transition-all duration-200 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-1 ${
                selectedIndex === index
                  ? 'ring-1 ring-stone-900 ring-offset-2'
                  : 'opacity-60 hover:opacity-100 hover:ring-1 hover:ring-stone-300 hover:ring-offset-1'
              }`}
            >
              <Image
                src={img}
                alt={`${alt} - Thumbnail ${index + 1}`}
                fill
                className="object-cover"
                sizes="80px"
              />
            </button>
          ))}
        </div>
      )}

      {/* ─── Fullscreen Lightbox ─── */}
      {lightboxOpen && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          {/* Lightbox header */}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-white/60 text-sm">
              {selectedIndex + 1} / {images.length}
            </span>
            <button
              onClick={() => setLightboxOpen(false)}
              className="w-10 h-10 flex items-center justify-center text-white/80 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Lightbox carousel */}
          <div className="flex-1 relative flex items-center">
            <div className="w-full h-full overflow-hidden" ref={lightboxEmblaRef}>
              <div className="flex h-full">
                {images.map((img, index) => (
                  <div
                    key={index}
                    className="relative flex-[0_0_100%] min-w-0 flex items-center justify-center p-4"
                  >
                    <div className="relative w-full h-full max-w-4xl mx-auto">
                      <Image
                        src={img}
                        alt={`${alt} - ${index + 1}`}
                        fill
                        className="object-contain"
                        sizes="100vw"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Lightbox arrows */}
            {images.length > 1 && (
              <>
                <button
                  onClick={() => lightboxEmblaApi?.scrollPrev()}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors z-10"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-6 w-6 text-white" />
                </button>
                <button
                  onClick={() => lightboxEmblaApi?.scrollNext()}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors z-10"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-6 w-6 text-white" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
