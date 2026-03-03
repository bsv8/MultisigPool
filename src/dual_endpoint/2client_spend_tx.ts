import { PrivateKey, PublicKey } from '@bsv/sdk/primitives';
import Script from '@bsv/sdk/script/Script';
import Transaction from '@bsv/sdk/transaction/Transaction';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
// import { BaseChain } from '../tx/BaseChain';
// import type { UTXO, BuildDualFeePoolBaseTxResponse } from '../tx/types';
// import { API } from '../2api/api';
import OP from '@bsv/sdk/script/OP';
import LockingScript from '@bsv/sdk/script/LockingScript';
import UnlockingScript from '@bsv/sdk/script/UnlockingScript';
import { fromBase58Check } from '@bsv/sdk/primitives/utils';
import { hash256 } from '@bsv/sdk/primitives/Hash';
import * as ECDSA from '@bsv/sdk/primitives/ECDSA';
import BigNumber from '@bsv/sdk/primitives/BigNumber';
import { createDualMultisigScript, createP2PKHScript } from './1base_tx';

// 定义 SigHash 常量，与 Go SDK 保持一致
// const SigHash = {
// 	SIGHASH_ALL: TransactionSignature.SIGHASH_ALL,
// 	FORKID: TransactionSignature.SIGHASH_FORKID
// };

// 定义返回类型
interface BuildDualSpendTxResponse {
	tx: Transaction;
	amount: number;
}

interface DualSpendTxResponse {
	tx: Transaction;
	clientSignBytes: number[];
	amount: number;
}

/**
 * DualEndpointPool_2client_spend_tx 类用于创建双端多签花费交易
 * 这是从双端多签 UTXO 中花费资金到客户端和服务器地址
 * 
 * 与 Go 版本对应的函数：
 * - subBuildDualFeePoolSpendTX -> SubBuildDualFeePoolSpendTX
 * - spendTXDualFeePoolClientSign -> SpendTXDualFeePoolClientSign
 * - buildDualFeePoolSpendTX -> BuildDualFeePoolSpendTX
 */
