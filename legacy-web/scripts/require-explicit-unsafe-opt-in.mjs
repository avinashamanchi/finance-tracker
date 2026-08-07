const expected = 'I_UNDERSTAND_PLAINTEXT_PASSWORD_STORAGE';

if (process.env.FINOVA_ALLOW_UNSAFE_LEGACY_WEB !== expected) {
  process.stderr.write('Blocked: this unsupported legacy demo stores plaintext passwords in browser storage.\n');
  process.exit(1);
}
