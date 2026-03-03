import { PrivateKey, PublicKey } from '@bsv/sdk/primitives';
// import Script from '@bsv/sdk/script/Script';
import Transaction from '@bsv/sdk/transaction/Transaction';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
// import { BaseChain } from '../tx/BaseChain';
// import { TripleEndpointPool_3server_sign } from './triple_endpoint_pool_3server_sign';
// import OP from '@bsv/sdk/script/OP';
// import LockingScript from '@bsv/sdk/script/LockingScript';
// import UnlockingScript from '@bsv/sdk/script/UnlockingScript';
import MultiSig from '../libs/MULTISIG';

// 定义 SigHash 常量，与 Go SDK 保持一致
const SigHash = {
	SIGHASH_ALL: TransactionSignature.SIGHASH_ALL,
	FORKID: TransactionSignature.SIGHASH_FORKID
};

/**
 * TripleEndpointPool_4client_spend_tx_update 类用于更新和重新签名三方多签交易
 * 这个类主要处理交易的更新、金额分配和客户端重新签名
 *
 * 主要功能：
 * 1. 从 hex 字符串加载交易并更新参数
 * 2. 更新交易的锁定时间、序列号和输出金额
 * 3. 客户端重新签名更新后的交易
 * 4. 支持不同的签名场景（A方签名、通用客户端签名）
 *
 * 与 Go 版本对应的函数：
 * - tripleFeePoolLoadTx -> TripleFeePoolLoadTx
 * - clientATripleFeePoolSpendTXUpdateSign -> ClientATripleFeePoolSpendTXUpdateSign
 * - clientTripleFeePoolSpendTXUpdateSign -> ClientTripleFeePoolSpendTXUpdateSign
 */
