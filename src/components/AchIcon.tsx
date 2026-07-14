import { useState } from "react";

/** Achievement icon from Steam's CDN, with a neutral placeholder fallback. */
export function AchIcon({ src, locked, size = 30 }: { src: string | null; locked?: boolean; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (!src || failed) {
    return <span className={`achicon achicon--ph${locked ? " achicon--locked" : ""}`} style={style} aria-hidden="true" />;
  }
  return (
    <img
      className={`achicon${locked ? " achicon--locked" : ""}`}
      style={style}
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
