import React, { useState, useMemo } from 'react';
import Modal from './Modal';
import Button from './Button';

interface ScheduleSendModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (sendAt: string, timezone: string) => Promise<void>;
  documentTitle: string;
}

const COMMON_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (US)' },
  { value: 'America/Chicago', label: 'Central Time (US)' },
  { value: 'America/Denver', label: 'Mountain Time (US)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Africa/Johannesburg', label: 'South Africa (SAST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  { value: 'UTC', label: 'UTC' },
];

/**
 * Format a date to YYYY-MM-DD for date input
 */
const formatDateForInput = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

/**
 * Calculate time until a date in human-readable format
 */
const getTimeUntil = (targetDate: Date): string => {
  const now = new Date();
  const diff = targetDate.getTime() - now.getTime();

  if (diff < 0) return 'in the past';

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `in ${days} day${days > 1 ? 's' : ''} and ${hours % 24} hour${hours % 24 !== 1 ? 's' : ''}`;
  }
  if (hours > 0) {
    return `in ${hours} hour${hours > 1 ? 's' : ''} and ${minutes % 60} minute${minutes % 60 !== 1 ? 's' : ''}`;
  }
  return `in ${minutes} minute${minutes !== 1 ? 's' : ''}`;
};

export const ScheduleSendModal: React.FC<ScheduleSendModalProps> = ({
  isOpen,
  onClose,
  onSchedule,
  documentTitle,
}) => {
  // Default to tomorrow at 9:00 AM
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  const [date, setDate] = useState(formatDateForInput(tomorrow));
  const [time, setTime] = useState('09:00');
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate min/max dates
  const minDate = formatDateForInput(new Date());
  const maxDate = useMemo(() => {
    const max = new Date();
    max.setDate(max.getDate() + 30);
    return formatDateForInput(max);
  }, []);

  // Calculate the scheduled time and preview
  const scheduledDateTime = useMemo(() => {
    const [year, month, day] = date.split('-').map(Number);
    const [hours, minutes] = time.split(':').map(Number);
    return new Date(year, month - 1, day, hours, minutes);
  }, [date, time]);

  const isValidTime = useMemo(() => {
    const minTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
    return scheduledDateTime > minTime;
  }, [scheduledDateTime]);

  const handleSubmit = async () => {
    setError(null);

    if (!isValidTime) {
      setError('Scheduled time must be at least 5 minutes in the future');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSchedule(scheduledDateTime.toISOString(), timezone);
      onClose();
    } catch (err) {
      // Extract error message from Axios error response
      const axiosError = err as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message
        || (err as Error).message
        || 'Failed to schedule document';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Schedule Send" width="450px">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-base-content/70">
          Schedule "<span className="font-medium">{documentTitle}</span>" to be sent at a specific time.
        </p>

        {error && (
          <div className="alert alert-error">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="stroke-current shrink-0 h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Date</span>
          </label>
          <input
            type="date"
            className="input input-bordered w-full"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={minDate}
            max={maxDate}
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Time</span>
          </label>
          <input
            type="time"
            className="input input-bordered w-full"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Timezone</span>
          </label>
          <select
            className="select select-bordered w-full"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>

        {/* Preview */}
        <div className="p-4 bg-base-200 rounded-lg">
          <div className="text-sm text-base-content/70 mb-1">Document will be sent:</div>
          <div className="font-medium">
            {scheduledDateTime.toLocaleDateString(undefined, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>
          <div className="text-sm text-base-content/70">
            at {scheduledDateTime.toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            })} ({COMMON_TIMEZONES.find(tz => tz.value === timezone)?.label || timezone})
          </div>
          {isValidTime && (
            <div className="text-sm text-primary mt-2">
              {getTimeUntil(scheduledDateTime)}
            </div>
          )}
          {!isValidTime && (
            <div className="text-sm text-error mt-2">
              Must be at least 5 minutes in the future
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isSubmitting || !isValidTime}
            loading={isSubmitting}
          >
            Schedule Send
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ScheduleSendModal;
