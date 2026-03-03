import { PrivateKey, PublicKey } from '@bsv/sdk/primitives';
import Script from '@bsv/sdk/script/Script';
import Transaction from '@bsv/sdk/transaction/Transaction';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
import { hash256 } from '@bsv/sdk/primitives/Hash';
import * as ECDSA from '@bsv/sdk/primitives/ECDSA';
import BigNumber from '@bsv/sdk/primitives/BigNumber';
// import { BaseChain } from '../tx/BaseChain';
import type { UTXO, BuildDualFeePoolBaseTxResponse } from '../types';
// import { API } from '../2api/api';
import OP from '@bsv/sdk/script/OP';
import LockingScript from '@bsv/sdk/script/LockingScript';
import UnlockingScript from '@bsv/sdk/script/UnlockingScript';
// import { TripleEndpointPool } from '../triple_endpoint';

// 定义 SigHash 常量，与 Go SDK 保持一致
// const SigHash = {
// 	SIGHASH_ALL: TransactionSignature.SIGHASH_ALL,
// 	FORKID: TransactionSignature.SIGHASH_FORKID
// };

/**
 * DualEndpointPool_1base_tx 类用于创建双端多签基础交易
 * 这是一个 2-of-2 多签实现，需要双方签名才能解锁资金
 *
 * 主要功能：
 * 1. 从客户端 P2PKH UTXO 创建到双端多签输出
 * 2. 自动计算和处理交易费用
 * 3. 创建 2-of-2 多签锁定脚本
 * 4. 完整的交易签名流程
 *
 * 与 Go 版本对应的函数：
 * - buildDualFeePoolBaseTx -> BuildDualFeePoolBaseTx
 */
// export class DualEndpointPool_1base_tx  {
// 	private feeRate: number;

// 	constructor(feeRate: number = 0.5) {
// 		this.feeRate = feeRate;
// 	}

