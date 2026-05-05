import {
  FileText,
  Sparkles,
  Mail,
  GitCommit,
  Pencil,
  BookOpen,
  List,
  MessageSquare,
  Briefcase,
  Hash,
  Scissors,
  Type,
  StickyNote,
  Terminal,
  Star,
  Zap,
  type LucideIcon,
} from "lucide-react";

export const ICON_NAMES = [
  "FileText",
  "Sparkles",
  "Mail",
  "GitCommit",
  "Pencil",
  "BookOpen",
  "List",
  "MessageSquare",
  "Briefcase",
  "Hash",
  "Scissors",
  "Type",
  "StickyNote",
  "Terminal",
  "Star",
  "Zap",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export const iconComponentByName: Record<IconName, LucideIcon> = {
  FileText,
  Sparkles,
  Mail,
  GitCommit,
  Pencil,
  BookOpen,
  List,
  MessageSquare,
  Briefcase,
  Hash,
  Scissors,
  Type,
  StickyNote,
  Terminal,
  Star,
  Zap,
};

export function isIconName(value: string): value is IconName {
  return (ICON_NAMES as readonly string[]).includes(value);
}

export function resolveIcon(name: string): LucideIcon {
  if (isIconName(name)) {
    return iconComponentByName[name];
  }
  return FileText;
}
