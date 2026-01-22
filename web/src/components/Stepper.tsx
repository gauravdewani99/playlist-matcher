import { useRef, useEffect, useState } from "react";
import "./Stepper.css";

interface StepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label?: string;
  circular?: boolean;
}

export function Stepper({ value, min, max, onChange, label, circular }: StepperProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startValue, setStartValue] = useState(value);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleWheel = (e: React.WheelEvent) => {
    if (isEditing) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    let newValue = value + delta;
    if (circular) {
      if (newValue > max) newValue = min;
      else if (newValue < min) newValue = max;
    } else {
      newValue = Math.max(min, Math.min(max, newValue));
    }
    onChange(newValue);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isEditing) return;
    setIsDragging(true);
    setStartY(e.clientY);
    setStartValue(value);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isEditing) return;
    setIsDragging(true);
    setStartY(e.touches[0].clientY);
    setStartValue(value);
  };

  const handleDoubleClick = () => {
    setIsEditing(true);
    setEditValue(value.toString());
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (/^\d*$/.test(val)) {
      setEditValue(val);
    }
  };

  const handleInputBlur = () => {
    commitEdit();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      commitEdit();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setEditValue("");
    }
  };

  const commitEdit = () => {
    const parsed = parseInt(editValue, 10);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      onChange(clamped);
    }
    setIsEditing(false);
    setEditValue("");
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const delta = Math.round((startY - e.clientY) / 15);
      let newValue = startValue + delta;
      if (circular) {
        const range = max - min + 1;
        newValue = ((newValue - min) % range + range) % range + min;
      } else {
        newValue = Math.max(min, Math.min(max, newValue));
      }
      onChange(newValue);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      const delta = Math.round((startY - e.touches[0].clientY) / 15);
      let newValue = startValue + delta;
      if (circular) {
        const range = max - min + 1;
        newValue = ((newValue - min) % range + range) % range + min;
      } else {
        newValue = Math.max(min, Math.min(max, newValue));
      }
      onChange(newValue);
    };

    const handleEnd = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleEnd);
      window.addEventListener("touchmove", handleTouchMove);
      window.addEventListener("touchend", handleEnd);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [isDragging, startY, startValue, min, max, onChange, circular]);

  const increment = () => {
    let newValue = value + 1;
    if (circular && newValue > max) {
      newValue = min;
    } else if (!circular && newValue > max) {
      return;
    }
    onChange(newValue);
  };

  const decrement = () => {
    let newValue = value - 1;
    if (circular && newValue < min) {
      newValue = max;
    } else if (!circular && newValue < min) {
      return;
    }
    onChange(newValue);
  };

  return (
    <div className="stepper-wrapper">
      {label && <span className="stepper-label">{label}</span>}
      <div
        ref={containerRef}
        className={`stepper-container ${isDragging ? "dragging" : ""}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onDoubleClick={handleDoubleClick}
      >
        <button
          className="stepper-btn stepper-btn-up"
          onClick={(e) => { e.stopPropagation(); increment(); }}
          aria-label="Increase"
        >
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4l4 4H4l4-4z" />
          </svg>
        </button>

        <div className="stepper-display">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              className="stepper-input"
              value={editValue}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="stepper-value">{value}</span>
          )}
        </div>

        <button
          className="stepper-btn stepper-btn-down"
          onClick={(e) => { e.stopPropagation(); decrement(); }}
          aria-label="Decrease"
        >
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 12l-4-4h8l-4 4z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Hour-only stepper (circular 0-23)
interface HourStepperProps {
  value: number;
  onChange: (value: number) => void;
}

export function HourStepper({ value, onChange }: HourStepperProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startValue, setStartValue] = useState(value);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleWheel = (e: React.WheelEvent) => {
    if (isEditing) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    let newValue = value + delta;
    // Circular: 23 -> 0 and 0 -> 23
    if (newValue > 23) newValue = 0;
    else if (newValue < 0) newValue = 23;
    onChange(newValue);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isEditing) return;
    setIsDragging(true);
    setStartY(e.clientY);
    setStartValue(value);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isEditing) return;
    setIsDragging(true);
    setStartY(e.touches[0].clientY);
    setStartValue(value);
  };

  const handleDoubleClick = () => {
    setIsEditing(true);
    setEditValue(value.toString());
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (/^\d*$/.test(val) && val.length <= 2) {
      setEditValue(val);
    }
  };

  const handleInputBlur = () => {
    commitEdit();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      commitEdit();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setEditValue("");
    }
  };

  const commitEdit = () => {
    const parsed = parseInt(editValue, 10);
    if (!isNaN(parsed)) {
      const clamped = Math.max(0, Math.min(23, parsed));
      onChange(clamped);
    }
    setIsEditing(false);
    setEditValue("");
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const delta = Math.round((startY - e.clientY) / 15);
      let newValue = startValue + delta;
      // Circular wrap
      newValue = ((newValue % 24) + 24) % 24;
      onChange(newValue);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      const delta = Math.round((startY - e.touches[0].clientY) / 15);
      let newValue = startValue + delta;
      // Circular wrap
      newValue = ((newValue % 24) + 24) % 24;
      onChange(newValue);
    };

    const handleEnd = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleEnd);
      window.addEventListener("touchmove", handleTouchMove);
      window.addEventListener("touchend", handleEnd);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [isDragging, startY, startValue, onChange]);

  const increment = () => {
    let newValue = value + 1;
    if (newValue > 23) newValue = 0;
    onChange(newValue);
  };

  const decrement = () => {
    let newValue = value - 1;
    if (newValue < 0) newValue = 23;
    onChange(newValue);
  };

  const displayValue = value.toString().padStart(2, "0");

  return (
    <div className="stepper-wrapper">
      <div
        ref={containerRef}
        className={`stepper-container ${isDragging ? "dragging" : ""}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onDoubleClick={handleDoubleClick}
      >
        <button
          className="stepper-btn stepper-btn-up"
          onClick={(e) => { e.stopPropagation(); increment(); }}
          aria-label="Increase hour"
        >
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4l4 4H4l4-4z" />
          </svg>
        </button>

        <div className="stepper-display">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              className="stepper-input"
              value={editValue}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="stepper-value">{displayValue}</span>
          )}
        </div>

        <button
          className="stepper-btn stepper-btn-down"
          onClick={(e) => { e.stopPropagation(); decrement(); }}
          aria-label="Decrease hour"
        >
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 12l-4-4h8l-4 4z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Legacy exports for backwards compatibility
export function TimeStepperCombined({ hours, onChange }: { hours: number; minutes: number; onChange: (hours: number, minutes: number) => void }) {
  return <HourStepper value={hours} onChange={(h) => onChange(h, 0)} />;
}

export function TimePicker({ hours, onHoursChange }: {
  hours: number;
  minutes: number;
  onHoursChange: (hours: number) => void;
  onMinutesChange: (minutes: number) => void;
  compact?: boolean;
}) {
  return <HourStepper value={hours} onChange={onHoursChange} />;
}
