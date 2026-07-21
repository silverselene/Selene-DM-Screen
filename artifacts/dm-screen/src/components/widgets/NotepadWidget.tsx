import { useLocalStorage } from "@/hooks/useLocalStorage";
import { NOTEPAD_MAX_CHARS, type ShapeValidator } from "@/lib/backup";
import { createSingletonSlot } from "@/lib/singletonWidget";
import { SingletonGate } from "@/lib/SingletonGate";
import { FileText, Trash2 } from "lucide-react";

// Defend the read path with the same cap the backup-import path enforces —
// but TRUNCATE an over-length string instead of rejecting it. Rejection
// resets the textarea to "", and the first keystroke then overwrites the
// stored original: a note written by a pre-cap build would be destroyed by
// the upgrade rather than by any user action. Truncating keeps the first
// 1 MB and warns. Non-strings (DevTools edit, future write bug) still
// heal to "". (The backup importer deliberately differs: it REJECTS an
// over-length note and reports the key in `skipped`, so an import never
// silently drops content — here the alternative to truncation is loss of
// the whole note.)
const validateNotes: ShapeValidator<string> = (parsed) => {
  if (typeof parsed !== "string") return undefined;
  if (parsed.length > NOTEPAD_MAX_CHARS) {
    console.warn(
      `NotepadWidget: stored note exceeds ${NOTEPAD_MAX_CHARS} chars; truncating (legacy pre-cap value?)`,
    );
    return parsed.slice(0, NOTEPAD_MAX_CHARS);
  }
  return parsed;
};

const NOTEPAD_MOUNT_SLOT = createSingletonSlot();

// Notepad persists typed prose on the single `dm-notepad` key, so a second live
// tile would clobber it last-writer-wins — the singleton guard prevents that.
export function NotepadWidget() {
  return (
    <SingletonGate
      slot={NOTEPAD_MOUNT_SLOT}
      name="Notepad"
      icon={<FileText className="w-6 h-6 text-amber-400/70" />}
    >
      <NotepadBody />
    </SingletonGate>
  );
}

function NotepadBody() {
  // Debounce the storage write: the note is re-serialized in full on every
  // keystroke and can legitimately reach ~1 MB, so a synchronous setItem in
  // the keydown path degrades linearly (and silently) as the note grows.
  // React state still updates per keystroke; the write lands 300 ms after
  // typing pauses and is flushed on unmount / tab-hide / pagehide, and
  // before the backup export/import sweeps (pendingWrites registry), so
  // a backup taken mid-debounce can't miss the newest keystrokes.
  const [notes, setNotes] = useLocalStorage<string>("dm-notepad", "", validateNotes, {
    debounceWriteMs: 300,
  });

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <FileText className="w-3 h-3 text-purple-400" />
          Session Scratches
        </div>
        <button
          onClick={() => {
            if (notes.length && !window.confirm("Clear all notes? This can't be undone.")) return;
            setNotes("");
          }}
          title="Clear all notes"
          className="flex items-center gap-1 text-xs text-gray-600 hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Clear
        </button>
      </div>
      <textarea
        value={notes}
        // Cap the WRITE path at the same limit the read validator and backup
        // import enforce, so a note can never grow past the point where it
        // would silently heal to "" on the next reload. Beyond this the read
        // validator only fires on genuinely corrupt/external values.
        maxLength={NOTEPAD_MAX_CHARS}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Jot down anything — monster HP, NPC names, plot hooks, treasure deals…"
        className="flex-1 resize-none bg-gray-900/80 border border-purple-800/30 rounded p-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/60 leading-relaxed font-mono"
        style={{
          backgroundImage: "repeating-linear-gradient(transparent, transparent 19px, rgba(139, 43, 226, 0.06) 19px, rgba(139, 43, 226, 0.06) 20px)",
          backgroundAttachment: "local",
        }}
      />
      <div className="text-xs text-gray-700 mt-1 text-right">
        {notes.length > 0 ? `${notes.length} chars` : "Auto-saves"}
      </div>
    </div>
  );
}
