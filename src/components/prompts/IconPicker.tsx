import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ICON_NAMES,
  iconComponentByName,
  type IconName,
} from "@/lib/prompts/icon-allowlist";

interface IconPickerProps {
  value: IconName;
  onChange: (next: IconName) => void;
  disabled?: boolean;
}

export function IconPicker({ value, onChange, disabled = false }: IconPickerProps) {
  return (
    <div className="grid grid-cols-7 gap-2" role="radiogroup" aria-label="Prompt icon">
      {ICON_NAMES.map((name) => {
        const Icon = iconComponentByName[name];
        const selected = value === name;
        return (
          <Button
            key={name}
            type="button"
            variant={selected ? "default" : "outline"}
            size="sm"
            disabled={disabled}
            role="radio"
            aria-checked={selected}
            aria-label={name}
            data-testid={`icon-picker-${name}`}
            className={cn(
              "h-9 w-9 p-0",
              selected && "ring-2 ring-primary ring-offset-1"
            )}
            onClick={() => onChange(name)}
          >
            <Icon className="h-4 w-4" />
          </Button>
        );
      })}
    </div>
  );
}