// export class TripleEndpointPool_4client_spend_tx_update extends TripleEndpointPool_3server_sign {


	/**
	 * 从 hex 字符串加载交易并更新参数
	 * 合成两个签名的准备工作
	 *
	 * @param txHex 交易的十六进制字符串
	 * @param serverPublicKey 服务器公钥
	 * @param aPublicKey A方公钥
	 * @param bPublicKey B方公钥
	 * @param targetAmount 输入的目标金额
	 * @param locktime 可选的锁定时间
	 * @param sequenceNumber 序列号
	 * @param serverAmount 服务器分配的金额
	 * @returns 更新后的交易对象
	 */
	export async function tripleFeePoolLoadTx(
		bTx: Transaction,
		serverPublicKey: PublicKey,
		aPublicKey: PublicKey,
		bPublicKey: PublicKey,
		targetAmount: number,
		locktime?: number,
		sequenceNumber: number = 0xffffffff,
		serverAmount: number = 0
	): Promise<Transaction> {
		try {
			// 从 hex 恢复交易
			// const bTx = Transaction.fromHex(txHex);

			// 更新锁定时间（如果提供）
			if (locktime !== undefined) {
				bTx.lockTime = locktime;
			}

			// 创建多签脚本 - 使用 MultiSig 类
			const priorityScript = new MultiSig().lock([serverPublicKey, aPublicKey, bPublicKey], 2);

			// 设置输入的源交易输出信息
			if (!bTx.inputs[0].sourceTransaction) {
				bTx.inputs[0].sourceTransaction = new Transaction();
				bTx.inputs[0].sourceTransaction.outputs = [];
			}

			bTx.inputs[0].sourceTransaction.outputs[0] = {
				satoshis: targetAmount,
				lockingScript: priorityScript
			};
			console.log("targetAmount:", targetAmount);

			// 更新序列号
			bTx.inputs[0].sequence = sequenceNumber;

			// 更新输出金额分配
			if (bTx.outputs.length >= 2 && serverAmount > 0) {
				const allAmount = (bTx.outputs[0].satoshis || 0) + (bTx.outputs[1].satoshis || 0);
				console.log(`总金额: ${allAmount}, 服务器分配: ${serverAmount}`);

				bTx.outputs[0].satoshis = serverAmount;
				bTx.outputs[1].satoshis = allAmount - serverAmount;

				console.log(
					`输出分配 - 服务器: ${bTx.outputs[0].satoshis}, 客户端: ${bTx.outputs[1].satoshis}`
				);
			}

			console.log('交易加载和更新完成:', bTx.toHex());

			return bTx;
		} catch (error) {
			throw new Error(`加载交易失败: ${error}`);
		}
	}

	/**
	 * 客户端A方对三方费用池花费交易进行更新签名
	 * 用于客户端 -> 服务器修改金额和版本号后的重新签名
	 *
	 * @param tx 要签名的交易对象
	 * @param serverPublicKey 服务器公钥
	 * @param aPrivateKey A方私钥
	 * @param bPublicKey B方公钥
	 * @returns A方签名字节
	 */
	export async function tripleClientAFeePoolSpendTXUpdateSign(
		tx: Transaction,
		serverPublicKey: PublicKey,
		aPrivateKey: PrivateKey,
		bPublicKey: PublicKey
	): Promise<Buffer> {
		try {
			const aPublicKey = aPrivateKey.toPublicKey();

			// 创建多签脚本 - 使用 MultiSig 类
			// const multisigScript = new MultiSig().lock([serverPublicKey, aPublicKey, bPublicKey], 2);

			// // 获取源交易输出的金额
			// const sourceSatoshis = tx.inputs[0].sourceTransaction?.outputs[0]?.satoshis || 0;
			// console.log("aSourceSatoshis:", sourceSatoshis);

			// 创建签名哈希数据
			// const sighashData = TransactionSignature.format({
			// 	sourceTXID: tx.inputs[0].sourceTXID || '',
			// 	sourceOutputIndex: tx.inputs[0].sourceOutputIndex,
			// 	sourceSatoshis: sourceSatoshis,
			// 	transactionVersion: tx.version,
			// 	otherInputs: [],
			// 	outputs: tx.outputs,
			// 	inputIndex: 0,
			// 	subscript: multisigScript,
			// 	inputSequence: tx.inputs[0].sequence || 0xffffffff,
			// 	lockTime: tx.lockTime,
			// 	scope: SigHash.SIGHASH_ALL | SigHash.FORKID
			// });
			// A方签名

			const aSignature = new MultiSig().signOne(tx, 0, aPrivateKey, TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID);

			// 构造签名字节（包含sighash标志）
			// const aSignatureDER = aSignature.toDER() as number[];
			// const clientSignBytes = [...aSignatureDER, SigHash.SIGHASH_ALL | SigHash.FORKID];

			console.log('客户端A方重新签名完成');

			return aSignature;
		} catch (error) {
			throw new Error(`客户端A方签名失败: ${error}`);
		}
	}

	/**
	 * 客户端对三方费用池花费交易进行更新签名（通用版本）
	 * 用于 GetLatestTripleCostPoolHistory 函数中，由客户端对三方费用池进行签名
	 *
	 * @param tx 要签名的交易对象
	 * @param serverPublicKey 服务器公钥
	 * @param aNodePublicKey A节点公钥
	 * @param bNodePublicKey B节点公钥
	 * @param signPrivateKey 签名私钥
	 * @returns 客户端签名字节
	 */
	export async function tripleClientFeePoolSpendTXUpdateSign(
		tx: Transaction,
		serverPublicKey: PublicKey,
		aNodePublicKey: PublicKey,
		bNodePublicKey: PublicKey,
		signPrivateKey: PrivateKey
	): Promise<Buffer> {
		try {
			// 创建多签脚本 - 注意这里的公钥顺序与 Go 版本保持一致
			// Go 版本中是：[ANodePublicKey, BNodePublicKey, ServerPublicKey]
			// const multisigScript = new MultiSig().lock([aNodePublicKey, bNodePublicKey, serverPublicKey], 2);

			// // 获取源交易输出的金额
			// const sourceSatoshis = tx.inputs[0].sourceTransaction?.outputs[0]?.satoshis || 0;

			// // 创建签名哈希数据
			// const sighashData = TransactionSignature.format({
			// 	sourceTXID: tx.inputs[0].sourceTXID || '',
			// 	sourceOutputIndex: tx.inputs[0].sourceOutputIndex,
			// 	sourceSatoshis: sourceSatoshis,
			// 	transactionVersion: tx.version,
			// 	otherInputs: [],
			// 	outputs: tx.outputs,
			// 	inputIndex: 0,
			// 	subscript: multisigScript,
			// 	inputSequence: tx.inputs[0].sequence || 0xffffffff,
			// 	lockTime: tx.lockTime,
			// 	scope: SigHash.SIGHASH_ALL | SigHash.FORKID
			// });

			// 客户端签名
			// const clientSignature = signPrivateKey.sign(sighashData);
			const clientSignature = new MultiSig().signOne(tx, 0, signPrivateKey, TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID);

			// 构造签名字节（包含sighash标志）
			// const clientSignatureDER = clientSignature.toDER() as number[];
			// const clientSignBytes = [...clientSignatureDER, SigHash.SIGHASH_ALL | SigHash.FORKID];

			// console.log('客户端重新签名完成');

			return clientSignature;
		} catch (error) {
			throw new Error(`客户端签名失败: ${error}`);
		}
	}

	/**
	 * 验证交易的基本有效性
	 * @param tx 要验证的交易
	 * @returns 验证结果
	 */
	export function triplevalidateTransaction(tx: Transaction): boolean {
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

			// 检查序列号是否设置
			if (tx.inputs[0].sequence === undefined) {
				console.warn('输入序列号未设置，使用默认值');
				tx.inputs[0].sequence = 0xffffffff;
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
	export function triplegetTransactionSummary(tx: Transaction): {
		txid: string;
		size: number;
		inputCount: number;
		outputCount: number;
		totalOutput: number;
		lockTime: number;
		version: number;
	} {
		const totalOutput = tx.outputs.reduce((sum, output) => sum + (output.satoshis || 0), 0);

		return {
			txid: tx.id('hex'),
			size: tx.toBinary().length,
			inputCount: tx.inputs.length,
			outputCount: tx.outputs.length,
			totalOutput,
			lockTime: tx.lockTime,
			version: tx.version
		};
	}
// }
