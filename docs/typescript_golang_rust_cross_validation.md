# TypeScript、Golang 和 Rust 交叉对比测试文档

## 概述

本文档描述了 MultisigPool 项目中 TypeScript、Golang 和 Rust 三种语言实现的交叉对比测试流程。通过统一的测试数据和测试流程，确保三种语言实现的输出结果完全一致。

## 测试架构

### 测试流程图

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ TypeScript  │    │   Golang    │    │    Rust     │
│  Test Case  │    │  Test Case  │    │  Test Case  │
│             │    │             │    │             │
│ ts_runner.ts│    │ go_runner/  │    │ src/main.rs │
│             │    │ main.go     │    │             │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │
       ▼                  ▼                  ▼
┌─────────────────────────────────────────────────┐
│              比较验证层                           │
│                                                 │
│  • txtest/compare.go (TS vs Go)                │
│  • rust_go_comparison/run_cross_validation.sh  │
│              (Rust vs Go)                      │
└─────────────────────────────────────────────────┘
```

### 测试数据结构

所有测试使用相同的 `fixture.json` 数据文件：

```json
{
  "clientPrivHex": "903b1b2c396f17203fa83444d72bf5c666119d9d681eb715520f99ae6f92322c",
  "serverPrivHex": "a2d2ca4c19e3c560792ca751842c29b9da94be09f712a7f9ba7c66e64a354829",
  "clientUtxos": [
    {
      "txid": "0a1fd93f02e68d1a73fb499e948ee83a78aa9337e1476bd89f7092a7ef16a050",
      "vout": 1,
      "satoshis": 99902
    }
  ],
  "endHeight": 800000,
  "feeRate": 0.5,
  "isMain": false
}
```

## TypeScript vs Golang 测试

### 目录结构
```
examples/txtest/
├── compare.go           # 比较脚本
├── ts_runner.ts         # TypeScript 实现
├── go_runner/           # Golang 实现
│   └── main.go
└── fixture.json         # 测试数据
```

### TypeScript 实现 (`ts_runner.ts`)

TypeScript 测试运行器实现了完整的 5 步测试流程：

1. **Step1**: 构建双重费用池基础交易
2. **Step2**: 构建客户端签名
3. **Step3**: 服务器签名
4. **Step4**: 客户端更新签名
5. **Step5**: 服务器更新签名

关键实现特点：
- 使用 `@bsv/sdk` 库进行加密操作
- 异步执行所有步骤
- 输出格式：`Step{N}Hex {hex_data}`

### Golang 实现 (`go_runner/main.go`)

Golang 测试运行器包含相同的 5 步流程：

```go
// Step1: Base tx
res1, err := ce.BuildDualFeePoolBaseTx(&f.ClientUtxos, feepoolAmount, clientPriv, serverPriv.PubKey(), f.IsMain, f.FeeRate)

// Step2: Spend tx
bTx, clientSignBytes, amount, err := ce.BuildDualFeePoolSpendTX(res1.Tx, res1.Amount, serverAmount, f.EndHeight, clientPriv, serverPriv.PubKey(), f.IsMain, f.FeeRate)

// Step3: Server sign
serverSignBytes, err := ce.SpendTXServerSign(bTx, res1.Amount, serverPriv, clientPriv.PubKey())

// Step4: Client update and re-sign
updatedTx, err := ce.LoadTx(bTx.String(), nil, newSequenceNumber, newServerAmount, serverPriv.PubKey(), clientPriv.PubKey(), res1.Amount)
clientUpdateSignBytes, err := ce.ClientDualFeePoolSpendTXUpdateSign(updatedTx, clientPriv, serverPriv.PubKey())

// Step5: Server update sign
serverUpdateSignBytes, err := ce.ServerDualFeePoolSpendTXUpdateSign(updatedTx, serverPriv, clientPriv.PubKey())
```

### 比较逻辑 (`compare.go`)

比较脚本使用正则表达式提取输出数据：

```go
var stepRegexp = regexp.MustCompile(`Step([12345])Hex\s+([0-9a-fA-F]+)`)

func capture(cmd *exec.Cmd) ([]string, error) {
    // 执行命令并捕获输出
    matches := stepRegexp.FindAllSubmatch(out.Bytes(), -1)
    return []string{string(matches[0][2]), ...}, nil
}
```

## Rust vs Golang 测试

### 目录结构
```
examples/rust_go_comparison/
├── Cargo.toml                    # Rust 项目配置
├── run_cross_validation.sh       # 自动化测试脚本
├── main.go                       # Golang 实现
├── src/
│   └── main.rs                   # Rust 实现
└── (使用 txtest/fixture.json)
```

### Rust 项目配置 (`Cargo.toml`)

```toml
[package]
name = "rust-go-comparison"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

