import {
  createEncryptedBackup,
  openEncryptedBackup,
} from '../src/services/backupCrypto';

const counts = {
  manifest: 1,
  ledger: 1,
  transaction: 2,
  budget_plan: 1,
  recurring_template: 0,
  expected_occurrence: 0,
  savings_goal: 0,
  goal_contribution: 0,
} as const;

const deterministicRandom = (() => {
  let seed = 0;
  return async (length: number) => Uint8Array.from(
    { length },
    () => (seed++ * 17 + 11) & 0xff,
  );
})();

describe('Finova v2 authenticated backup frames', () => {
  it('round-trips framed plaintext with production format metadata', async () => {
    const frames = [
      new TextEncoder().encode('{"kind":"manifest"}\n{"kind":"ledger"}\n'),
      new TextEncoder().encode('{"kind":"transaction","id":"a"}\n'),
    ];
    const encrypted = await createEncryptedBackup({
      password: 'correct horse battery staple',
      counts,
      frames,
      randomBytes: deterministicRandom,
    });
    const opened = await openEncryptedBackup(encrypted, 'correct horse battery staple');
    expect(opened.header).toMatchObject({
      version: 2,
      kdf: 'scrypt',
      cipher: 'xchacha20-poly1305',
      frameBytes: 65_536,
      counts,
    });
    expect(opened.frames.map((frame) => new TextDecoder().decode(frame))).toEqual([
      '{"kind":"manifest"}\n{"kind":"ledger"}\n',
      '{"kind":"transaction","id":"a"}\n',
    ]);
  });

  it('uses one generic failure for wrong passwords, tampering, and truncation', async () => {
    const encrypted = await createEncryptedBackup({
      password: 'correct horse battery staple',
      counts,
      frames: [new TextEncoder().encode('{"kind":"manifest"}\n')],
      randomBytes: deterministicRandom,
    });
    await expect(openEncryptedBackup(encrypted, 'wrong password value'))
      .rejects.toThrow('password or file');
    const tampered = encrypted.slice();
    tampered[Math.floor(tampered.length / 2)] ^= 0x40;
    await expect(openEncryptedBackup(tampered, 'correct horse battery staple'))
      .rejects.toThrow('password or file');
    await expect(openEncryptedBackup(encrypted.slice(0, -1), 'correct horse battery staple'))
      .rejects.toThrow('password or file');
  });

  it('rejects weak, oversized, and transport-unsafe passwords before derivation', async () => {
    const attempt = (password: string) => createEncryptedBackup({
      password,
      counts,
      frames: [],
      randomBytes: deterministicRandom,
    });
    await expect(attempt('too short')).rejects.toThrow('12 to 128');
    await expect(attempt('x'.repeat(129))).rejects.toThrow('12 to 128');
    await expect(attempt('valid length\u0000but unsafe')).rejects.toThrow('supported characters');
    await expect(attempt(`valid length ${String.fromCharCode(0xd800)}`)).rejects.toThrow('supported characters');
  });
});
