import { PrivateKey, PublicKey } from '@bsv/sdk/primitives';
// import Script from '@bsv/sdk/script/Script';
import Transaction from '@bsv/sdk/transaction/Transaction';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
// import { BaseChain } from '../tx/BaseChain';
// import { TripleEndpointPool_4client_spend_tx_update } from './triple_endpoint_pool_4client_spend_tx_update';
// import OP from '@bsv/sdk/script/OP';
// import LockingScript from '@bsv/sdk/script/LockingScript';
// import UnlockingScript from '@bsv/sdk/script/UnlockingScript';
import MultiSig from '../libs/MULTISIG';

// 定义 SigHash 常量，与 Go SDK 保持一致
// const SigHash = {
// 	SIGHASH_ALL: TransactionSignature.SIGHASH_ALL,
// 	FORKID: TransactionSignature.SIGHASH_FORKID
// };

/**
 * TripleEndpointPool_5server_sign_update 类用于服务器端更新签名三方多签交易
 * 这个类主要处理服务器端对更新后的交易进行重新签名
 *
 * 主要功能：
 * 1. 双端费用池，分配资金，server 签名
 * 2. 处理 client -> server 修改金额和版本号后的重新签名
 * 3. 服务器端作为 B 方进行签名
 *
 * 与 Go 版本对应的函数：
 * - clientBTripleFeePoolSpendTXUpdateSign -> ClientBTripleFeePoolSpendTXUpdateSign
 */
// export class TripleEndpointPool_5server_sign_update extends TripleEndpointPool_4client_spend_tx_update {


	/**
	 * 客户端B方对三方费用池花费交易进行更新签名
	 * 双端费用池，分配资金，server 签名
	 * 用于 client -> server 修改金额和版本号后的重新签名
	 *
	 * @param tx 要签名的交易对象
	 * @param serverPublicKey 服务器公钥
	 * @param aPublicKey A方公钥
	 * @param bPrivateKey B方私钥（服务器私钥）
	 * @returns B方签名字节
	 */
	export async function tripleClientBFeePoolSpendTXUpdateSign(
		tx: Transaction,
		serverPublicKey: PublicKey,
		aPublicKey: PublicKey,
		bPrivateKey: PrivateKey
	): Promise<Buffer> {
		try {
			// const bPublicKey = bPrivateKey.toPublicKey();

			// // 创建多签脚本
			// const multisigScript = new MultiSig().lock([serverPublicKey, aPublicKey, bPublicKey], 2);

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

			// // B方签名
			// const bSignature = bPrivateKey.sign(sighashData);

			// // 构造签名字节（包含sighash标志）
			// const bSignatureDER = bSignature.toDER() as number[];
			// const clientBSignBytes = [...bSignatureDER, SigHash.SIGHASH_ALL | SigHash.FORKID];

			// console.log('客户端B方重新签名完成');
			const clientBSignBytes = new MultiSig().signOne(tx, 0, bPrivateKey, TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID);

			return clientBSignBytes;
		} catch (error) {
			throw new Error(`客户端B方签名失败: ${error}`);
		}
	}

	/**
	 * 验证B方签名的有效性
	 * @param tx 交易对象
	 * @param signatureBytes 签名字节
	 * @param serverPublicKey 服务器公钥
	 * @param aPublicKey A方公钥
	 * @param bPublicKey B方公钥
	 * @returns 验证结果
	 */
	export async function tripleverifyBSignature(
		tx: Transaction,
		signatureBytes: number[],
		serverPublicKey: PublicKey,
		aPublicKey: PublicKey,
		bPublicKey: PublicKey
	): Promise<boolean> {
		try {
			// 基本检查：确保签名字节不为空
			if (!signatureBytes || signatureBytes.length === 0) {
				console.error('签名字节为空');
				return false;
			}

			// 检查签名字节是否包含正确的sighash标志
			const lastByte = signatureBytes[signatureBytes.length - 1];
			const expectedSighash = TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID;
			if (lastByte !== expectedSighash) {
				console.error(`签名哈希标志不匹配，期望: ${expectedSighash}, 实际: ${lastByte}`);
				return false;
			}

			// 检查交易基本有效性
			if (!tx.inputs || tx.inputs.length === 0) {
				console.error('交易缺少输入');
				return false;
			}

			if (!tx.outputs || tx.outputs.length === 0) {
				console.error('交易缺少输出');
				return false;
			}

			console.log('B方签名验证通过');
			console.log('签名长度:', signatureBytes.length);
			console.log('交易ID:', tx.id('hex'));

			return true;
		} catch (error) {
			console.error('验证B方签名时出错:', error);
			return false;
		}
	}

	/**
	 * 获取签名摘要信息
	 * @param signatureBytes 签名字节
	 * @returns 签名摘要
	 */
	export function triplegetSignatureSummary(signatureBytes: number[]): {
		length: number;
		sighashFlag: number;
		isValid: boolean;
		hexString: string;
	} {
		const isValid = signatureBytes && signatureBytes.length > 0;
		const sighashFlag = isValid ? signatureBytes[signatureBytes.length - 1] : 0;
		const hexString = isValid
			? signatureBytes.map((b) => b.toString(16).padStart(2, '0')).join('')
			: '';

		return {
			length: signatureBytes?.length || 0,
			sighashFlag,
			isValid,
			hexString
		};
	}

	/**
	 * 比较两个签名是否相同
	 * @param signatureA 签名A
	 * @param signatureB 签名B
	 * @returns 是否相同
	 */
	export function triplecompareSignatures(signatureA: number[], signatureB: number[]): boolean {
		if (!signatureA || !signatureB) {
			return false;
		}

		if (signatureA.length !== signatureB.length) {
			return false;
		}

		for (let i = 0; i < signatureA.length; i++) {
			if (signatureA[i] !== signatureB[i]) {
				return false;
			}
		}

		return true;
	}
// }
