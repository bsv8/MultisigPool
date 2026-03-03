import { PrivateKey, PublicKey } from '@bsv/sdk/primitives';
import Script from '@bsv/sdk/script/Script';
import Transaction from '@bsv/sdk/transaction/Transaction';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
import Signature from '@bsv/sdk/primitives/Signature';
// import { BaseChain } from '../tx/BaseChain';
// import { API } from '../2api/api';
import OP from '@bsv/sdk/script/OP';
import LockingScript from '@bsv/sdk/script/LockingScript';
import UnlockingScript from '@bsv/sdk/script/UnlockingScript';
import { hash256 } from '@bsv/sdk/primitives/Hash';
// import { fromBase58Check } from '@bsv/sdk/primitives/utils';

// 定义 SigHash 常量，与 Go SDK 保持一致
const SigHash = {
	SIGHASH_ALL: TransactionSignature.SIGHASH_ALL,
	FORKID: TransactionSignature.SIGHASH_FORKID
};

/**
 * TripleEndpointPoolScript 类包含三方多签交易的脚本工具函数
 * 这个类提供了脚本创建、签名合并和验证等辅助功能
 *
 * 主要功能：
 * 1. 构建三方多签脚本
 * 2. 合并多个签名到交易中
 * 3. 验证签名的有效性
 * 4. 提供各种脚本工具函数
 *
 * 与 Go 版本对应的函数：
 * - tripleFeePoolSpentScript -> TripleFeePoolSpentScript
 * - mergeTripleFeePoolSigForSpendTx -> MergeTripleFeePoolSigForSpendTx
 * - verifySignature -> VerifySignature
 */
