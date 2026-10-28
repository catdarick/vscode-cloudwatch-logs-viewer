import { useCallback, useEffect, useState } from 'react';
import { request } from '../host';
import { SelectPicker } from '../ui/SelectPicker';

interface Props {
  /** Empty: the default credential chain. */
  value: string;
  onChange: (profile: string) => void;
  width: number;
}

const DEFAULT_LABEL = 'Default credentials';

/** Where Grafana picks a CloudWatch data source: which AWS profile the queries run with. */
export function ProfilePicker({ value, onChange, width }: Props) {
  const [profiles, setProfiles] = useState<string[]>([]);
  const load = useCallback(() => {
    request('listProfiles', {}).then(setProfiles, () => setProfiles([]));
  }, []);
  useEffect(load, [load]);

  const options = [
    { value: '', label: DEFAULT_LABEL, detail: 'AWS_PROFILE or default' },
    ...profiles.filter((p) => p !== '').map((p) => ({ value: p, label: p })),
  ];
  if (value && !profiles.includes(value)) {
    options.push({ value, label: value, detail: 'not in ~/.aws' });
  }

  return (
    <SelectPicker
      value={value}
      options={options}
      onChange={onChange}
      onOpen={load}
      width={width}
      icon="user"
      searchPlaceholder="Search AWS profiles"
      title="AWS profile the queries run with"
      footer="Profiles from ~/.aws/config and ~/.aws/credentials. For SSO, run aws sso login --profile <name> first."
    />
  );
}
