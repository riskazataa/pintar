export interface FinalSignatureGroup {
  role: string;
  signatures: any[];
}

export function orderFinalSignatureGroups(signatures: any[]): {
  left: FinalSignatureGroup[];
  right: FinalSignatureGroup[];
} {
  const groups = new Map<string, any[]>();
  for (const signature of signatures) {
    const savedRole = (signature.jabatan || signature.role || 'Penanda tangan').trim();
    const role = /^roren$/i.test(savedRole) ? 'Biro Perencanaan' : savedRole;
    groups.set(role, [...(groups.get(role) ?? []), signature]);
  }

  const leftFixed = [
    'Petugas Unit Eselon 1',
    'Ketua Tim Kerja Marvel',
    'Ketua Tim Kerja Monev I Biro Perencanaan',
  ];
  const rightFixed = [
    'Dalnis Itjen',
    'Ketua Tim Itjen',
    'Anggota Tim Itjen',
    'Biro Perencanaan',
  ];
  const leftRoles = [...groups.keys()]
    .filter((role) => role.startsWith('Petugas BKK ('))
    .sort((a, b) => a.localeCompare(b));
  leftRoles.push(...leftFixed.filter((role) => groups.has(role)));

  const rightRoles = rightFixed.filter((role) => groups.has(role));
  rightRoles.push(
    ...[...groups.keys()].filter(
      (role) => !leftRoles.includes(role) && !rightRoles.includes(role),
    ),
  );

  return {
    left: leftRoles.map((role) => ({ role, signatures: groups.get(role)! })),
    right: rightRoles.map((role) => ({ role, signatures: groups.get(role)! })),
  };
}