// export class TripleEndpointPoolScript  {
// 	/**
// 	 * 构造函数
// 	 * @param isMainnet 是否使用主网
// 	 */
// 	// constructor(isMainnet: boolean, apiType: 'bitails' | 'whatsonchain') {
// 	// 	super(isMainnet, apiType);
// 	// }

	/**
	 * 构建三方费用池的花费脚本
	 * 创建 2-of-3 多签锁定脚本
	 *
	 * @param serverPublicKey 服务器公钥
	 * @param aPublicKey A方公钥
	 * @param bPublicKey B方公钥
	 * @returns 多签脚本
	 */
	export function tripleFeePoolSpentScript(
		serverPublicKey: PublicKey,
		aPublicKey: PublicKey,
		bPublicKey: PublicKey
	): Script {
		try {
			const script = new Script([]);

			// 添加阈值 OP_2（需要2个签名）
			script.writeOpCode(OP.OP_2);

			// 添加三个公钥
			script.writeBin(serverPublicKey.toDER() as number[]);
			script.writeBin(aPublicKey.toDER() as number[]);
			script.writeBin(bPublicKey.toDER() as number[]);

			// 添加公钥数量 OP_3 和 CHECKMULTISIG
			script.writeOpCode(OP.OP_3);
			script.writeOpCode(OP.OP_CHECKMULTISIG);

			console.log('三方多签脚本创建成功');
			console.log('脚本hex:', script.toHex());

			return script;
		} catch (error) {
			throw new Error(`创建多签脚本失败: ${error}`);
		}
	}

	/**
	 * 合并三方费用池签名并创建花费交易
	 * 从创建花费脚本，合并客户端签名
	 *
	 * @param txHex 交易的十六进制字符串
	 * @param aSignBytes A方签名字节
	 * @param bSignBytes B方签名字节
	 * @returns 合并签名后的交易
	 */
	export function  tripleMergeFeePoolSigForSpendTx(
		tx: Transaction,
		aSignBytes: Buffer,
		bSignBytes: Buffer
	): Transaction {
		try {
			// 从 hex 恢复交易
			// const tx = Transaction.fromHex(txHex);

			// 创建多签解锁脚本
			const unlockScript = new Script([]);

			// 添加 OP_0（多签的 off-by-one bug）
			unlockScript.writeOpCode(OP.OP_0);

			// 添加签名（按顺序）
			// 将 Buffer 转换为 number[] 类型
			unlockScript.writeBin(Array.from(aSignBytes));
			unlockScript.writeBin(Array.from(bSignBytes));

			// 设置解锁脚本
			tx.inputs[0].unlockingScript = new UnlockingScript();
			tx.inputs[0].unlockingScript.chunks = unlockScript.chunks;

			console.log('签名合并完成');
			console.log('交易hex:', tx.toHex());

			return tx;
		} catch (error) {
			throw new Error(`合并签名失败: ${error}`);
		}
	}

	/**
	 * 验证签名是否正确
	 * 验证指定公钥对应的签名是否有效
	 *
	 * @param tx 交易对象
	 * @param inputIndex 输入索引
	 * @param publicKey 公钥
	 * @param signBytes 签名字节（包含sighash标志）
	 * @returns 验证结果
	 */
	export async function tripleVerifySignature(
		tx: Transaction,
		inputIndex: number,
		publicKey: PublicKey,
		signBytes: number[]
	): Promise<boolean> {
		try {
			// 检查基本参数
			if (!tx || !tx.inputs || inputIndex >= tx.inputs.length) {
				console.error('无效的交易或输入索引');
				return false;
			}

			if (!signBytes || signBytes.length === 0) {
				console.error('签名字节为空');
				return false;
			}

			// 检查签名格式：最后一个字节应该是 sighash 标志
			const expectedSighash = SigHash.SIGHASH_ALL | SigHash.FORKID;
			const actualSighash = signBytes[signBytes.length - 1];

			if (actualSighash !== expectedSighash) {
				console.error(`签名哈希标志不匹配，期望: ${expectedSighash}, 实际: ${actualSighash}`);
				return false;
			}

			// 提取签名字节（去掉最后一个sighash标志字节）
			const signatureBytes = signBytes.slice(0, -1);

			// 解析DER格式的签名
			let signature: Signature;
			try {
				signature = Signature.fromDER(signatureBytes);
			} catch (error) {
				console.error('解析DER签名失败:', error);
				return false;
			}

			// 获取源交易输出信息
			const input = tx.inputs[inputIndex];
			if (!input.sourceTransaction) {
				console.error('缺少源交易信息');
				return false;
			}

			const sourceOutput = input.sourceTransaction.outputs[input.sourceOutputIndex];
			if (!sourceOutput) {
				console.error('无效的源输出');
				return false;
			}

			// 创建签名哈希数据
			const sighashData = TransactionSignature.format({
				sourceTXID: input.sourceTXID || '',
				sourceOutputIndex: input.sourceOutputIndex,
				sourceSatoshis: sourceOutput.satoshis || 0,
				transactionVersion: tx.version,
				otherInputs: tx.inputs.filter((_, idx) => idx !== inputIndex),
				outputs: tx.outputs,
				inputIndex: inputIndex,
				subscript: sourceOutput.lockingScript,
				inputSequence: input.sequence || 0xffffffff,
				lockTime: tx.lockTime,
				scope: expectedSighash
			});

			// 计算哈希
			const hash = hash256(sighashData);

			// 验证签名
			const isValid = publicKey.verify(hash, signature);

			if (isValid) {
				console.log('签名验证成功');
			} else {
				console.error('签名验证失败');
			}

			return isValid;
		} catch (error) {
			console.error('验证签名时出错:', error);
			return false;
		}
	}

	/**
	 * 批量验证多个签名
	 * @param tx 交易对象
	 * @param inputIndex 输入索引
	 * @param signatures 签名数组，包含公钥和签名字节的对应关系
	 * @returns 验证结果数组
	 */
	export async function tripleverifyMultipleSignatures(
		tx: Transaction,
		inputIndex: number,
		signatures: Array<{ publicKey: PublicKey; signBytes: number[] }>
	): Promise<Array<{ publicKey: string; isValid: boolean; error?: string }>> {
		const results: Array<{ publicKey: string; isValid: boolean; error?: string }> = [];

		for (const sig of signatures) {
			try {
				const isValid = await tripleVerifySignature(tx, inputIndex, sig.publicKey, sig.signBytes);
				results.push({
					publicKey: sig.publicKey.toAddress(),
					isValid
				});
			} catch (error) {
				results.push({
					publicKey: sig.publicKey.toAddress(),
					isValid: false,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}

		return results;
	}

	/**
	 * 创建签名模板
	 * 用于生成待签名的数据
	 *
	 * @param tx 交易对象
	 * @param inputIndex 输入索引
	 * @param lockingScript 锁定脚本
	 * @returns 签名哈希数据
	 */
	export function triplecreateSignatureTemplate(
		tx: Transaction,
		inputIndex: number,
		lockingScript: LockingScript
	): number[] {
		const input = tx.inputs[inputIndex];
		const sourceSatoshis = input.sourceTransaction?.outputs[input.sourceOutputIndex]?.satoshis || 0;

		return TransactionSignature.format({
			sourceTXID: input.sourceTXID || '',
			sourceOutputIndex: input.sourceOutputIndex,
			sourceSatoshis: sourceSatoshis,
			transactionVersion: tx.version,
			otherInputs: tx.inputs.filter((_, idx) => idx !== inputIndex),
			outputs: tx.outputs,
			inputIndex: inputIndex,
			subscript: new Script(lockingScript.chunks),
			inputSequence: input.sequence || 0xffffffff,
			lockTime: tx.lockTime,
			scope: SigHash.SIGHASH_ALL | SigHash.FORKID
		});
	}

	/**
	 * 检查脚本是否为有效的多签脚本
	 * @param script 要检查的脚本
	 * @returns 是否为有效的多签脚本
	 */
	export function tripleisValidMultisigScript(script: Script): boolean {
		try {
			const chunks = script.chunks;

			if (chunks.length < 4) {
				return false;
			}

			// 检查是否以适当的OP码开始和结束
			const firstOp = chunks[0];
			const lastOp = chunks[chunks.length - 1];

			// 应该以 OP_1 到 OP_16 开始（阈值）
			if (!firstOp || typeof firstOp !== 'object' || !('opCodeValue' in firstOp)) {
				return false;
			}

			// 应该以 OP_CHECKMULTISIG 结束
			if (!lastOp || typeof lastOp !== 'object' || !('opCodeValue' in lastOp)) {
				return false;
			}

			return true;
		} catch (error) {
			console.error('检查多签脚本时出错:', error);
			return false;
		}
	}

	/**
	 * 获取脚本摘要信息
	 * @param script 脚本对象
	 * @returns 脚本摘要
	 */
	export function triplegetScriptSummary(script: Script): {
		hex: string;
		size: number;
		chunks: number;
		isMultisig: boolean;
		asm: string;
	} {
		return {
			hex: script.toHex(),
			size: script.toBinary().length,
			chunks: script.chunks.length,
			isMultisig: tripleisValidMultisigScript(script),
			asm: script.toASM()
		};
	}

	/**
   * 创建多签锁定脚本 - 使用与MultiSig.createLockingScript相同的实现
   * @param publicKeys 公钥数组
   * @param threshold 阈值（需要多少个签名）
   * @returns 多签脚本
   */
	// public tripleCreateMultisigScript(publicKeys: PublicKey[], threshold: number): Script {
	// 	if (threshold <= 0 || threshold > publicKeys.length) {
	// 	  throw new Error(`无效的阈值: ${threshold}`);
	// 	}
	// 	if (publicKeys.length === 0 || publicKeys.length > 20) {
	// 	  throw new Error(`无效的公钥数量: ${publicKeys.length}`);
	// 	}

	// 	// 创建空脚本并添加 OP_m
	// 	const script = new Script([]);
	// 	script.writeOpCode(OP.OP_1 + threshold - 1); // OP_1 + (m-1) = OP_m

	// 	// 添加公钥
	// 	for (const pubKey of publicKeys) {
	// 	  script.writeBin(pubKey.toDER() as number[]);
	// 	}

	// 	script.writeOpCode(OP.OP_1 + publicKeys.length - 1) // OP_1 + (n-1) = OP_n
	// 	  .writeOpCode(OP.OP_CHECKMULTISIG);

	// 	return script;
	//   }
	
	  /**
	   * 创建假的多签解锁脚本，用于交易大小估算
	   * @param threshold 需要的签名数量
	   * @returns 假的解锁脚本
	   */
	//   public tripleCreateMultisigUnlockScript(threshold: number): Script {
	// 	const script = new Script([]);
		
	// 	// 添加 OP_0（多签的 off-by-one bug）
	// 	script.writeOpCode(OP.OP_0);
		
	// 	// 添加假签名
	// 	for (let i = 0; i < threshold; i++) {
	// 	  // 假签名：72字节的虚拟签名 + 1字节sighash标志
	// 	  const fakeSignature = new Array(72).fill(0x30).concat([SigHash.SIGHASH_ALL | SigHash.FORKID]);
	// 	  script.writeBin(fakeSignature);
	// 	}
		
	// 	return script;
	//   }
	
	  /**
	   * 创建 P2PKH 锁定脚本
	   * @param address 地址字符串
	   * @returns P2PKH 锁定脚本
	   */
	//   public triplecreateP2PKHScript(address: string): Script {
	// 	const script = new Script([]);
	// 	const addressHash = fromBase58Check(address).data as number[];
		
	// 	script.writeOpCode(OP.OP_DUP)
	// 		  .writeOpCode(OP.OP_HASH160)
	// 		  .writeBin(addressHash)
	// 		  .writeOpCode(OP.OP_EQUALVERIFY)
	// 		  .writeOpCode(OP.OP_CHECKSIG);
		
	// 	return script;
	//   }
// }
