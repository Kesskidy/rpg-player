interface PixelIconProps {
  className?: string;
  size?: number;
}

function PixelSvg({
  size = 16,
  className = '',
  children,
}: PixelIconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      className={`pixel-icon inline-block shrink-0 ${className}`}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Golden / Dragon-Red Game Master Crown Emblem */
export function PixelCrownIcon({ size = 16, className }: PixelIconProps) {
  return (
    <PixelSvg size={size} className={className}>
      {/* Crown outline */}
      <rect x="2" y="12" width="12" height="2" fill="#8A6118" />
      <rect x="1" y="5" width="2" height="7" fill="#DFA842" />
      <rect x="4" y="7" width="2" height="5" fill="#DFA842" />
      <rect x="7" y="4" width="2" height="8" fill="#DFA842" />
      <rect x="10" y="7" width="2" height="5" fill="#DFA842" />
      <rect x="13" y="5" width="2" height="7" fill="#DFA842" />
      <rect x="2" y="9" width="12" height="3" fill="#DFA842" />
      {/* Highlights */}
      <rect x="1" y="4" width="2" height="1" fill="#FAE09E" />
      <rect x="7" y="3" width="2" height="1" fill="#FAE09E" />
      <rect x="13" y="4" width="2" height="1" fill="#FAE09E" />
      {/* Dragon Ruby Gems */}
      <rect x="7" y="9" width="2" height="2" fill="#C83232" />
      <rect x="3" y="10" width="1" height="1" fill="#C83232" />
      <rect x="12" y="10" width="1" height="1" fill="#C83232" />
    </PixelSvg>
  );
}

/** Pixel Art Brush / Pencil */
export function PixelBrushIcon({ size = 16, className }: PixelIconProps) {
  return (
    <PixelSvg size={size} className={className}>
      <rect x="11" y="2" width="3" height="3" fill="#DFA842" />
      <rect x="9" y="4" width="3" height="3" fill="#C83232" />
      <rect x="7" y="6" width="3" height="3" fill="#EFE6D5" />
      <rect x="5" y="8" width="3" height="3" fill="#EFE6D5" />
      <rect x="3" y="10" width="3" height="3" fill="#A69B8D" />
      <rect x="2" y="12" width="2" height="2" fill="#3C78B5" />
    </PixelSvg>
  );
}

/** Pixel Art Eraser */
export function PixelEraserIcon({ size = 16, className }: PixelIconProps) {
  return (
    <PixelSvg size={size} className={className}>
      <rect x="4" y="4" width="9" height="8" fill="#E04343" />
      <rect x="4" y="9" width="9" height="3" fill="#EFE6D5" />
      <rect x="3" y="5" width="1" height="6" fill="#0B090E" />
      <rect x="13" y="5" width="1" height="6" fill="#0B090E" />
      <rect x="4" y="3" width="9" height="1" fill="#0B090E" />
      <rect x="4" y="12" width="9" height="1" fill="#0B090E" />
    </PixelSvg>
  );
}

/** Pixel Art Film Reel / Animation Studio */
export function PixelFilmIcon({ size = 16, className }: PixelIconProps) {
  return (
    <PixelSvg size={size} className={className}>
      <rect x="2" y="3" width="12" height="10" fill="currentColor" />
      <rect x="5" y="5" width="6" height="6" fill="#1E1A24" />
      <rect x="3" y="4" width="1" height="2" fill="#1E1A24" />
      <rect x="3" y="7" width="1" height="2" fill="#1E1A24" />
      <rect x="3" y="10" width="1" height="2" fill="#1E1A24" />
      <rect x="12" y="4" width="1" height="2" fill="#1E1A24" />
      <rect x="12" y="7" width="1" height="2" fill="#1E1A24" />
      <rect x="12" y="10" width="1" height="2" fill="#1E1A24" />
      <rect x="7" y="6" width="1" height="4" fill="#DFA842" />
      <rect x="8" y="7" width="2" height="2" fill="#DFA842" />
    </PixelSvg>
  );
}

/** Pixel Art Crossed Sword / RPG Engine & Combat */
export function PixelSwordIcon({ size = 16, className }: PixelIconProps) {
  return (
    <PixelSvg size={size} className={className}>
      <rect x="12" y="2" width="2" height="2" fill="#EFE6D5" />
      <rect x="10" y="4" width="2" height="2" fill="#EFE6D5" />
      <rect x="8" y="6" width="2" height="2" fill="#C8BCAA" />
      <rect x="6" y="8" width="2" height="2" fill="#C8BCAA" />
      <rect x="3" y="7" width="2" height="2" fill="#DFA842" />
      <rect x="5" y="9" width="2" height="2" fill="#DFA842" />
      <rect x="7" y="11" width="2" height="2" fill="#DFA842" />
      <rect x="3" y="11" width="2" height="2" fill="#C83232" />
      <rect x="2" y="12" width="2" height="2" fill="#8A6118" />
    </PixelSvg>
  );
}

/** Pixel Art Shield / Defense & Hero */
export function PixelShieldIcon({ size = 16, className }: PixelIconProps) {
  return (
    <PixelSvg size={size} className={className}>
      <rect x="3" y="2" width="10" height="2" fill="#DFA842" />
      <rect x="2" y="4" width="12" height="5" fill="#3C78B5" />
      <rect x="3" y="9" width="10" height="2" fill="#3C78B5" />
      <rect x="5" y="11" width="6" height="2" fill="#2E5E8F" />
      <rect x="7" y="13" width="2" height="1" fill="#DFA842" />
      <rect x="7" y="4" width="2" height="7" fill="#DFA842" />
      <rect x="4" y="6" width="8" height="2" fill="#DFA842" />
    </PixelSvg>
  );
}

/** Pixel Art D20 / VTT Tabletop */
export function PixelDiceIcon({ size = 16, className }: PixelIconProps) {
  return (
    <PixelSvg size={size} className={className}>
      <rect x="6" y="1" width="4" height="2" fill="#DFA842" />
      <rect x="3" y="3" width="10" height="2" fill="#3C78B5" />
      <rect x="2" y="5" width="12" height="6" fill="#3C78B5" />
      <rect x="3" y="11" width="10" height="2" fill="#2E5E8F" />
      <rect x="6" y="13" width="4" height="2" fill="#DFA842" />
      {/* "20" pips */}
      <rect x="5" y="6" width="2" height="1" fill="#EFE6D5" />
      <rect x="6" y="7" width="1" height="1" fill="#EFE6D5" />
      <rect x="5" y="8" width="2" height="2" fill="#EFE6D5" />
      <rect x="9" y="6" width="2" height="4" fill="#EFE6D5" />
      <rect x="10" y="7" width="1" height="2" fill="#3C78B5" />
    </PixelSvg>
  );
}

/** Pixel Art Play Triangle */
export function PixelPlayIcon({ size = 16, className }: PixelIconProps) {
  return (
    <PixelSvg size={size} className={className}>
      <rect x="4" y="2" width="2" height="12" fill="currentColor" />
      <rect x="6" y="3" width="2" height="10" fill="currentColor" />
      <rect x="8" y="4" width="2" height="8" fill="currentColor" />
      <rect x="10" y="6" width="2" height="4" fill="currentColor" />
      <rect x="12" y="7" width="1" height="2" fill="currentColor" />
    </PixelSvg>
  );
}

/** Pixel Art Pause Bars */
export function PixelPauseIcon({ size = 16, className }: PixelIconProps) {
  return (
    <PixelSvg size={size} className={className}>
      <rect x="3" y="2" width="4" height="12" fill="currentColor" />
      <rect x="9" y="2" width="4" height="12" fill="currentColor" />
    </PixelSvg>
  );
}

/** Pixel Art Save Floppy / Rune Stone */
export function PixelSaveIcon({ size = 16, className }: PixelIconProps) {
  return (
    <PixelSvg size={size} className={className}>
      <rect x="2" y="2" width="11" height="12" fill="currentColor" />
      <rect x="13" y="4" width="1" height="10" fill="currentColor" />
      <rect x="4" y="2" width="6" height="4" fill="#1E1A24" />
      <rect x="8" y="3" width="1" height="2" fill="#DFA842" />
      <rect x="4" y="8" width="8" height="5" fill="#1E1A24" />
      <rect x="5" y="10" width="6" height="1" fill="#EFE6D5" />
    </PixelSvg>
  );
}

/** Pixel Art Download Arrow */
export function PixelDownloadIcon({ size = 16, className }: PixelIconProps) {
  return (
    <PixelSvg size={size} className={className}>
      <rect x="7" y="2" width="2" height="7" fill="currentColor" />
      <rect x="4" y="7" width="8" height="2" fill="currentColor" />
      <rect x="6" y="9" width="4" height="2" fill="currentColor" />
      <rect x="2" y="12" width="12" height="2" fill="currentColor" />
    </PixelSvg>
  );
}

/** Pixel Art Grimoire / Character Sheet */
export function PixelBookIcon({ size = 16, className }: PixelIconProps) {
  return (
    <PixelSvg size={size} className={className}>
      <rect x="2" y="2" width="12" height="12" fill="#7A1A1A" />
      <rect x="3" y="2" width="2" height="12" fill="#DFA842" />
      <rect x="6" y="4" width="6" height="2" fill="#EFE6D5" />
      <rect x="6" y="7" width="5" height="1" fill="#A69B8D" />
      <rect x="6" y="9" width="6" height="1" fill="#A69B8D" />
      <rect x="2" y="13" width="12" height="1" fill="#DFA842" />
    </PixelSvg>
  );
}

/** Pixel Art Folder / Project */
export function PixelFolderIcon({ size = 16, className }: PixelIconProps) {
  return (
    <PixelSvg size={size} className={className}>
      <rect x="2" y="3" width="5" height="2" fill="#DFA842" />
      <rect x="2" y="5" width="12" height="8" fill="#BD892A" />
      <rect x="3" y="6" width="10" height="6" fill="#DFA842" />
    </PixelSvg>
  );
}

/** Pixel Art Potion Vial */
export function PixelPotionIcon({ size = 16, className }: PixelIconProps) {
  return (
    <PixelSvg size={size} className={className}>
      <rect x="6" y="2" width="4" height="2" fill="#DFA842" />
      <rect x="6" y="4" width="4" height="2" fill="#EFE6D5" />
      <rect x="4" y="6" width="8" height="2" fill="#3D9956" />
      <rect x="3" y="8" width="10" height="5" fill="#3D9956" />
      <rect x="5" y="13" width="6" height="1" fill="#215E33" />
      <rect x="5" y="8" width="2" height="2" fill="#A7DFB6" />
    </PixelSvg>
  );
}

/** Pixel Art Grid */
export function PixelGridIcon({ size = 16, className }: PixelIconProps) {
  return (
    <PixelSvg size={size} className={className}>
      <rect x="2" y="2" width="12" height="1" fill="currentColor" />
      <rect x="2" y="6" width="12" height="1" fill="currentColor" />
      <rect x="2" y="10" width="12" height="1" fill="currentColor" />
      <rect x="2" y="13" width="12" height="1" fill="currentColor" />
      <rect x="2" y="2" width="1" height="12" fill="currentColor" />
      <rect x="6" y="2" width="1" height="12" fill="currentColor" />
      <rect x="10" y="2" width="1" height="12" fill="currentColor" />
      <rect x="13" y="2" width="1" height="12" fill="currentColor" />
    </PixelSvg>
  );
}

/** Pixel Art Undo / Redo Arrows */
export function PixelUndoIcon({ size = 16, className }: PixelIconProps) {
  return (
    <PixelSvg size={size} className={className}>
      <rect x="5" y="4" width="2" height="2" fill="currentColor" />
      <rect x="3" y="6" width="9" height="2" fill="currentColor" />
      <rect x="5" y="8" width="2" height="2" fill="currentColor" />
      <rect x="11" y="8" width="2" height="4" fill="currentColor" />
    </PixelSvg>
  );
}

export function PixelRedoIcon({ size = 16, className }: PixelIconProps) {
  return (
    <PixelSvg size={size} className={className}>
      <rect x="9" y="4" width="2" height="2" fill="currentColor" />
      <rect x="4" y="6" width="9" height="2" fill="currentColor" />
      <rect x="9" y="8" width="2" height="2" fill="currentColor" />
      <rect x="3" y="8" width="2" height="4" fill="currentColor" />
    </PixelSvg>
  );
}

/** Pixel Art Spark / Magic Star */
export function PixelSparkIcon({ size = 16, className }: PixelIconProps) {
  return (
    <PixelSvg size={size} className={className}>
      <rect x="7" y="1" width="2" height="14" fill="#DFA842" />
      <rect x="1" y="7" width="14" height="2" fill="#DFA842" />
      <rect x="5" y="5" width="6" height="6" fill="#FAE09E" />
      <rect x="7" y="7" width="2" height="2" fill="#EFE6D5" />
    </PixelSvg>
  );
}

/** Pixel Art Rectangle / Square Shape */
export function PixelRectIcon({ size = 16, className }: PixelIconProps) {
  return (
    <PixelSvg size={size} className={className}>
      <rect x="2" y="3" width="12" height="2" fill="currentColor" />
      <rect x="2" y="11" width="12" height="2" fill="currentColor" />
      <rect x="2" y="3" width="2" height="10" fill="currentColor" />
      <rect x="12" y="3" width="2" height="10" fill="currentColor" />
    </PixelSvg>
  );
}

/** Pixel Art Circle / Ellipse Shape */
export function PixelCircleIcon({ size = 16, className }: PixelIconProps) {
  return (
    <PixelSvg size={size} className={className}>
      <rect x="5" y="2" width="6" height="2" fill="currentColor" />
      <rect x="5" y="12" width="6" height="2" fill="currentColor" />
      <rect x="2" y="5" width="2" height="6" fill="currentColor" />
      <rect x="12" y="5" width="2" height="6" fill="currentColor" />
      <rect x="3" y="3" width="2" height="2" fill="currentColor" />
      <rect x="11" y="3" width="2" height="2" fill="currentColor" />
      <rect x="3" y="11" width="2" height="2" fill="currentColor" />
      <rect x="11" y="11" width="2" height="2" fill="currentColor" />
    </PixelSvg>
  );
}

/** Pixel Art Diagonal Line Shape */
export function PixelLineIcon({ size = 16, className }: PixelIconProps) {
  return (
    <PixelSvg size={size} className={className}>
      <rect x="2" y="12" width="2" height="2" fill="currentColor" />
      <rect x="4" y="10" width="2" height="2" fill="currentColor" />
      <rect x="6" y="8" width="2" height="2" fill="currentColor" />
      <rect x="8" y="6" width="2" height="2" fill="currentColor" />
      <rect x="10" y="4" width="2" height="2" fill="currentColor" />
      <rect x="12" y="2" width="2" height="2" fill="currentColor" />
    </PixelSvg>
  );
}
