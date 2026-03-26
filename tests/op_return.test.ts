import { buildOptionalOpReturnScript } from '../src/libs/OP_RETURN';

describe('OP_RETURN helper', () => {
  test('should keep legacy behavior for empty payload', () => {
    expect(buildOptionalOpReturnScript()).toBeNull();
    expect(buildOptionalOpReturnScript([])).toBeNull();
  });

  test('should preserve binary payload bytes', () => {
    const payload = Uint8Array.from([0x00, 0x01, 0xff, 0x10, 0x70, 0x80]);
    const script = buildOptionalOpReturnScript(payload);

    expect(script).not.toBeNull();
    expect(script!.toHex()).toBe('006a060001ff107080');
  });
});
