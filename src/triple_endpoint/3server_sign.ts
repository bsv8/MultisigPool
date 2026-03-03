import { PrivateKey, PublicKey } from '@bsv/sdk/primitives';
// import Script from '@bsv/sdk/script/Script';
import Transaction from '@bsv/sdk/transaction/Transaction';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
// import { TripleEndpointPool_2client_spend_tx } from './triple_endpoint_pool_2client_spend_tx';
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
 * TripleEndpointPool_3server_sign 类用于服务器端签名三方多签交易
 * 这是服务器对已有交易进行回签的功能
 *
 * 主要功能：
 * 1. 接收已经有A方签名的交易
 * 2. 进行B方（服务器）签名
 * 3. 返回B方签名字节
 *
 * 与 Go 版本对应的函数：
 * - spendTXTripleFeePoolBSign -> SpendTXTripleFeePoolBSign
 */
// export class TripleEndpointPool_3server_sign extends TripleEndpointPool_2client_spend_tx {


	/**
	 * 创建多签锁定脚本
	 * @param publicKeys 公钥数组
	 * @param threshold 阈值（需要多少个签名）
	 * @returns 多签脚本
	 */
	// public tripleCreateMultisigScript(publicKeys: PublicKey[], threshold: number): Script {
	// 	const script = new Script([]);

	// 	// 添加阈值
	// 	if (threshold === 2) {
	// 		script.writeOpCode(OP.OP_2);
	// 	} else if (threshold === 3) {
	// 		script.writeOpCode(OP.OP_3);
	// 	} else {
	// 		throw new Error(`不支持的阈值: ${threshold}`);
	// 	}

	// 	// 添加公钥
	// 	for (const pubKey of publicKeys) {
	// 		script.writeBin(pubKey.toDER() as number[]);
	// 	}

	// 	// 添加公钥数量和 CHECKMULTISIG
	// 	if (publicKeys.length === 3) {
	// 		script.writeOpCode(OP.OP_3);
	// 	} else {
	// 		throw new Error(`不支持的公钥数量: ${publicKeys.length}`);
	// 	}

	// 	script.writeOpCode(OP.OP_CHECKMULTISIG);

	// 	return script;
	// }

	/**
	 * 服务器对三方多签花费交易进行 B 方签名
	 * @param transactionObject 要签名的交易对象
	 * @param targetAmount 目标金额
	 * @param serverPublicKey 服务器公钥
	 * @param aPublicKey A方公钥
	 * @param bPrivateKey B方私钥（服务器私钥）
	 * @returns B方签名字节
	 */
	export async function tripleSpendTXFeePoolBSign(
		tx: Transaction,
		targetAmount: number,
		serverPublicKey: PublicKey,
		aPublicKey: PublicKey,
		escrowPublicKey: PublicKey,
		bPrivateKey: PrivateKey
	): Promise<Buffer> {
		// 创建多签脚本 - 使用正确的公钥顺序
		const priorityScript = new MultiSig().lock([serverPublicKey, aPublicKey, escrowPublicKey], 2);

		console.log('创建优先级脚本成功');

		tx.inputs[0].sourceTransaction = new Transaction();
		tx.inputs[0].sourceTransaction.outputs = [];
		tx.inputs[0].sourceTransaction.outputs[0] = {
			satoshis: targetAmount,
			lockingScript: priorityScript
		};
		// tx.inputs[0].unlockingScript = priorityScript;
		

		// 设置输入的源交易输出信息
		// 注意：这里我们需要手动创建源交易输出信息，因为 ts-sdk 需要这些信息来进行签名
		// if (!transactionObject.inputs[0].sourceTransaction) {
		// 	transactionObject.inputs[0].sourceTransaction = new Transaction();
		// 	transactionObject.inputs[0].sourceTransaction.outputs = [];
		// }

		// // 设置源输出
		// // const priorityLockingScript = new LockingScript();
		// // priorityLockingScript.chunks = priorityScript.chunks;

		// transactionObject.inputs[0].sourceTransaction.outputs[0] = {
		// 	satoshis: targetAmount,
		// 	lockingScript: priorityScript
		// };

		// 创建签名哈希数据
		// const sighashData = TransactionSignature.format({
		// 	sourceTXID: transactionObject.inputs[0].sourceTXID || '',
		// 	sourceOutputIndex: transactionObject.inputs[0].sourceOutputIndex,
		// 	sourceSatoshis: targetAmount,
		// 	transactionVersion: transactionObject.version,
		// 	otherInputs: [],
		// 	outputs: transactionObject.outputs,
		// 	inputIndex: 0,
		// 	subscript: priorityScript,
		// 	inputSequence: transactionObject.inputs[0].sequence || 1,
		// 	lockTime: transactionObject.lockTime,
		// 	scope: SigHash.SIGHASH_ALL | SigHash.FORKID
		// });

		// // B方签名
		// const bSignature = bPrivateKey.sign(sighashData);

		// // 构造B方签名字节（包含sighash标志）
		// const bSignatureDER = bSignature.toDER() as number[];
		// const bSignatureBytes = [...bSignatureDER, SigHash.SIGHASH_ALL | SigHash.FORKID];

		// console.log('b 重新签名输入 1 成功 hex:', transactionObject.toHex());

		const bSignatureBytes = new MultiSig().signOne(tx, 0, bPrivateKey, TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID);

		return bSignatureBytes;
	}

	/**
	 * 合并 A 方和 B 方签名到交易中
	 * @param transactionObject 交易对象
	 * @param aSignatureBytes A方签名字节
	 * @param bSignatureBytes B方签名字节
	 * @param serverPublicKey 服务器公钥
	 * @param aPublicKey A方公钥
	 * @param bPublicKey B方公钥
	 * @returns 完整签名的交易
	 */
	// public async triplecombineSignatures(
	// 	transactionObject: Transaction,
	// 	aSignatureBytes: number[],
	// 	bSignatureBytes: number[],
	// 	serverPublicKey: PublicKey,
	// 	aPublicKey: PublicKey,
	// 	bPublicKey: PublicKey
	// ): Promise<Transaction> {
	// 	// 创建完整的多签解锁脚本
	// 	const unlockScript = new Script([]);

	// 	// 添加 OP_0（多签的 off-by-one bug）
	// 	unlockScript.writeOpCode(OP.OP_0);

	// 	// 添加A方签名
	// 	unlockScript.writeBin(aSignatureBytes);

	// 	// 添加B方签名
	// 	unlockScript.writeBin(bSignatureBytes);

	// 	// 添加赎回脚本（多签脚本本身）
	// 	const redeemScript = this.tripleCreateMultisigScript([serverPublicKey, aPublicKey, bPublicKey], 2);
	// 	unlockScript.writeBin(redeemScript.toBinary());

	// 	// 设置完整的解锁脚本
	// 	transactionObject.inputs[0].unlockingScript = new UnlockingScript();
	// 	transactionObject.inputs[0].unlockingScript.chunks = unlockScript.chunks;

	// 	console.log('合并签名完成，交易hex:', transactionObject.toHex());

	// 	return transactionObject;
	// }

	// /**
	//  * 验证多签交易的签名是否正确
	//  * @param transactionObject 交易对象
	//  * @param targetAmount 目标金额
	//  * @param serverPublicKey 服务器公钥
	//  * @param aPublicKey A方公钥
	//  * @param bPublicKey B方公钥
	//  * @returns 验证结果
	//  */
	// public async tripleverifySignatures(
	// 	transactionObject: Transaction,
	// 	targetAmount: number,
	// 	serverPublicKey: PublicKey,
	// 	aPublicKey: PublicKey,
	// 	bPublicKey: PublicKey
	// ): Promise<boolean> {
	// 	try {
	// 		// 这里可以添加签名验证逻辑
	// 		// 由于 ts-sdk 的验证机制可能与 Go SDK 不同，这里先返回 true
	// 		// 实际应用中可以通过广播测试来验证交易的有效性

	// 		console.log('验证交易签名...');
	// 		console.log('交易hex:', transactionObject.toHex());
	// 		console.log('交易大小:', transactionObject.toBinary().length, 'bytes');

	// 		// 基本检查：确保交易有解锁脚本
	// 		if (!transactionObject.inputs[0].unlockingScript) {
	// 			console.error('交易缺少解锁脚本');
	// 			return false;
	// 		}

	// 		// 检查输出金额是否合理
	// 		const totalOutput = transactionObject.outputs.reduce(
	// 			(sum, output) => sum + (output.satoshis || 0),
	// 			0
	// 		);
	// 		if (totalOutput <= 0) {
	// 			console.error('输出金额不合理');
	// 			return false;
	// 		}

	// 		console.log('基本验证通过');
	// 		return true;
	// 	} catch (error) {
	// 		console.error('验证签名时出错:', error);
	// 		return false;
	// 	}
	// }
// }
