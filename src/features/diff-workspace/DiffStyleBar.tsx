import { IconButton } from "@/design/IconButton";
import type { AppSettings } from "@/shared/types/app";

interface DiffStyleBarProps {
  settings: AppSettings;
  fileCount: number;
  onChangeDiffStyle: (diffStyle: AppSettings["diffStyle"]) => void;
}

export function DiffStyleBar({
  settings,
  fileCount,
  onChangeDiffStyle,
}: DiffStyleBarProps) {
  return (
    <div className="diff-style-bar icon-toolbar">
      <IconButton
        name="split"
        size="sm"
        active={settings.diffStyle === "split"}
        onClick={() => onChangeDiffStyle("split")}
      />
      <IconButton
        name="unified"
        size="sm"
        active={settings.diffStyle === "unified"}
        onClick={() => onChangeDiffStyle("unified")}
      />
      <span className="diff-style-spacer" />
      <span className="diff-style-count">
        {fileCount} changed file{fileCount === 1 ? "" : "s"}
      </span>
    </div>
  );
}
