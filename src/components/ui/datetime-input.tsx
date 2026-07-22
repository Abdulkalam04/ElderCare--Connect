import { useRef, useState, useEffect, type InputHTMLAttributes } from "react";
import { CalendarDays, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
const baseClass =
  "flex h-10 w-full rounded-md border border-input bg-background text-sm ring-offset-background " +
  "placeholder:text-muted-foreground focus-within:outline-none focus-within:ring-2 " +
  "focus-within:ring-ring focus-within:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 overflow-hidden";
const inputClass =
  "flex-1 min-w-0 px-3 py-2 bg-transparent outline-none border-none " +
  "placeholder:text-muted-foreground text-sm";
interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  value?: string;
  onChange?: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
}
export function DateInput({
  value = "",
  onChange,
  min,
  max,
  placeholder = "YYYY-MM-DD",
  className,
  disabled,
  id,
  ...rest
}: DateInputProps) {
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  function handleTextChange(raw: string) {
    setText(raw);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      onChange?.(raw);
    } else if (raw === "") {
      onChange?.("");
    }
  }
  function handlePickerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setText(v);
    onChange?.(v);
  }
  function openPicker() {
    hiddenRef.current?.showPicker?.();
    hiddenRef.current?.click();
  }
  return (
    <div className={cn(baseClass, disabled && "opacity-50 cursor-not-allowed", className)}>
      <input
        id={id}
        type="text"
        className={inputClass}
        value={text}
        placeholder={placeholder}
        onChange={(e) => handleTextChange(e.target.value)}
        disabled={disabled}
        {...rest}
      />

      <div className="relative flex items-center pr-1">
        <button
          type="button"
          tabIndex={-1}
          onClick={openPicker}
          disabled={disabled}
          aria-label="Open date picker"
          className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded"
        >
          <CalendarDays className="size-4" />
        </button>
        <input
          ref={hiddenRef}
          type="date"
          value={value}
          min={min}
          max={max}
          onChange={handlePickerChange}
          tabIndex={-1}
          aria-hidden="true"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          style={{ pointerEvents: "none" }}
        />
      </div>
    </div>
  );
}
interface TimeInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}
export function TimeInput({
  value = "",
  onChange,
  placeholder = "HH:MM",
  className,
  disabled,
  id,
  ...rest
}: TimeInputProps) {
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  function handleTextChange(raw: string) {
    setText(raw);
    if (/^\d{2}:\d{2}$/.test(raw)) {
      onChange?.(raw);
    } else if (raw === "") {
      onChange?.("");
    }
  }
  function handlePickerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setText(v);
    onChange?.(v);
  }
  function openPicker() {
    hiddenRef.current?.showPicker?.();
    hiddenRef.current?.click();
  }
  return (
    <div className={cn(baseClass, disabled && "opacity-50 cursor-not-allowed", className)}>
      <input
        id={id}
        type="text"
        className={inputClass}
        value={text}
        placeholder={placeholder}
        onChange={(e) => handleTextChange(e.target.value)}
        disabled={disabled}
        {...rest}
      />
      <div className="relative flex items-center pr-1">
        <button
          type="button"
          tabIndex={-1}
          onClick={openPicker}
          disabled={disabled}
          aria-label="Open time picker"
          className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded"
        >
          <Clock className="size-4" />
        </button>
        <input
          ref={hiddenRef}
          type="time"
          value={value}
          onChange={handlePickerChange}
          tabIndex={-1}
          aria-hidden="true"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          style={{ pointerEvents: "none" }}
        />
      </div>
    </div>
  );
}
interface DateTimeInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange"
> {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}
export function DateTimeInput({
  value = "",
  onChange,
  placeholder = "YYYY-MM-DD HH:MM",
  className,
  disabled,
  id,
  ...rest
}: DateTimeInputProps) {
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value.replace("T", " "));
  useEffect(() => {
    setText(value.replace("T", " "));
  }, [value]);
  function handleTextChange(raw: string) {
    setText(raw);
    const normalized = raw.replace(" ", "T");
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) {
      onChange?.(normalized);
    } else if (raw === "") {
      onChange?.("");
    }
  }
  function handlePickerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setText(v.replace("T", " "));
    onChange?.(v);
  }
  function openPicker() {
    hiddenRef.current?.showPicker?.();
    hiddenRef.current?.click();
  }
  return (
    <div className={cn(baseClass, disabled && "opacity-50 cursor-not-allowed", className)}>
      <input
        id={id}
        type="text"
        className={inputClass}
        value={text}
        placeholder={placeholder}
        onChange={(e) => handleTextChange(e.target.value)}
        disabled={disabled}
        {...rest}
      />
      <div className="relative flex items-center pr-1">
        <button
          type="button"
          tabIndex={-1}
          onClick={openPicker}
          disabled={disabled}
          aria-label="Open date-time picker"
          className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded"
        >
          <CalendarDays className="size-4" />
        </button>
        <input
          ref={hiddenRef}
          type="datetime-local"
          value={value}
          onChange={handlePickerChange}
          tabIndex={-1}
          aria-hidden="true"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          style={{ pointerEvents: "none" }}
        />
      </div>
    </div>
  );
}
