// Icons for the explorer's own items. Objects draw as their type's line glyph in its colour (notation §2); views
// draw as a filled tile with their kind inside, and folders as a plain folder, so the three never look alike.
import type { ViewKind } from "@connectome/model";

const VIEW_PATHS: Record<ViewKind, string> = {
  canvas: "M3.5 3.5h4v3h-4zM8.5 9.5h4v3h-4zM5.5 6.5v4.5h3",
  matrix: "M3.5 3.5h9v9h-9zM3.5 6.5h9M3.5 9.5h9M6.5 3.5v9M9.5 3.5v9",
  document: "M4.5 3h7v10h-7zM6.5 6h3M6.5 8h3M6.5 10h2",
  sequence: "M5 3v10M11 3v10M5 6h5.5M9 4.5l1.5 1.5L9 7.5M11 10H5.5M7 8.5L5.5 10 7 11.5",
  cxn: "M3 4h3M3 8h3M3 12h3M10 4h3M10 8h3M10 12h3M6 4l4 4M6 8l4 4",
};

/** A view (diagram, matrix, document, sequence or CXN Builder): its kind on a filled tile. */
export function ViewIcon({ kind, size = 14 }: { kind: ViewKind; size?: number }) {
  return (
    <svg className="view-icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="0.5" y="0.5" width="15" height="15" rx="3" className="tile" />
      <path d={VIEW_PATHS[kind]} fill="none" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A folder. */
export function FolderIcon({ size = 14 }: { size?: number }) {
  return (
    <svg className="folder-icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M1.5 3.5h4.5l1.5 1.5h7v8h-13z" strokeWidth={1.3} strokeLinejoin="round" />
    </svg>
  );
}
