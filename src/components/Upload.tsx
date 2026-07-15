import { useCallback, useRef, useState } from "react";
import type { SteamData } from "../types";
import { isSteamData } from "../lib/steam";

interface Props {
  onLoad: (data: SteamData) => void;
  /** Compact strip for repeat visitors ("already ran the collector?") vs. the full hero dropzone. */
  compact?: boolean;
}

export function Upload({ onLoad, compact = false }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      if (!file.name.endsWith(".json")) {
        setError(`That's a .${file.name.split(".").pop()} file — you need steam_data.json.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed: unknown = JSON.parse(String(reader.result));
          if (!isSteamData(parsed)) {
            setError("This JSON isn't a Steam data export. Re-run the collector to regenerate it.");
            return;
          }
          onLoad(parsed);
        } catch {
          setError("Couldn't parse that file — it isn't valid JSON.");
        }
      };
      reader.onerror = () => setError("Couldn't read that file. Try again.");
      reader.readAsText(file);
    },
    [onLoad],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept=".json,application/json"
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
      }}
    />
  );

  const dragProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop,
    onClick: () => inputRef.current?.click(),
    role: "button",
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
    },
  };

  if (compact) {
    return (
      <div className="upload-wrap">
        <div className={`dropstrip${dragging ? " dropstrip--active" : ""}`} {...dragProps}>
          <span className="dropstrip__icon" aria-hidden="true">
            &#8681;
          </span>
          <span className="dropstrip__text">
            <b>Already ran the collector?</b> Drop your steam_data.json — or click to browse.
          </span>
          {fileInput}
        </div>
        {error && <p className="upload-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="upload-wrap">
      <div className={`dropzone${dragging ? " dropzone--active" : ""}`} {...dragProps}>
        <div className="dropzone__icon" aria-hidden="true">
          &#8681;
        </div>
        <p className="dropzone__title">Drop your steam_data.json here</p>
        <p className="dropzone__hint">or click to browse &middot; your data never leaves your browser</p>
        {fileInput}
      </div>
      {error && <p className="upload-error">{error}</p>}
    </div>
  );
}
