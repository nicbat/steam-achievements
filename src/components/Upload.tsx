import { useCallback, useRef, useState } from "react";
import type { SteamData } from "../types";
import { isSteamData } from "../lib/steam";

interface Props {
  onLoad: (data: SteamData) => void;
}

export function Upload({ onLoad }: Props) {
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

  return (
    <div className="upload-wrap">
      <div
        className={`dropzone${dragging ? " dropzone--active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
      >
        <div className="dropzone__icon" aria-hidden="true">
          &#8681;
        </div>
        <p className="dropzone__title">Drop your steam_data.json here</p>
        <p className="dropzone__hint">or click to choose a file &middot; everything stays in your browser</p>
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
      </div>
      {error && <p className="upload-error">{error}</p>}
    </div>
  );
}
