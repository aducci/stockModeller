// Every edit gets a toast, with Undo once the server has committed it (design/04-ux/design-system.md §2).
import { useWorkbench } from "../state/workbench";

export function Toasts() {
  const toasts = useWorkbench((s) => s.toasts);
  const undo = useWorkbench((s) => s.undo);
  const dismiss = useWorkbench((s) => s.dismiss);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`} role={t.tone === "error" ? "alert" : "status"}>
          <span>{t.text}</span>
          {t.changeId && (
            <button className="link" disabled={!t.committed} onClick={() => void undo(t.changeId!)}>
              Undo
            </button>
          )}
          <button className="close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
