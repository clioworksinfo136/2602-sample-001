import {
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import type { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";
import { Authenticator } from "@aws-amplify/ui-react";
import { fetchUserAttributes } from "aws-amplify/auth";
import { uploadData, list, getUrl, remove } from "aws-amplify/storage";
import "@aws-amplify/ui-react/styles.css";
import "./App.css";

const client = generateClient<Schema>({ authMode: "userPool" });

// Written to Location.username on create and on Apply, in place of the
// signed-in user's address.
const RECORDED_USERNAME = "jiangfeng1212@gmail.com";

type Location = Schema["Location"]["type"];
type DateRecord = Schema["Date"]["type"];
type TypeRecord = Schema["Type"]["type"];
type EquipmentRecord = Schema["Equipment"]["type"];
type TrackRecord = Schema["Track"]["type"];

function describeErrors(errors: { message?: string }[]): string {
  return errors.map((e) => e.message ?? String(e)).join("; ");
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function formatDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function AudioButton({ onResult }: { onResult: (text: string) => void }) {
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const toggle = useCallback(() => {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }

    const SR =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
      setRecording(false);
    };

    recognition.onerror = () => setRecording(false);
    recognition.onend = () => setRecording(false);

    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  }, [recording, onResult]);

  return (
    <button
      type="button"
      className={`audio-btn${recording ? " recording" : ""}`}
      onClick={toggle}
      title={recording ? "Stop recording" : "Voice input"}
      aria-label={recording ? "Stop recording" : "Voice input"}
      aria-pressed={recording}
    >
      {recording ? (
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          width="17"
          height="17"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="9" y="2" width="6" height="11" rx="3" />
          <path d="M5 10.5a7 7 0 0 0 14 0" />
          <line x1="12" y1="17.5" x2="12" y2="21" />
          <line x1="8.5" y1="21" x2="15.5" y2="21" />
        </svg>
      )}
    </button>
  );
}

function EditableField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  multiline = false,
  rows = 3,
  autoGrow = false,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  type?: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  autoGrow?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  // Resize to fit the content on every change. Height is cleared first so the
  // box shrinks again when text is deleted, not just grows.
  useEffect(() => {
    if (!multiline || !autoGrow) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, multiline, autoGrow]);

  const commit = (next: string) => {
    if (next !== value) onChange(next);
  };

  const handleAudio = useCallback(
    (transcript: string) => {
      // Multiline fields append each dictation as a new line so a long
      // description can be built up across several recordings.
      const next = multiline
        ? draft
          ? `${draft}\n${transcript}`
          : transcript
        : type === "number"
        ? // Keep the decimal point and sign so dictated temperatures such as
          // "72.5" or "-3" survive; "72.5" must not become "725".
          transcript.replace(/[^0-9.-]/g, "").replace(/(?!^)-/g, "")
        : transcript;
      setDraft(next);
      commit(next);
    },
    [type, value, draft, multiline, onChange]
  );

  const resolvedPlaceholder = placeholder ?? `Enter ${label.toLowerCase()}`;

  return (
    <div className={`field-row${multiline ? " field-row-multiline" : ""}`}>
      <label className="field-label">{label}</label>
      {multiline ? (
        <textarea
          ref={textareaRef}
          className={`field-input field-textarea${
            autoGrow ? " field-textarea-grow" : ""
          }`}
          rows={rows}
          value={draft}
          placeholder={resolvedPlaceholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            // Enter inserts a newline; Ctrl/Cmd+Enter saves.
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              commit(draft);
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              setDraft(value);
              e.currentTarget.blur();
            }
          }}
        />
      ) : (
        <input
          className="field-input"
          type={type}
          value={draft}
          placeholder={resolvedPlaceholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit(draft);
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              setDraft(value);
              e.currentTarget.blur();
            }
          }}
        />
      )}
      <AudioButton onResult={handleAudio} />
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

function parseTime(time: string | null | undefined): { h: string; m: string } {
  if (!time) return { h: "", m: "" };
  const parts = time.split(":");
  return { h: parts[0] ?? "", m: parts[1] ?? "" };
}

function TimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const { h, m } = parseTime(value);

  const update = (newH: string, newM: string) => {
    if (newH && newM) {
      onChange(`${newH}:${newM}:00`);
    } else if (newH || newM) {
      onChange(`${newH || "00"}:${newM || "00"}:00`);
    }
  };

  return (
    <div className="field-row">
      <span className="field-label">Time</span>
      <div className="time-selects">
        <select
          className="time-select"
          value={h}
          onChange={(e) => update(e.target.value, m || "00")}
        >
          <option value="">HH</option>
          {HOURS.map((hr) => (
            <option key={hr} value={hr}>{hr}</option>
          ))}
        </select>
        <span className="time-colon">:</span>
        <select
          className="time-select"
          value={m}
          onChange={(e) => update(h || "00", e.target.value)}
        >
          <option value="">MM</option>
          {MINUTES.map((mn) => (
            <option key={mn} value={mn}>{mn}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function TrackInputField({
  value,
  tracks,
  onCommit,
}: {
  value: string;
  tracks: TrackRecord[];
  onCommit: (trackNumber: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    setDraft(value);
    setProblem(null);
  }, [value]);

  // Rejects on commit and restores the previous value, so an unknown track can
  // never sit in the field waiting to be written by Apply.
  const commit = () => {
    const raw = draft.trim();
    if (raw === value) {
      setProblem(null);
      return;
    }
    if (raw === "") {
      setProblem("Track is required.");
      setDraft(value);
      return;
    }
    const n = parseInt(raw, 10);
    if (Number.isNaN(n) || String(n) !== raw) {
      setProblem("Enter a whole number.");
      setDraft(value);
      return;
    }
    if (tracks.length === 0) {
      setProblem("The Track table is empty — add a track there first.");
      setDraft(value);
      return;
    }
    if (!tracks.some((t) => t.track === n)) {
      setProblem(`Track ${n} is not in the Track table.`);
      setDraft(value);
      return;
    }
    setProblem(null);
    onCommit(n);
  };

  return (
    <div className="field-row field-row-top">
      <span className="field-label">Track</span>
      <div className="track-input-wrap">
        <input
          className={`field-input${problem ? " field-invalid" : ""}`}
          type="number"
          step="1"
          value={draft}
          aria-label="Track"
          aria-invalid={problem !== null}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              setDraft(value);
              setProblem(null);
              e.currentTarget.blur();
            }
          }}
        />
        {problem && (
          <span className="field-error" role="alert">
            {problem}
          </span>
        )}
      </div>
    </div>
  );
}

function typeLabel(t: TypeRecord): string {
  return `${t.typeid ?? ""} ${t.type ?? ""}`.trim();
}

function TypeSelectField({
  value,
  types,
  onChange,
}: {
  value: string;
  types: TypeRecord[];
  onChange: (val: string) => void;
}) {
  // Only rows with a typeid can be linked to, since typeid is the stored key.
  const linkable = types.filter((t) => (t.typeid ?? "").trim() !== "");
  const isKnown = linkable.some((t) => (t.typeid ?? "") === value);

  return (
    <div className="field-row">
      <span className="field-label">Type</span>
      <select
        className="field-input field-select"
        value={value}
        aria-label="Type"
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— none —</option>
        {linkable.map((t) => (
          <option key={t.id} value={t.typeid ?? ""}>
            {typeLabel(t)}
          </option>
        ))}
        {/* Keeps a legacy or deleted value visible instead of silently
            blanking the field when it matches no Type row. */}
        {value !== "" && !isKnown && (
          <option value={value}>{value} (not in Type table)</option>
        )}
      </select>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="field-row">
      <span className="field-label">{label}</span>
      <span className="field-readonly" title={value}>
        {value || "—"}
      </span>
    </div>
  );
}

type MediaItem = { path: string; url: string; name: string; isVideo: boolean };

// Keeps S3 keys predictable: strips path separators and characters that would
// need escaping, while preserving the extension.
function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
}

function MediaLightbox({
  items,
  index,
  onClose,
  onNavigate,
  onDelete,
}: {
  items: MediaItem[];
  index: number;
  onClose: () => void;
  onNavigate: (delta: number) => void;
  onDelete: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const item = items[index];

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onNavigate(-1);
      if (e.key === "ArrowRight") onNavigate(1);
    };
    window.addEventListener("keydown", onKey);
    // The page behind the overlay must not scroll while it is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, onNavigate]);

  if (!item) return null;

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Attachment ${index + 1} of ${items.length}`}
      tabIndex={-1}
      ref={dialogRef}
      onClick={onClose}
    >
      <div className="lightbox-stage" onClick={(e) => e.stopPropagation()}>
        {item.isVideo ? (
          <video
            key={item.path}
            src={item.url}
            className="lightbox-media"
            controls
            autoPlay
          />
        ) : (
          <img key={item.path} src={item.url} className="lightbox-media" alt={item.name} />
        )}

        {items.length > 1 && (
          <>
            <button
              className="lightbox-nav prev"
              onClick={() => onNavigate(-1)}
              aria-label="Previous attachment"
            >
              ‹
            </button>
            <button
              className="lightbox-nav next"
              onClick={() => onNavigate(1)}
              aria-label="Next attachment"
            >
              ›
            </button>
          </>
        )}

        <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
          <span className="lightbox-count">
            {index + 1} / {items.length}
          </span>
          <span className="lightbox-name" title={item.name}>
            {item.name}
          </span>
          <button className="danger-btn" onClick={onDelete}>
            Delete
          </button>
          <button className="small-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function MediaSection({ locationId }: { locationId: string }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const prefix = `location-media/${locationId}/`;

  const refresh = useCallback(async () => {
    try {
      const res = await list({ path: prefix });
      const resolved = await Promise.all(
        res.items.map(async (item) => {
          const { url } = await getUrl({ path: item.path });
          const name = item.path.slice(prefix.length);
          return {
            path: item.path,
            url: url.toString(),
            name,
            isVideo: /\.(mp4|mov|webm|m4v|avi)$/i.test(name),
          };
        })
      );
      setItems(resolved);
      setProblem(null);
    } catch (err) {
      console.error("Failed to list media", err);
      setProblem(`Could not load attachments: ${messageOf(err)}`);
    }
  }, [prefix]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      try {
        await uploadData({
          path: `${prefix}${Date.now()}-${safeFileName(file.name)}`,
          data: file,
          options: { contentType: file.type || undefined },
        }).result;
      } catch (err) {
        console.error("Upload failed", err);
        failures.push(`${file.name}: ${messageOf(err)}`);
      }
    }
    await refresh();
    setBusy(false);
    if (failures.length > 0) setProblem(`Upload failed — ${failures[0]}`);
  };

  const deleteItem = async (path: string): Promise<boolean> => {
    try {
      await remove({ path });
      setItems((prev) => prev.filter((i) => i.path !== path));
      setProblem(null);
      return true;
    } catch (err) {
      console.error("Failed to delete media", err);
      setProblem(`Could not delete: ${messageOf(err)}`);
      return false;
    }
  };

  const handleRemove = async (path: string) => {
    if (!window.confirm("Delete this attachment? This cannot be undone.")) return;
    await deleteItem(path);
  };

  const handleLightboxDelete = async () => {
    if (lightboxIndex === null) return;
    const item = items[lightboxIndex];
    if (!item) return;
    if (!window.confirm("Delete this attachment? This cannot be undone.")) return;
    if (!(await deleteItem(item.path))) return;
    // Stay open on the neighbouring item so a run of deletions does not force
    // the user to reopen the viewer each time.
    const remaining = items.length - 1;
    setLightboxIndex(remaining === 0 ? null : Math.min(lightboxIndex, remaining - 1));
  };

  const navigate = (delta: number) => {
    setLightboxIndex((current) => {
      if (current === null || items.length === 0) return current;
      return (current + delta + items.length) % items.length;
    });
  };

  return (
    <div className="media-section">
      <div className="media-bar">
        <span className="field-label">Media</span>
        <button
          className="small-btn"
          onClick={() => photoRef.current?.click()}
          disabled={busy}
          title="Take a photo (opens the camera on mobile)"
        >
          Photo
        </button>
        <button
          className="small-btn"
          onClick={() => videoRef.current?.click()}
          disabled={busy}
          title="Record a video (opens the camera on mobile)"
        >
          Video
        </button>
        <button
          className="small-btn"
          onClick={() => uploadRef.current?.click()}
          disabled={busy}
          title="Choose existing files from this device"
        >
          Upload
        </button>
        {busy && <span className="media-status">Uploading…</span>}
      </div>

      {/* `capture` asks a phone for the camera directly; desktop browsers
          ignore it and fall back to a file picker. */}
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={videoRef}
        type="file"
        accept="video/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={uploadRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {problem && <p className="field-error">{problem}</p>}

      {items.length > 0 && (
        <ul className="media-grid">
          {items.map((item, i) => (
            <li key={item.path} className="media-tile">
              <button
                className="media-open"
                onClick={() => setLightboxIndex(i)}
                title={`Open ${item.name}`}
                aria-label={`Open ${item.name}`}
              >
                {item.isVideo ? (
                  <video src={item.url} className="media-thumb" preload="metadata" />
                ) : (
                  <img src={item.url} className="media-thumb" alt={item.name} />
                )}
                {item.isVideo && <span className="media-play" aria-hidden="true">▶</span>}
              </button>
              <button
                className="media-remove"
                onClick={() => handleRemove(item.path)}
                title="Delete attachment"
                aria-label={`Delete ${item.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {lightboxIndex !== null && (
        <MediaLightbox
          items={items}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={navigate}
          onDelete={handleLightboxDelete}
        />
      )}
    </div>
  );
}