// 	/**
// 	 * 构造函数
// 	 * @param isMainnet 是否使用主网
// 	 * @param feeRate 费率（sat/byte），默认为 0.5
// 	 */
// 	// constructor(isMainnet: boolean, apiType: 'bitails' | 'whatsonchain', feeRate: number = 0.5) {
// 	// 	super(isMainnet, apiType);
// 	// 	this.feeRate = feeRate;
// 	// }

	/**
	 * 创建双端多签锁定脚本（2-of-2）
	 * @param publicKeys 公钥数组
	 * @returns 多签脚本
	 */
	export function createDualMultisigScript(publicKeys: PublicKey[]): Script {
		if (publicKeys.length !== 2) {
			throw new Error(`双端多签需要恰好2个公钥，当前有: ${publicKeys.length}`);
		}

		const script = new Script([]);

		// 添加阈值 OP_2（需要2个签名）
		script.writeOpCode(OP.OP_2);

		// 添加两个公钥
		for (const pubKey of publicKeys) {
			script.writeBin(pubKey.toDER() as number[]);
		}

		// 添加公钥数量 OP_2 和 CHECKMULTISIG
		script.writeOpCode(OP.OP_2);
		script.writeOpCode(OP.OP_CHECKMULTISIG);

		return script;
	}

	/**
	 * 创建 P2PKH 锁定脚本
	 * @param address 地址字符串
	 * @returns P2PKH 锁定脚本
	 */
	export async function createP2PKHScript(address: string): Promise<Script> {
		const script = new Script([]);
		const { fromBase58Check } = await import('@bsv/sdk/primitives/utils');
		const addressHash = fromBase58Check(address).data as number[];

		script
			.writeOpCode(OP.OP_DUP)
			.writeOpCode(OP.OP_HASH160)
			.writeBin(addressHash)
			.writeOpCode(OP.OP_EQUALVERIFY)
			.writeOpCode(OP.OP_CHECKSIG);

		return script;
	}

	/**
	 * 构建双端费用池基础交易
	 * p2pkh to 2-of-2 多签，不找零
	 *
	 * @param clientUtxos 客户端 UTXO 列表（发起者提供的金额就是这些 UTXO 的全额）
	 * @param clientPrivateKey 客户端私钥
	 * @param serverPublicKey 服务器公钥
	 * @param feepoolAmount 费用池金额
	 * @param feeRate 费率（sat/byte）
	 * @returns 构建的交易、金额和输出索引
	 */
	export async function buildDualFeePoolBaseTx(
		clientUtxos: UTXO[],
		clientPrivateKey: PrivateKey,
		serverPublicKey: PublicKey,
		feepoolAmount: number,
		feeRate: number,
	): Promise<BuildDualFeePoolBaseTxResponse> {
		// 检查输入参数
		if (!clientUtxos || clientUtxos.length === 0) {
			throw new Error('客户端 UTXO 列表不能为空');
		}

		const clientPublicKey = clientPrivateKey.toPublicKey();
		const clientAddress = clientPublicKey.toAddress();

		console.log('构建双端费用池基础交易');
		console.log(`客户端地址: ${clientAddress}`);
		console.log(`服务器地址: ${serverPublicKey.toAddress()}`);

		// 创建交易对象
		const tx = new Transaction();

		// 添加客户端 UTXOs 作为输入
		let totalValue = 0;
		for (const utxo of clientUtxos) {
			tx.addInput({
				sourceTXID: utxo.txid,
				sourceOutputIndex: utxo.vout,
				unlockingScript: new UnlockingScript(), // 临时的，后续会替换
				sequence: 0xffffffff
			});
			totalValue += utxo.satoshis;
		}

		console.log(`总输入金额: ${totalValue} satoshis`);

		// 创建 2-of-2 多签输出脚本
		const multisigScript = createDualMultisigScript([serverPublicKey, clientPublicKey]);

		if (totalValue < feepoolAmount) {
			throw new Error(`余额不足，费用池金额 ${feepoolAmount}，拥有 ${totalValue}`);
		}

		// 添加主输出（费用池）
		const multisigLockingScript = new LockingScript();
		multisigLockingScript.chunks = multisigScript.chunks;
		tx.addOutput({
			lockingScript: multisigLockingScript,
			satoshis: feepoolAmount
		});

		// 添加找零输出（先不扣手续费，用于估算大小）
		const changeLockingScript = new LockingScript();
		const sourceP2PKH = await createP2PKHScript(clientAddress);
		changeLockingScript.chunks = sourceP2PKH.chunks;
		const initialChange = Math.max(0, totalValue - feepoolAmount);
		tx.addOutput({
			lockingScript: changeLockingScript,
			satoshis: initialChange
		});

		// 为每个输入创建签名，以便正确估计交易大小
		for (let i = 0; i < tx.inputs.length; i++) {
			const utxo = clientUtxos[i];

			// 创建 P2PKH 解锁脚本
			const p2pkhScript = new Script([]);

			// 创建源交易输出信息
			if (!tx.inputs[i].sourceTransaction) {
				tx.inputs[i].sourceTransaction = new Transaction();
				tx.inputs[i].sourceTransaction!.outputs = [];
			}

			// 创建源输出的 P2PKH 锁定脚本
			const sourceLockingScript = await createP2PKHScript(clientAddress);
			const sourceP2PKHLocking = new LockingScript();
			sourceP2PKHLocking.chunks = sourceLockingScript.chunks;

			// 确保输出数组有足够的长度
			while (tx.inputs[i].sourceTransaction!.outputs.length <= utxo.vout) {
				tx.inputs[i].sourceTransaction!.outputs.push({
					satoshis: 0,
					lockingScript: new LockingScript()
				});
			}

			tx.inputs[i].sourceTransaction!.outputs[utxo.vout] = {
				satoshis: utxo.satoshis,
				lockingScript: sourceP2PKHLocking
			};

			// 创建签名哈希数据
			const sighashData = TransactionSignature.format({
				sourceTXID: utxo.txid,
				sourceOutputIndex: utxo.vout,
				sourceSatoshis: utxo.satoshis,
				transactionVersion: tx.version,
				otherInputs: tx.inputs.filter((_, idx) => idx !== i),
				outputs: tx.outputs,
				inputIndex: i,
				subscript: sourceLockingScript,
				inputSequence: tx.inputs[i].sequence || 0xffffffff,
				lockTime: tx.lockTime,
				scope: TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID
			});

			// 客户端签名（双SHA256后，避免再次哈希）
			const msgHash = hash256(sighashData);
			const signature = ECDSA.sign(new BigNumber(msgHash, 16), clientPrivateKey, true);

			// 构造 P2PKH 解锁脚本
			const signatureDER = signature.toDER() as number[];
			const signatureBytes = [...signatureDER, TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID];

			p2pkhScript.writeBin(signatureBytes);
			p2pkhScript.writeBin(clientPublicKey.toDER() as number[]);

			// 设置解锁脚本
			tx.inputs[i].unlockingScript = new UnlockingScript();
			tx.inputs[i].unlockingScript!.chunks = p2pkhScript.chunks;
		}

		// 计算交易大小和费用
		const txSize = tx.toBinary().length;
		let fee = Math.floor((txSize / 1000.0) * feeRate);
		if (fee === 0) {
			fee = 1; // 最低手续费为 1 satoshi
		}

		console.log(`交易大小: ${txSize} bytes`);
		console.log(`计算手续费: ${fee} satoshis (费率: ${feeRate} sat/byte)`);

		if (totalValue < feepoolAmount + fee) {
			throw new Error(`余额不足，需要 费用池 ${feepoolAmount} + 手续费 ${fee}，拥有 ${totalValue}`);
		}

		// 更新找零金额：总额 - 费用池 - 手续费
		tx.outputs[1].satoshis = totalValue - feepoolAmount - fee;

		// 重新签名所有输入（因为输出金额变化了）
		for (let i = 0; i < tx.inputs.length; i++) {
			const utxo = clientUtxos[i];

			// 创建 P2PKH 解锁脚本
			const p2pkhScript = new Script([]);

			// 获取源锁定脚本
			const sourceLockingScript = await createP2PKHScript(clientAddress);

			// 重新创建签名哈希数据
			const sighashData = TransactionSignature.format({
				sourceTXID: utxo.txid,
				sourceOutputIndex: utxo.vout,
				sourceSatoshis: utxo.satoshis,
				transactionVersion: tx.version,
				otherInputs: tx.inputs.filter((_, idx) => idx !== i),
				outputs: tx.outputs,
				inputIndex: i,
				subscript: sourceLockingScript,
				inputSequence: tx.inputs[i].sequence || 0xffffffff,
				lockTime: tx.lockTime,
				scope: TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID
			});

			// 重新签名
			const msgHash2 = hash256(sighashData);
			const signature = ECDSA.sign(new BigNumber(msgHash2, 16), clientPrivateKey, true);

			// 构造 P2PKH 解锁脚本
			const signatureDER = signature.toDER() as number[];
			const signatureBytes = [...signatureDER, TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID];

			p2pkhScript.writeBin(signatureBytes);
			p2pkhScript.writeBin(clientPublicKey.toDER() as number[]);

			// 更新解锁脚本
			tx.inputs[i].unlockingScript = new UnlockingScript();
			tx.inputs[i].unlockingScript!.chunks = p2pkhScript.chunks;
		}

		const finalAmount = feepoolAmount;

		console.log('双端费用池基础交易构建完成');
		console.log(`交易ID: ${tx.id('hex')}`);
		console.log(`最终金额: ${finalAmount} satoshis`);
		console.log(`手续费: ${fee} satoshis`);

		return {
			tx,
			amount: finalAmount,
			index: 0 // 多签输出的索引（费用池）
		};
	}

	/**
	 * 验证交易的基本有效性
	 * @param tx 要验证的交易
	 * @returns 验证结果
	 */
	export function validateTransaction(tx: Transaction): boolean {
		try {
			// 检查交易是否有输入和输出
			if (!tx.inputs || tx.inputs.length === 0) {
				console.error('交易缺少输入');
				return false;
			}

			if (!tx.outputs || tx.outputs.length === 0) {
				console.error('交易缺少输出');
				return false;
			}

			// 检查输出金额是否合理
			const totalOutput = tx.outputs.reduce((sum, output) => sum + (output.satoshis || 0), 0);
			if (totalOutput <= 0) {
				console.error('输出金额不合理');
				return false;
			}

			// 检查是否所有输入都有解锁脚本
			for (let i = 0; i < tx.inputs.length; i++) {
				if (!tx.inputs[i].unlockingScript) {
					console.error(`输入 ${i} 缺少解锁脚本`);
					return false;
				}
			}

			console.log('交易基本验证通过');
			return true;
		} catch (error) {
			console.error('验证交易时出错:', error);
			return false;
		}
	}

	/**
	 * 获取交易摘要信息
	 * @param tx 交易对象
	 * @returns 交易摘要
	 */
	export function getTransactionSummary(tx: Transaction): {
		txid: string;
		size: number;
		inputCount: number;
		outputCount: number;
		totalOutput: number;
		version: number;
		lockTime: number;
	} {
		const totalOutput = tx.outputs.reduce((sum, output) => sum + (output.satoshis || 0), 0);

		return {
			txid: tx.id('hex'),
			size: tx.toBinary().length,
			inputCount: tx.inputs.length,
			outputCount: tx.outputs.length,
			totalOutput,
			version: tx.version,
			lockTime: tx.lockTime
		};
	}
// }
