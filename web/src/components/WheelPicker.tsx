import { useRef, useEffect, useState, useCallback } from "react";
import "./WheelPicker.css";

interface WheelPickerProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label?: string;
  suffix?: string;
  formatValue?: (value: number) => string;
  triggerFormatValue?: (value: number) => string;
}

export function WheelPicker({ value, min, max, onChange, label, suffix, formatValue, triggerFormatValue }: WheelPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemHeight = 44;
  const visibleItems = 5;

  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  // Use triggerFormatValue for the button display, fall back to formatValue or raw value
  const displayValue = triggerFormatValue ? triggerFormatValue(value) : (formatValue ? formatValue(value) : value.toString());

  useEffect(() => {
    if (isOpen) {
      setTempValue(value);
      // Scroll to current value
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          const index = value - min;
          scrollRef.current.scrollTop = index * itemHeight;
        }
      });
    }
  }, [isOpen, value, min]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const scrollTop = scrollRef.current.scrollTop;
    const index = Math.round(scrollTop / itemHeight);
    const newValue = Math.max(min, Math.min(max, min + index));
    setTempValue(newValue);
  }, [min, max]);

  const handleConfirm = () => {
    onChange(tempValue);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  const handleItemClick = (itemValue: number) => {
    setTempValue(itemValue);
    if (scrollRef.current) {
      const index = itemValue - min;
      scrollRef.current.scrollTo({
        top: index * itemHeight,
        behavior: "smooth"
      });
    }
  };

  return (
    <>
      <button className="wheel-picker-trigger" onClick={() => setIsOpen(true)}>
        <span className="wheel-picker-value">{displayValue}</span>
        {suffix && <span className="wheel-picker-suffix">{suffix}</span>}
      </button>

      {isOpen && (
        <div className="wheel-picker-overlay" onClick={handleCancel}>
          <div className="wheel-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wheel-picker-header">
              <button className="wheel-picker-cancel" onClick={handleCancel}>
                Cancel
              </button>
              {label && <span className="wheel-picker-label">{label}</span>}
              <button className="wheel-picker-done" onClick={handleConfirm}>
                Done
              </button>
            </div>

            <div className="wheel-picker-container">
              <div className="wheel-picker-highlight" />
              <div
                ref={scrollRef}
                className="wheel-picker-scroll"
                onScroll={handleScroll}
                style={{
                  height: itemHeight * visibleItems,
                  paddingTop: itemHeight * 2,
                  paddingBottom: itemHeight * 2,
                }}
              >
                {options.map((opt) => (
                  <div
                    key={opt}
                    className={`wheel-picker-item ${opt === tempValue ? "selected" : ""}`}
                    style={{ height: itemHeight }}
                    onClick={() => handleItemClick(opt)}
                  >
                    {formatValue ? formatValue(opt) : opt}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Hour wheel picker with AM/PM display
interface HourWheelPickerProps {
  value: number;
  onChange: (value: number) => void;
}

export function HourWheelPicker({ value, onChange }: HourWheelPickerProps) {
  // Format for the scrollable list (shows full time with AM/PM)
  const formatHourInPicker = (hour: number): string => {
    if (hour === 0) return "12:00 AM";
    if (hour === 12) return "12:00 PM";
    if (hour < 12) return `${hour}:00 AM`;
    return `${hour - 12}:00 PM`;
  };

  // Format for the trigger button (just the hour number)
  const formatHourForTrigger = (hour: number): string => {
    if (hour === 0) return "12";
    if (hour === 12) return "12";
    if (hour < 12) return `${hour}`;
    return `${hour - 12}`;
  };

  // Get AM/PM suffix for the trigger button
  const getAmPm = (hour: number): string => {
    return hour < 12 ? "AM" : "PM";
  };

  return (
    <WheelPicker
      value={value}
      min={0}
      max={23}
      onChange={onChange}
      label="Select Time"
      formatValue={formatHourInPicker}
      triggerFormatValue={formatHourForTrigger}
      suffix={getAmPm(value)}
    />
  );
}

// Helper to format hour for display outside the picker
export function formatHourDisplay(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}