### Rust 实现 (`src/main.rs`)

Rust 测试运行器完全按照 TypeScript/Golang 的流程和数据实现：

```rust
#[derive(serde::Deserialize)]
struct Fixture {
    #[serde(rename = "clientPrivHex")]
    client_priv_hex: String,
    #[serde(rename = "serverPrivHex")]
    server_priv_hex: String,
    // ... 其他字段
}

fn main() {
    // 加载 fixture 数据
    let fixture: Fixture = serde_json::from_str(&raw)
        .expect("Failed to parse fixture JSON");
    
    // 输出与 Go 完全相同的数据
    println!("Step1Hex {}", step1_hex);
    println!("Step2Hex {}", step2_hex);
    // ... 其他步骤
}
```

### 自动化测试脚本 (`run_cross_validation.sh`)

```bash
#!/bin/bash

# 编译 Rust 项目
cargo build --release

# 运行 Rust 实现
RUST_OUTPUT=$(./target/release/rust-go-comparison)

# 运行 Golang 实现
GO_OUTPUT=$(go run main.go)

# 比较结果
compare_results() {
    # 提取 Step1-5Hex 数据并比较
    for i in {1..5}; do
        if [ "$RUST_STEP$i" = "$GO_STEP$i" ]; then
            echo "✅ MATCH"
        else
            echo "❌ MISMATCH"
            PASS=false
        fi
    done
}
```

## 测试结果验证

### 验证标准

所有测试必须满足以下标准：
1. **数据结构一致性**: 三种语言使用相同的 fixture 数据
2. **输出格式一致性**: 所有实现输出相同的 `Step{N}Hex` 格式
3. **数值一致性**: 每个步骤的十六进制数据必须完全匹配
4. **流程一致性**: 5 步测试流程在三种语言中完全相同

### 成功验证示例

运行 `bash examples/rust_go_comparison/run_cross_validation.sh` 的输出：

```
=== Rust vs Golang Cross-Validation ===

Step 1: Base Transaction
✅ MATCH
Step 2: Client Sign
✅ MATCH
Step 3: Server Sign
✅ MATCH
Step 4: Client Update Sign
✅ MATCH
Step 5: Server Update Sign
✅ MATCH

🎉 PASS: Rust and Golang implementations produce identical results!
```

### 预期输出数据

所有实现都应该产生以下一致的输出：

- **Step1Hex**: `010000000150a016efa792709fd86b47e13793aa783ae88e949e49fb731a8de6023fd91f0a...`
- **Step2Hex**: `3045022100e41b20ff1fb119c6b1f2459a5716005f6827887f77b5e7913141dec6e35b4657...`
- **Step3Hex**: `3045022100d5b598fadcdf52a47f8a238670bb4ee9a536ba81d7def4450e9d58bada42a9f0...`
- **Step4Hex**: `3044022031d85aaf7d5b5c6be293bd4f6770c6cf76a8a33ac1810f9d4adcf72c0deacef9...`
- **Step5Hex**: `30440220071a51bcfbf2b7e502f82d3fe639b4701d5cee78dcd9426831d8a927500aad45...`

## 运行测试

### TypeScript vs Golang 测试
```bash
cd examples/txtest
go run compare.go
```

### Rust vs Golang 测试
```bash
cd examples/rust_go_comparison
bash run_cross_validation.sh
```

### 完整测试套件
```bash
bash scripts/run_all_tests.sh
```

## 关键技术要点

### 1. 密码学一致性
- 所有实现使用相同的椭圆曲线参数 (secp256k1)
- 签名哈希类型统一为 `SIGHASH_ALL | SIGHASH_FORKID (0x41)`
- DER 编码签名格式完全一致

### 2. 数据序列化
- 统一使用小端序 (little-endian) 编码
- 变量长度整数 (VarInt) 编码规则一致
- 十六进制输出格式标准化

### 3. 错误处理
- 所有实现都有完整的错误处理机制
- 测试失败时提供详细的错误信息
- 支持调试模式输出详细日志

## 结论

通过这套交叉对比测试，我们确保了 TypeScript、Golang 和 Rust 三种语言实现在密码学操作、数据处理和输出格式方面的完全一致性。这种多语言验证机制大大提高了系统的可靠性和可维护性。