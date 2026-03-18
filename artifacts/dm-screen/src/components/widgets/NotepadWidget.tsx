import { useLocalStorage } from "@/hooks/useLocalStorage";
import { FileText, Trash2 } from "lucide-react";

export function NotepadWidget() {
  const [notes, setNotes] = useLocalStorage<string>("dm-notepad", "");

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <FileText className="w-3 h-3 text-purple-400" />
          Session Scratches
        </div>
        <button
          onClick={() => setNotes("")}
          className="flex items-center gap-1 text-xs text-gray-600 hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Clear
        </button>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Jot down anything — monster HP, NPC names, plot hooks, treasure deals..."
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