function LocationCard({
  location,
  dirty,
  types,
  tracks,
  onUpdate,
  onDelete,
  onAddTrack,
}: {
  location: Location;
  dirty: boolean;
  types: TypeRecord[];
  tracks: TrackRecord[];
  onUpdate: (id: string, fields: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onAddTrack: () => void;
}) {
  const update = (field: string) => (val: string) => {
    const parsed = field === "track" ? parseInt(val, 10) || 0 : val;
    onUpdate(location.id, { [field]: parsed });
  };

  // Picking a track also resolves the type through the Track table, so the two
  // fields cannot disagree. Type is left alone when the track has no row.
  const selectTrack = (trackNumber: number) => {
    const match = tracks.find((t) => t.track === trackNumber);
    onUpdate(location.id, {
      track: trackNumber,
      ...(match ? { type: match.typeid ?? "" } : {}),
    });
  };

  return (
    <div className={`location-card${dirty ? " card-dirty" : ""}`}>
      <div className="card-header">
        <span className="header-left">
          <span className="card-track">
            Track {location.track}
            {dirty && <span className="dirty-dot" title="Unsaved changes" />}
          </span>
          <button
            className="add-track-btn"
            onClick={() => onAddTrack()}
            title={`Add another entry on track ${location.track}`}
          >
            + Add Track
          </button>
        </span>
        <button
          className="delete-btn"
          onClick={() => onDelete(location.id)}
          title="Delete"
        >
          ✕
        </button>
      </div>
      <div className="field-grid">
        <TimeField value={location.time ?? ""} onChange={update("time")} />
        <TrackInputField
          value={String(location.track ?? "")}
          tracks={tracks}
          onCommit={selectTrack}
        />
        <TypeSelectField
          value={location.type ?? ""}
          types={types}
          onChange={update("type")}
        />
        <ReadOnlyField label="Username" value={location.username ?? ""} />
        <EditableField
          label="Description"
          value={location.description ?? ""}
          onChange={update("description")}
          multiline
          autoGrow
        />
      </div>
      <MediaSection locationId={location.id} />
    </div>
  );
}

function TableInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  type = "text",
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  ariaLabel: string;
  type?: string;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (draft !== value) onChange(draft);
  };

  return (
    <input
      className="table-input"
      type={type}
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      className={`toggle-switch${checked ? " on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
}

function TableCell<T extends { id: string }>({
  column,
  row,
  onChange,
}: {
  column: {
    key: string;
    header: string;
    value: (row: T) => string;
    kind?: "text" | "number" | "select" | "readonly";
    options?: { value: string; label: string }[];
  };
  row: T;
  onChange: (val: string) => void;
}) {
  const value = column.value(row);

  if (column.kind === "readonly") {
    return (
      <span className="table-readonly" title={value}>
        {value || "—"}
      </span>
    );
  }

  if (column.kind === "select") {
    const options = column.options ?? [];
    const isKnown = options.some((o) => o.value === value);
    return (
      <select
        className="table-input table-select"
        value={value}
        aria-label={column.header}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {/* Keeps an unmatched value visible rather than silently blanking it. */}
        {value !== "" && !isKnown && <option value={value}>{value} (?)</option>}
      </select>
    );
  }

  return (
    <TableInput
      value={value}
      type={column.kind === "number" ? "number" : "text"}
      placeholder={column.header}
      ariaLabel={column.header}
      onChange={onChange}
    />
  );
}

// Shared by the Track, Type, and Equipment tables: a flat list of records
// edited in place, saved together when Apply is pressed.
function LookupTable<T extends { id: string }>({
  title,
  columns,
  rows,
  addLabel,
  emptyLabel,
  deleteLabel,
  dirtyIds,
  applying,
  onUpdate,
  onDelete,
  onAdd,
  onApply,
}: {
  title: string;
  columns: {
    key: string;
    header: string;
    value: (row: T) => string;
    kind?: "text" | "number" | "select" | "readonly";
    options?: { value: string; label: string }[];
  }[];
  rows: T[];
  addLabel: string;
  emptyLabel: string;
  deleteLabel: string;
  dirtyIds: Set<string>;
  applying: boolean;
  onUpdate: (id: string, field: string, value: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onApply: () => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="location-card type-card">
      <div className={`card-header${open ? "" : " card-header-collapsed"}`}>
        <span className="card-track">{title}</span>
        <div className="header-right">
          {/* Surfaced in the header so unsaved edits stay visible while the
              table is collapsed and Apply is out of reach. */}
          {dirtyIds.size > 0 && (
            <span className="dirty-pill">{dirtyIds.size} unsaved</span>
          )}
          <span className="row-count">
            {rows.length} {rows.length === 1 ? "row" : "rows"}
          </span>
          <ToggleSwitch
            checked={open}
            onChange={setOpen}
            label={`${open ? "Collapse" : "Expand"} ${title}`}
          />
        </div>
      </div>

      {!open ? null : rows.length === 0 ? (
        <p className="status-text">{emptyLabel}</p>
      ) : (
        <div className="table-scroll">
          <table className="type-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th scope="col" key={col.key}>
                    {col.header}
                  </th>
                ))}
                <th scope="col" className="th-actions">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={dirtyIds.has(row.id) ? "row-dirty" : undefined}
                >
                  {columns.map((col) => (
                    <td key={col.key}>
                      <TableCell
                        column={col}
                        row={row}
                        onChange={(v) => onUpdate(row.id, col.key, v)}
                      />
                    </td>
                  ))}
                  <td className="td-actions">
                    <button
                      className="delete-btn"
                      onClick={() => onDelete(row.id)}
                      title={deleteLabel}
                      aria-label={deleteLabel}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <ApplyBar
          dirtyCount={dirtyIds.size}
          applying={applying}
          onApply={onApply}
          addLabel={addLabel}
          onAdd={onAdd}
        />
      )}
    </div>
  );
}

function ApplyBar({
  dirtyCount,
  applying,
  onApply,
  addLabel,
  onAdd,
  extra,
}: {
  dirtyCount: number;
  applying: boolean;
  onApply: () => void;
  addLabel: string;
  onAdd: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="apply-bar">
      {/* Wrapped, not passed directly: the click event would otherwise arrive
          as the handler's first argument. */}
      <button className="add-btn" onClick={() => onAdd()}>
        {addLabel}
      </button>
      {extra}
      <button
        className="apply-btn"
        onClick={onApply}
        disabled={dirtyCount === 0 || applying}
        title={
          dirtyCount === 0
            ? "No unsaved changes"
            : `Save ${dirtyCount} changed row${dirtyCount === 1 ? "" : "s"}`
        }
      >
        {applying
          ? "Applying…"
          : dirtyCount === 0
          ? "Apply"
          : `Apply (${dirtyCount})`}
      </button>
    </div>
  );
}

const DATE_NUMERIC_FIELDS: Record<string, "float" | "int"> = {
  hight: "float",
  lowt: "float",
  labor: "int",
};

function parseDateField(field: string, raw: string): string | number | null {
  const kind = DATE_NUMERIC_FIELDS[field];
  if (!kind) return raw;
  if (raw.trim() === "") return null;
  const num = kind === "int" ? parseInt(raw, 10) : parseFloat(raw);
  return Number.isNaN(num) ? null : num;
}

function equipmentLabel(e: EquipmentRecord): string {
  return [e.primeSub, e.model, e.equipment]
    .map((v) => (v ?? "").trim())
    .filter((v) => v !== "")
    .join(", ");
}

function DatePanel({
  record,
  equipmentOptions,
  onChange,
  onAppendEquipment,
  onRemoveLastEquipment,
}: {
  record: DateRecord | null;
  equipmentOptions: EquipmentRecord[];
  onChange: (field: string, raw: string) => void;
  onAppendEquipment: (label: string) => void;
  onRemoveLastEquipment: () => void;
}) {
  const text = (field: keyof DateRecord) => {
    const v = record?.[field];
    return v === null || v === undefined ? "" : String(v);
  };

  const appendEquipment = (id: string) => {
    const item = equipmentOptions.find((e) => e.id === id);
    if (!item) return;
    const label = equipmentLabel(item);
    if (label !== "") onAppendEquipment(label);
  };

  // Entries already listed in the field drop out of the menu, so the same
  // equipment cannot be added twice.
  const alreadyAdded = new Set(
    text("equipment")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "")
  );
  const named = equipmentOptions.filter((e) => equipmentLabel(e) !== "");
  const selectable = named.filter((e) => !alreadyAdded.has(equipmentLabel(e)));

  const isEquipmentEmpty = alreadyAdded.size === 0;

  const placeholder =
    named.length === 0
      ? "No equipment rows yet"
      : selectable.length === 0
      ? "All equipment added"
      : "+ Add from Equipment table…";

  return (
    <div className="location-card date-panel">
      <div className="card-header">
        <span className="card-track">Day Details</span>
      </div>
      {/* Paired so related values share a line: weather with labor count,
          the two temperatures together, the two people together. */}
      <div className="field-grid">
        <EditableField
          label="Weather"
          value={text("weather")}
          onChange={(v) => onChange("weather", v)}
        />
        <EditableField
          label="Labor"
          value={text("labor")}
          onChange={(v) => onChange("labor", v)}
          type="number"
        />
        <EditableField
          label="High Temp"
          value={text("hight")}
          onChange={(v) => onChange("hight", v)}
          type="number"
        />
        <EditableField
          label="Low Temp"
          value={text("lowt")}
          onChange={(v) => onChange("lowt", v)}
          type="number"
        />
        <EditableField
          label="Supervisor"
          value={text("supervisor")}
          onChange={(v) => onChange("supervisor", v)}
        />
        <EditableField
          label="Inspector"
          value={text("inspector")}
          onChange={(v) => onChange("inspector", v)}
        />
        <EditableField
          label="Observation"
          value={text("observation")}
          onChange={(v) => onChange("observation", v)}
          multiline
          autoGrow
        />
        <EditableField
          label="Equipment"
          value={text("equipment")}
          onChange={(v) => onChange("equipment", v)}
          multiline
          rows={6}
        />

        <div className="field-row field-row-wide">
          <span className="field-label" aria-hidden="true" />
          <select
            className="field-input field-select"
            value=""
            aria-label="Add equipment from the Equipment table"
            onChange={(e) => appendEquipment(e.target.value)}
          >
            <option value="">{placeholder}</option>
            {selectable.map((e) => (
              <option key={e.id} value={e.id}>
                {equipmentLabel(e)}
              </option>
            ))}
          </select>
          <div className="equipment-actions">
            <button
              type="button"
              className="small-btn"
              onClick={() => onChange("equipment", "")}
              disabled={isEquipmentEmpty}
              title="Remove every equipment entry"
            >
              Clear
            </button>
            <button
              type="button"
              className="small-btn"
              onClick={onRemoveLastEquipment}
              disabled={isEquipmentEmpty}
              title="Remove the last equipment entry"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LocationsApp({
  email,
  signOut,
}: {
  email: string;
  signOut?: () => void;
}) {
  const [selectedDate, setSelectedDate] = useState(formatDateString(new Date()));
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Ids whose local edits have not been written to the backend yet.
  const [dirtyLocations, setDirtyLocations] = useState<Set<string>>(new Set());
  const [dirtyTypes, setDirtyTypes] = useState<Set<string>>(new Set());
  const [dirtyEquipment, setDirtyEquipment] = useState<Set<string>>(new Set());
  const [dirtyTracks, setDirtyTracks] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  const fetchLocations = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const { data, errors } = await client.models.Location.list({
        filter: { date: { eq: date } },
      });
      if (errors?.length) throw new Error(describeErrors(errors));
      setLocations(data);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch locations", err);
      setError(`Could not load locations: ${messageOf(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const [dateRecord, setDateRecord] = useState<DateRecord | null>(null);
  // Mirrors dateRecord so the save path can read the latest value without
  // waiting for a re-render, and so concurrent edits share one created row.
  const dateRecordRef = useRef<DateRecord | null>(null);
  const pendingCreate = useRef<Promise<DateRecord> | null>(null);

  // Tracks the equipment text separately so that picking several machines in a
  // row compounds correctly, even before the day's row exists or React has
  // re-rendered from the previous pick.
  const equipmentTextRef = useRef("");

  const applyDateRecord = useCallback((rec: DateRecord | null) => {
    dateRecordRef.current = rec;
    setDateRecord(rec);
  }, []);

  const fetchDateRecord = useCallback(
    async (date: string) => {
      pendingCreate.current = null;
      try {
        const { data, errors } = await client.models.Date.list({
          filter: { date: { eq: date } },
        });
        if (errors?.length) throw new Error(describeErrors(errors));
        applyDateRecord(data[0] ?? null);
        equipmentTextRef.current = data[0]?.equipment ?? "";
      } catch (err) {
        console.error("Failed to fetch day details", err);
        setError(`Could not load day details: ${messageOf(err)}`);
      }
    },
    [applyDateRecord]
  );

  useEffect(() => {
    fetchLocations(selectedDate);
    fetchDateRecord(selectedDate);
  }, [selectedDate, fetchLocations, fetchDateRecord]);

  const unsavedCount =
    dirtyLocations.size +
    dirtyTypes.size +
    dirtyEquipment.size +
    dirtyTracks.size;

  // Deferred saving means a reload would silently discard pending edits.
  useEffect(() => {
    if (unsavedCount === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsavedCount]);

  // Locations are scoped to the selected date, so switching dates replaces the
  // list and would drop unapplied location edits.
  const requestDateChange = (next: string) => {
    if (
      dirtyLocations.size > 0 &&
      !window.confirm(
        `You have ${dirtyLocations.size} unsaved location change${
          dirtyLocations.size === 1 ? "" : "s"
        }. Switching dates will discard them. Continue?`
      )
    ) {
      return;
    }
    setDirtyLocations(new Set());
    setSelectedDate(next);
  };

  // Creates the day's row on first edit. The in-flight promise is shared so
  // editing two fields quickly cannot produce two rows for the same date.
  const ensureDateRecord = useCallback(async (): Promise<DateRecord> => {
    if (dateRecordRef.current) return dateRecordRef.current;
    if (!pendingCreate.current) {
      pendingCreate.current = (async () => {
        const { data, errors } = await client.models.Date.create({
          date: selectedDate,
        });
        if (errors?.length) throw new Error(describeErrors(errors));
        if (!data) throw new Error("The server did not return the new record.");
        applyDateRecord(data);
        return data;
      })();
    }
    return pendingCreate.current;
  }, [selectedDate, applyDateRecord]);

  // Types are a lookup table shared across dates, so they load once rather
  // than refetching whenever the selected date changes.
  const [types, setTypes] = useState<TypeRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, errors } = await client.models.Type.list();
        if (errors?.length) throw new Error(describeErrors(errors));
        if (!cancelled) setTypes(data);
      } catch (err) {
        console.error("Failed to load types", err);
        if (!cancelled) setError(`Could not load types: ${messageOf(err)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Edits are local only; nothing reaches the backend until Apply is clicked.
  const handleTypeUpdate = (id: string, field: string, value: string) => {
    setTypes((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
    setDirtyTypes((prev) => new Set(prev).add(id));
  };

  const handleTypeDelete = async (id: string) => {
    try {
      const { errors } = await client.models.Type.delete({ id });
      if (errors?.length) throw new Error(describeErrors(errors));
      setTypes((prev) => prev.filter((t) => t.id !== id));
      setError(null);
    } catch (err) {
      console.error("Failed to delete type", err);
      setError(`Could not delete type: ${messageOf(err)}`);
    }
  };

  const handleTypeAdd = async () => {
    try {
      const { data, errors } = await client.models.Type.create({
        typeid: "",
        type: "",
      });
      if (errors?.length) throw new Error(describeErrors(errors));
      if (!data) throw new Error("The server did not return the new record.");
      setTypes((prev) => [...prev, data]);
      setError(null);
    } catch (err) {
      console.error("Failed to add type", err);
      setError(`Could not add type: ${messageOf(err)}`);
    }
  };

  const [tracks, setTracks] = useState<TrackRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, errors } = await client.models.Track.list();
        if (errors?.length) throw new Error(describeErrors(errors));
        if (!cancelled) setTracks(data);
      } catch (err) {
        console.error("Failed to load tracks", err);
        if (!cancelled) setError(`Could not load tracks: ${messageOf(err)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTrackUpdate = (id: string, field: string, value: string) => {
    // track is an integer column, so an unparseable or cleared cell stores
    // null rather than NaN or a string.
    const parsed =
      field === "track"
        ? value.trim() === "" || Number.isNaN(parseInt(value, 10))
          ? null
          : parseInt(value, 10)
        : value;
    setTracks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: parsed } : t))
    );
    setDirtyTracks((prev) => new Set(prev).add(id));
  };

  const handleTrackDelete = async (id: string) => {
    try {
      const { errors } = await client.models.Track.delete({ id });
      if (errors?.length) throw new Error(describeErrors(errors));
      setTracks((prev) => prev.filter((t) => t.id !== id));
      setError(null);
    } catch (err) {
      console.error("Failed to delete track", err);
      setError(`Could not delete track: ${messageOf(err)}`);
    }
  };

  const handleTrackAdd = async () => {
    try {
      const { data, errors } = await client.models.Track.create({
        typeid: "",
      });
      if (errors?.length) throw new Error(describeErrors(errors));
      if (!data) throw new Error("The server did not return the new record.");
      setTracks((prev) => [...prev, data]);
      setError(null);
    } catch (err) {
      console.error("Failed to add track", err);
      setError(`Could not add track: ${messageOf(err)}`);
    }
  };

  const [equipment, setEquipment] = useState<EquipmentRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, errors } = await client.models.Equipment.list();
        if (errors?.length) throw new Error(describeErrors(errors));
        if (!cancelled) setEquipment(data);
      } catch (err) {
        console.error("Failed to load equipment", err);
        if (!cancelled) setError(`Could not load equipment: ${messageOf(err)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEquipmentUpdate = (id: string, field: string, value: string) => {
    setEquipment((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
    setDirtyEquipment((prev) => new Set(prev).add(id));
  };

  const handleEquipmentDelete = async (id: string) => {
    try {
      const { errors } = await client.models.Equipment.delete({ id });
      if (errors?.length) throw new Error(describeErrors(errors));
      setEquipment((prev) => prev.filter((e) => e.id !== id));
      setError(null);
    } catch (err) {
      console.error("Failed to delete equipment", err);
      setError(`Could not delete equipment: ${messageOf(err)}`);
    }
  };

  const handleEquipmentAdd = async () => {
    try {
      const { data, errors } = await client.models.Equipment.create({
        primeSub: "",
        model: "",
        equipment: "",
      });
      if (errors?.length) throw new Error(describeErrors(errors));
      if (!data) throw new Error("The server did not return the new record.");
      setEquipment((prev) => [...prev, data]);
      setError(null);
    } catch (err) {
      console.error("Failed to add equipment", err);
      setError(`Could not add equipment: ${messageOf(err)}`);
    }
  };

  const handleDateChange = async (field: string, raw: string) => {
    const value = parseDateField(field, raw);
    const previous = dateRecordRef.current;
    if (field === "equipment") equipmentTextRef.current = raw;
    if (previous) applyDateRecord({ ...previous, [field]: value });
    try {
      const record = await ensureDateRecord();
      const { errors } = await client.models.Date.update({
        id: record.id,
        [field]: value,
      } as never);
      if (errors?.length) throw new Error(describeErrors(errors));
      applyDateRecord({ ...dateRecordRef.current!, [field]: value });
      setError(null);
    } catch (err) {
      console.error("Failed to save day details", err);
      pendingCreate.current = null;
      applyDateRecord(previous);
      if (field === "equipment")
        equipmentTextRef.current = previous?.equipment ?? "";
      setError(`Could not save ${field}: ${messageOf(err)}`);
    }
  };

  // Applies each dirty row in turn, keeping any that fail marked as unsaved so
  // a partial failure never silently discards the user's edits.
  const applyRows = async <T extends { id: string }>(
    what: string,
    rows: T[],
    dirty: Set<string>,
    setDirty: (next: Set<string>) => void,
    save: (row: T) => Promise<{ errors?: { message?: string }[] | null }>,
    onSaved?: (savedIds: Set<string>) => void
  ) => {
    if (dirty.size === 0 || applying) return;
    setApplying(true);
    const stillDirty = new Set<string>();
    const saved = new Set<string>();
    const failures: string[] = [];
    for (const id of dirty) {
      const row = rows.find((r) => r.id === id);
      if (!row) continue;
      try {
        const { errors } = await save(row);
        if (errors?.length) throw new Error(describeErrors(errors));
        saved.add(id);
      } catch (err) {
        console.error(`Failed to apply ${what}`, err);
        stillDirty.add(id);
        failures.push(messageOf(err));
      }
    }
    if (saved.size > 0) onSaved?.(saved);
    setDirty(stillDirty);
    setApplying(false);
    setError(
      failures.length === 0
        ? null
        : `Could not save ${failures.length} ${what} row${
            failures.length === 1 ? "" : "s"
          }: ${failures[0]}`
    );
  };

  const applyLocations = () =>
    applyRows(
      "location",
      locations,
      dirtyLocations,
      setDirtyLocations,
      (row) =>
        client.models.Location.update({
          id: row.id,
          time: row.time,
          track: row.track,
          type: row.type,
          description: row.description,
          username: RECORDED_USERNAME,
        }),
      // Mirror it locally so the read-only Username field updates without
      // waiting for a refetch.
      (savedIds) =>
        setLocations((prev) =>
          prev.map((l) =>
            savedIds.has(l.id) ? { ...l, username: RECORDED_USERNAME } : l
          )
        )
    );

  const applyTypes = () =>
    applyRows("type", types, dirtyTypes, setDirtyTypes, (row) =>
      client.models.Type.update({
        id: row.id,
        typeid: row.typeid,
        type: row.type,
      })
    );

  const applyTracks = () =>
    applyRows("track", tracks, dirtyTracks, setDirtyTracks, (row) =>
      client.models.Track.update({
        id: row.id,
        track: row.track,
        typeid: row.typeid,
      })
    );

  const applyEquipment = () =>
    applyRows("equipment", equipment, dirtyEquipment, setDirtyEquipment, (row) =>
      client.models.Equipment.update({
        id: row.id,
        primeSub: row.primeSub,
        model: row.model,
        equipment: row.equipment,
      })
    );

  const [trackToDelete, setTrackToDelete] = useState("");

  const tracksOnDate = Array.from(
    new Set(
      locations
        .map((l) => l.track)
        .filter((n): n is number => n !== null && n !== undefined)
    )
  ).sort((a, b) => a - b);

  // Deletes each row in turn, keeping rows that fail so a partial failure is
  // visible rather than leaving the list out of step with the backend.
  const deleteLocationRows = async (rows: Location[], what: string) => {
    if (rows.length === 0 || applying) return;
    setApplying(true);
    const removed = new Set<string>();
    const failures: string[] = [];
    for (const row of rows) {
      try {
        const { errors } = await client.models.Location.delete({ id: row.id });
        if (errors?.length) throw new Error(describeErrors(errors));
        removed.add(row.id);
      } catch (err) {
        console.error(`Failed to delete ${what}`, err);
        failures.push(messageOf(err));
      }
    }
    setLocations((prev) => prev.filter((l) => !removed.has(l.id)));
    setDirtyLocations((prev) => {
      const next = new Set(prev);
      removed.forEach((id) => next.delete(id));
      return next;
    });
    setTrackToDelete("");
    setApplying(false);
    setError(
      failures.length === 0
        ? null
        : `Could not delete ${failures.length} of ${rows.length} ${what}: ${failures[0]}`
    );
  };

  // Spells out how many entries and how many unsaved edits are about to go,
  // since deletion is irreversible and discards pending changes too.
  const confirmDelete = (rows: Location[], subject: string) => {
    const unsaved = rows.filter((r) => dirtyLocations.has(r.id)).length;
    return window.confirm(
      `Delete ${rows.length} ${
        rows.length === 1 ? "entry" : "entries"
      } for ${subject}?` +
        (unsaved > 0
          ? `\n\n${unsaved} of them ${
              unsaved === 1 ? "has" : "have"
            } unsaved changes that will be lost.`
          : "") +
        "\n\nThis cannot be undone."
    );
  };

  const handleDeleteTrack = () => {
    if (trackToDelete === "") return;
    const num = parseInt(trackToDelete, 10);
    const rows = locations.filter((l) => l.track === num);
    if (rows.length === 0) return;
    if (!confirmDelete(rows, `track ${num} on ${selectedDate}`)) return;
    void deleteLocationRows(rows, "entries");
  };

  const handleDeleteLocation = () => {
    if (locations.length === 0) return;
    if (!confirmDelete(locations, selectedDate)) return;
    void deleteLocationRows(locations, "entries");
  };

  const handleAppendEquipment = (label: string) => {
    const current = equipmentTextRef.current;
    // Guards against a second pick landing before the menu re-renders and
    // drops the entry, which would otherwise duplicate the line.
    const existing = current.split("\n").map((line) => line.trim());
    if (existing.includes(label)) return;
    void handleDateChange(
      "equipment",
      current === "" ? label : `${current}\n${label}`
    );
  };

  const handleRemoveLastEquipment = () => {
    const lines = equipmentTextRef.current
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
    lines.pop();
    void handleDateChange("equipment", lines.join("\n"));
  };

  const handleUpdate = (id: string, fields: Record<string, unknown>) => {
    setLocations((prev) =>
      prev.map((loc) => (loc.id === id ? { ...loc, ...fields } : loc))
    );
    setDirtyLocations((prev) => new Set(prev).add(id));
  };

  const handleDelete = async (id: string) => {
    try {
      const { errors } = await client.models.Location.delete({ id });
      if (errors?.length) throw new Error(describeErrors(errors));
      setLocations((prev) => prev.filter((loc) => loc.id !== id));
      setError(null);
    } catch (err) {
      console.error("Failed to delete", err);
      setError(`Could not delete: ${messageOf(err)}`);
    }
  };

  // `trackNumber` repeats an existing track so one date can hold several
  // entries on the same track; omitting it starts a new one.
  const handleAdd = async (trackNumber?: number) => {
    const used = locations
      .map((l) => l.track)
      .filter((n): n is number => n !== null && n !== undefined);
    const track =
      trackNumber ?? (used.length === 0 ? 1 : Math.max(...used) + 1);
    try {
      const { data, errors } = await client.models.Location.create({
        date: selectedDate,
        track,
        username: RECORDED_USERNAME,
      });
      // The Amplify client reports GraphQL failures in `errors` instead of
      // throwing, so this must be checked explicitly or the click is a no-op.
      if (errors?.length) throw new Error(describeErrors(errors));
      if (!data) throw new Error("The server did not return the new record.");
      setLocations((prev) => [...prev, data]);
      setError(null);
    } catch (err) {
      console.error("Failed to create", err);
      setError(`Could not add location: ${messageOf(err)}`);
    }
  };

  return (
    <main>
      <div className="app-bar">
        <h1>Lift Station E-02 Rehabilitation</h1>
        <div className="account">
          <span className="account-email" title={email}>
            {email}
          </span>
          <button className="signout-btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>

      <div className="date-picker-row">
        <label htmlFor="date-select">Date</label>
        <input
          id="date-select"
          type="date"
          value={selectedDate}
          onChange={(e) => requestDateChange(e.target.value)}
        />
        {unsavedCount > 0 && (
          <span className="unsaved-badge">
            {unsavedCount} unsaved
          </span>
        )}
      </div>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button
            className="error-dismiss"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      <div className="content-row">
        <section className="col col-locations">
          <h2 className="col-heading">Locations</h2>
          {loading ? (
            <p className="status-text">Loading...</p>
          ) : locations.length === 0 ? (
            <p className="status-text">No locations for this date.</p>
          ) : (
            <div className="locations-list">
              {locations.map((loc) => (
                <LocationCard
                  key={loc.id}
                  location={loc}
                  dirty={dirtyLocations.has(loc.id)}
                  types={types}
                  tracks={tracks}
                  onAddTrack={() => handleAdd(loc.track ?? undefined)}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          <ApplyBar
            dirtyCount={dirtyLocations.size}
            applying={applying}
            onApply={applyLocations}
            addLabel="+ Add Location"
            onAdd={handleAdd}
            extra={
              <>
                <select
                  className="bar-select"
                  value={trackToDelete}
                  aria-label="Track to delete"
                  disabled={tracksOnDate.length === 0 || applying}
                  onChange={(e) => setTrackToDelete(e.target.value)}
                >
                  <option value="">
                    {tracksOnDate.length === 0 ? "No tracks" : "Track…"}
                  </option>
                  {tracksOnDate.map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </select>
                <button
                  className="danger-btn"
                  onClick={handleDeleteTrack}
                  disabled={trackToDelete === "" || applying}
                  title={
                    trackToDelete === ""
                      ? "Choose a track first"
                      : `Delete every entry on track ${trackToDelete}`
                  }
                >
                  Delete Track
                </button>
                <button
                  className="danger-btn"
                  onClick={handleDeleteLocation}
                  disabled={locations.length === 0 || applying}
                  title={`Delete every entry for ${selectedDate}`}
                >
                  Delete Location
                </button>
              </>
            }
          />

          <h2 className="col-heading type-heading">Track</h2>
          <LookupTable
            title="Tracks"
            rows={tracks}
            columns={[
              {
                key: "track",
                header: "Track",
                kind: "number",
                value: (t: TrackRecord) =>
                  t.track === null || t.track === undefined
                    ? ""
                    : String(t.track),
              },
              {
                key: "typeid",
                header: "Type ID",
                kind: "select",
                options: types
                  .filter((t) => (t.typeid ?? "").trim() !== "")
                  .map((t) => ({
                    value: t.typeid ?? "",
                    label: t.typeid ?? "",
                  })),
                value: (t: TrackRecord) => t.typeid ?? "",
              },
              {
                key: "type",
                header: "Type",
                kind: "readonly",
                // Resolved through the soft link rather than stored, so
                // renaming a type is reflected here immediately.
                value: (t: TrackRecord) =>
                  types.find((ty) => ty.typeid === t.typeid)?.type ?? "",
              },
            ]}
            addLabel="+ Add Track"
            emptyLabel="No tracks yet."
            deleteLabel="Delete track"
            dirtyIds={dirtyTracks}
            applying={applying}
            onUpdate={handleTrackUpdate}
            onDelete={handleTrackDelete}
            onAdd={handleTrackAdd}
            onApply={applyTracks}
          />

          <h2 className="col-heading type-heading">Type</h2>
          <LookupTable
            title="Types"
            rows={types}
            columns={[
              {
                key: "typeid",
                header: "Type ID",
                value: (t: TypeRecord) => t.typeid ?? "",
              },
              {
                key: "type",
                header: "Type",
                value: (t: TypeRecord) => t.type ?? "",
              },
            ]}
            addLabel="+ Add Type"
            emptyLabel="No types yet."
            deleteLabel="Delete type"
            dirtyIds={dirtyTypes}
            applying={applying}
            onUpdate={handleTypeUpdate}
            onDelete={handleTypeDelete}
            onAdd={handleTypeAdd}
            onApply={applyTypes}
          />

          <h2 className="col-heading type-heading">Equipment</h2>
          <LookupTable
            title="Equipment"
            rows={equipment}
            columns={[
              {
                key: "primeSub",
                header: "Prime/Sub",
                value: (e: EquipmentRecord) => e.primeSub ?? "",
              },
              {
                key: "model",
                header: "Model",
                value: (e: EquipmentRecord) => e.model ?? "",
              },
              {
                key: "equipment",
                header: "Equipment",
                value: (e: EquipmentRecord) => e.equipment ?? "",
              },
            ]}
            addLabel="+ Add Equipment"
            emptyLabel="No equipment yet."
            deleteLabel="Delete equipment"
            dirtyIds={dirtyEquipment}
            applying={applying}
            onUpdate={handleEquipmentUpdate}
            onDelete={handleEquipmentDelete}
            onAdd={handleEquipmentAdd}
            onApply={applyEquipment}
          />
        </section>

        <section className="col col-date">
          <h2 className="col-heading">Date</h2>
          <DatePanel
            record={dateRecord}
            equipmentOptions={equipment}
            onChange={handleDateChange}
            onAppendEquipment={handleAppendEquipment}
            onRemoveLastEquipment={handleRemoveLastEquipment}
          />
        </section>
      </div>
    </main>
  );
}

function App() {
  return (
    <Authenticator loginMechanisms={["email"]} signUpAttributes={["email"]}>
      {({ signOut, user }) => (
        <AuthenticatedApp signOut={signOut} userId={user?.userId} />
      )}
    </Authenticator>
  );
}

function AuthenticatedApp({
  signOut,
  userId,
}: {
  signOut?: () => void;
  userId?: string;
}) {
  const [email, setEmail] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchUserAttributes()
      .then((attrs) => {
        if (!cancelled) setEmail(attrs.email ?? "");
      })
      .catch((err) => console.error("Failed to load user attributes", err));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return <LocationsApp email={email} signOut={signOut} />;
}

export default App;
