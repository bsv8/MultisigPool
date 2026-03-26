import Script from '@bsv/sdk/script/Script';
import OP from '@bsv/sdk/script/OP';

export type OpReturnPayload = Uint8Array | number[];

// buildOptionalOpReturnScript 为费用池付款证明构造可选 OP_RETURN 锁定脚本。
// 设计说明：
// - 这里严格按原始字节写入，避免把二进制 proof 当成文本处理；
// - 空 payload 返回 null，调用方保持旧输出结构，不额外生成数据输出。
export function buildOptionalOpReturnScript(payload?: OpReturnPayload | null): Script | null {
  if (payload == null) {
    return null;
  }

  const raw = Array.from(payload);
  if (raw.length === 0) {
    return null;
  }

  const script = new Script([]);
  script.writeOpCode(OP.OP_0);
  script.writeOpCode(OP.OP_RETURN);
  script.writeBin(raw);
  return script;
}