// export class DualEndpointPool_2client_spend_tx extends DualEndpointPool_1base_tx {
	

	/**
	 * 创建假的多签解锁脚本，用于交易大小估算
	 * @returns 假的解锁脚本
	 */
	export function createFakeDualMultisigUnlockScript(): Script {
		const script = new Script([]);

		// 添加 OP_0（多签的 off-by-one bug）
		script.writeOpCode(OP.OP_0);

		// 添加两个假签名
		for (let i = 0; i < 2; i++) {
			// 假签名：72字节的虚拟签名 + 1字节sighash标志（与Go保持一致，使用0x00）
			const fakeSignature = new Array(72).fill(0x00).concat([0x00]);
			script.writeBin(fakeSignature);
		}

		return script;
	}

	/**
	 * 构建双端多签花费交易（子函数）
	 * 多签 to client，server 提供金额
	 * 
	 * @param prevTxId 前一个交易ID
	 * @param serverValue 服务器提供的金额
	 * @param endHeight 锁定到的区块高度
	 * @param clientPrivateKey 客户端私钥
	 * @param serverPublicKey 服务器公钥
	 * @returns 构建的交易和金额
	 */
	export async function subBuildDualFeePoolSpendTX(
		prevTxId: string,
		totalAmount: number, // 多签 UTXO 总金额
		serverAmount: number, // 服务器获得的金额
		endHeight: number,
		clientPrivateKey: PrivateKey,
		serverPublicKey: PublicKey,
		feeRate: number,
	): Promise<BuildDualSpendTxResponse> {
		const clientPublicKey = clientPrivateKey.toPublicKey();
		const clientAddress = clientPublicKey.toAddress();
		const serverAddress = serverPublicKey.toAddress();

		// 创建交易对象
		const tx = new Transaction();
		tx.lockTime = endHeight;

		// 创建前一个交易的双端多签锁定脚本
		const prevMultisigScript = createDualMultisigScript([serverPublicKey, clientPublicKey]);

		// 添加输入（双端多签 UTXO）
		tx.addInput({
			sourceTXID: prevTxId,
			sourceOutputIndex: 0,
			unlockingScript: new UnlockingScript(), // 临时的，后续会替换
			sequence: 1 // 设置序列号为1
		});

		// 创建服务器找零脚本（P2PKH）
		const serverChangeScript = await createP2PKHScript(serverAddress);

		// 添加服务器输出
		const serverLockingScript = new LockingScript();
		serverLockingScript.chunks = serverChangeScript.chunks;
		tx.addOutput({
			lockingScript: serverLockingScript,
			satoshis: serverAmount
		});

		// 创建客户端找零脚本（P2PKH）
		const clientChangeScript = await createP2PKHScript(clientAddress);

		// 添加客户端输出
		const clientLockingScript = new LockingScript();
		clientLockingScript.chunks = clientChangeScript.chunks;
		tx.addOutput({
			lockingScript: clientLockingScript,
			satoshis: totalAmount - serverAmount
		});

		// 创建假的解锁脚本来估算交易大小
		const fakeUnlockScript = createFakeDualMultisigUnlockScript();
		tx.inputs[0].unlockingScript = new UnlockingScript();
		tx.inputs[0].unlockingScript.chunks = fakeUnlockScript.chunks;

		// 计算交易大小和费用
		const txSize = tx.toBinary().length;
		let fee = Math.floor((txSize / 1000.0) * feeRate);

		if (totalAmount < serverAmount + fee) {
			throw new Error(`余额不足，需要 ${serverAmount + fee} (serverAmount ${serverAmount} + fee ${fee})，拥有 ${totalAmount}`);
		}

		if (fee === 0) {
			fee = 1; // 最低手续费为 1 satoshi
		}

		// 更新客户端输出金额（扣除手续费）
		tx.outputs[1].satoshis = totalAmount - serverAmount - fee;

		// 清空假解锁脚本，防止广播时出现非规范 DER 签名错误，后续由真实签名填充
		tx.inputs[0].unlockingScript = new UnlockingScript();

		return {
			tx,
			amount: totalAmount - serverAmount - fee
		};
	}

	/**
	 * 双端费用池花费交易客户端签名
	 * 
	 * @param bTx 要签名的交易
	 * @param targetAmount 目标金额
	 * @param clientPrivKey 客户端私钥
	 * @param serverPublicKey 服务器公钥
	 * @returns 客户端签名字节
	 */
	export async function spendTXDualFeePoolClientSign(
		bTx: Transaction,
		totalAmount: number,
		clientPrivKey: PrivateKey,
		serverPublicKey: PublicKey
	): Promise<number[]> {
		const clientPublicKey = clientPrivKey.toPublicKey();

		// 创建双端多签脚本
		const priorityScript = createDualMultisigScript([serverPublicKey, clientPublicKey]);

		// 设置输入的源交易输出信息
		if (!bTx.inputs[0].sourceTransaction) {
			bTx.inputs[0].sourceTransaction = new Transaction();
			bTx.inputs[0].sourceTransaction.outputs = [];
		}

		// 设置源输出
		const priorityLockingScript = new LockingScript();
		priorityLockingScript.chunks = priorityScript.chunks;

		bTx.inputs[0].sourceTransaction.outputs[0] = {
			satoshis: totalAmount,
			lockingScript: priorityLockingScript
		};

		// 创建签名哈希数据
		const sighashData = TransactionSignature.format({
			sourceTXID: bTx.inputs[0].sourceTXID || '',
			sourceOutputIndex: bTx.inputs[0].sourceOutputIndex,
			sourceSatoshis: totalAmount,
			transactionVersion: bTx.version,
			otherInputs: [],
			outputs: bTx.outputs,
			inputIndex: 0,
			subscript: priorityScript,
			inputSequence: bTx.inputs[0].sequence || 1,
			lockTime: bTx.lockTime,
			scope: TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID
		});

		// 生成双 SHA256 哈希
        const msgHash = hash256(sighashData);
        // 客户端确定性签名（RFC6979）
        const clientSignature = ECDSA.sign(new BigNumber(msgHash, 16), clientPrivKey, true);

        // 构造客户端签名字节（包含sighash标志）
        const clientSignatureDER = clientSignature.toDER() as number[];
		const clientSignBytes = [...clientSignatureDER, TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID];

		return clientSignBytes;
	}

	/**
	 * 构建双端费用池花费交易（主函数）
	 * 发起者 utxos, 服务器提供金额， 发起者私钥， 服务器地址
	 * fee 是 server 提供，我只负责精确的金额
	 * 
	 * @param aTx A方的基础交易
	 * @param serverValue 服务器提供的金额
	 * @param endHeight 锁定到的区块高度
	 * @param clientPrivateKey 客户端私钥
	 * @param serverPublicKey 服务器公钥
	 * @returns 完整的交易、客户端签名和金额
	 */
	export async function buildDualFeePoolSpendTX(
		aTx: Transaction,
		totalAmount: number,
		serverAmount: number,
		endHeight: number,
		clientPrivateKey: PrivateKey,
		serverPublicKey: PublicKey,
		feeRate: number,
	): Promise<DualSpendTxResponse> {
		try {
			// 构建交易
			const { tx: txTwo, amount } = await subBuildDualFeePoolSpendTX(
				aTx.id('hex'),
				totalAmount,
				serverAmount,
				endHeight,
				clientPrivateKey,
				serverPublicKey,
				feeRate
			);

			console.log('BuildOneB success');

			// 进行客户端签名
			const clientSignBytes = await spendTXDualFeePoolClientSign(
				txTwo,
				totalAmount,
				clientPrivateKey,
				serverPublicKey
			);

			return {
				tx: txTwo,
				clientSignBytes,
				amount
			};
		} catch (error) {
			console.error('BuildDualFeePoolSpendTX error:', error);
			throw error;
		}
	}
// }