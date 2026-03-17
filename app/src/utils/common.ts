export interface LocationSetting {
  location: string;
  token: string;
}

export function getLocation(headerValue: string): LocationSetting {
  const parts = headerValue.split(' ');
  return {
    location: parts[0] || '',
    token: parts[1] || '',
  };
}

export function safeStringCompare(a: string | undefined, b: string | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function deepEqual(obj1: any, obj2: any, ignoreKeys: string[] = []): boolean {
  if (obj1 === obj2) return true;
  if (!obj1 || !obj2) return false;

  const keys1 = Object.keys(obj1).filter((k) => !ignoreKeys.includes(k));

  for (const key of keys1) {
    if (ignoreKeys.includes(key)) continue;

    const val1 = obj1[key];
    const val2 = obj2[key];

    if (typeof val1 === 'object' && typeof val2 === 'object') {
      if (!deepEqual(val1, val2, ignoreKeys)) return false;
    } else if (typeof val1 === 'string' && typeof val2 === 'string') {
      if (!safeStringCompare(val1, val2)) return false;
    } else if (val1 !== val2) {
      return false;
    }
  }

  return true;
}
