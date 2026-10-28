import { useMemo } from 'react';
import { allTimeZones, browserZone, formatOffset } from '../utils/tz';
import { PickerOption, SelectPicker } from './SelectPicker';

interface Props {
  value: string;
  onChange: (timeZone: string) => void;
  width: number;
}

/** Grafana's TimeZonePicker: the browser's zone, UTC and every IANA zone, with offsets. */
export function TimeZonePicker({ value, onChange, width }: Props) {
  const options = useMemo<PickerOption[]>(() => {
    const now = Date.now();
    const zones = allTimeZones()
      .filter((z) => z !== 'UTC')
      .map((z) => ({ value: z, label: z.replace(/_/g, ' '), detail: formatOffset(now, z) }));
    return [
      { value: 'browser', label: `Browser Time (${browserZone()})`, detail: formatOffset(now, 'browser') },
      { value: 'utc', label: 'Coordinated Universal Time', detail: 'UTC+00:00' },
      ...zones,
    ];
  }, []);
  return (
    <SelectPicker
      value={value}
      options={options}
      onChange={onChange}
      width={width}
      icon="clock-nine"
      searchPlaceholder="Search time zones"
      title="Time zone for absolute times and results"
    />
  );
}
